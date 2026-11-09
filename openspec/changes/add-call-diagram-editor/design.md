# Design

## Context

See proposal.md - Why. Relevant current state and dependencies:

- `TreemapPanel` (`src/panels/TreemapPanel.ts`) is a singleton `WebviewPanel` (`currentPanel`, `viewType 'auspexTreemap'`) loading the shared React bundle from `dist/webview`; message types include `ready`, `nodeSelected`, `openFile`, `rescan`.
- The webview draws with d3 + SVG: `SystemMapViewer` (hierarchical map, `d3.zoom`, `compactTree` for single-child folder chains, `shouldShowFolderLabel`/`truncateLabel` for zoom-dependent labels) and `CouplingGraphViewer` (force layout). Colors: `getHeatColor` (churn) in `TreemapViewer.tsx`, `getCodeHealthColor` in `SystemMapViewer.tsx`.
- Hotspots are file-level (`AnalysisSnapshot.hotspots`).
- `add-call-hierarchy` provides `AnalysisSnapshot.callGraph` (edges with confidence, source kind, location callers) and `FunctionId` -> `TreeNode` mapping; selection broadcast via `setSelectedNodeAcrossProviders`.

## Goals / Non-Goals

**Goals:**
- A multi-instance editor tab rendering a layered call-flow diagram in nested frames (spec: `call-diagram-editor`).
- Reuse the existing webview bundle, d3 rendering and color/label helpers; the only new dependency is `elkjs` for the layout.

**Non-Goals:**
- Alternative layouts (force-directed, structure-only block layout).
- Editing code or the diagram (no drag-to-reposition persistence).
- Export to image/SVG file.

## Decisions

### D1: Multi-instance panel
`src/panels/CallDiagramPanel.ts` creates a new `WebviewPanel` (`viewType 'auspexCallDiagram'`) per open request with `retainContextWhenHidden`, keeps instances in a `Set` for broadcasting snapshot updates, and disposes them on close. The HTML injects `window.__AUSPEX_VIEW__ = "callDiagram"` and the scope path; `App.tsx` routes that view to a new `CallDiagramViewer`. Commands: `auspex.openCallDiagram` (palette; optional `scopePath` argument), used by the treemap folder context action and the Calls view context action.
- *Why not a CustomEditor:* the diagram is not backed by a document; a plain webview panel matches the "own tab, several at once" decision.

### D2: Layered flow layout with ELK (revised)
Build the frame hierarchy from the scoped `TreeNode` subtree as before (folders compacted with `compactTree`; files and classes as frames; methods as leaves; nested helpers flattened into their top-level method's frame). It is converted into an ELK graph: frames become compound nodes (padding with room for the frame label), functions become leaf nodes (width from the label, height `24 + min(16, sqrt(loc))`), call edges are added at the root. ELK options: `elk.algorithm: layered`, `elk.direction: DOWN`, `elk.hierarchyHandling: INCLUDE_CHILDREN`, `elk.edgeRouting: SPLINES`. Node coordinates are made absolute by adding parent offsets; edge sections are relative to the lowest common ancestor of source and target and are offset accordingly.
- *Why:* calls flow top to bottom and are routed around frames, which reads like a flow chart. The structure-only treemap layout was implemented first, rendered and rejected by the user as a "block tree" that is hard to read.
- *Measured (prototype, headless Chromium):* 62 functions / 79 edges in ~0.33 s; 3,600 functions / 3,300 edges in ~2.6 s.
- *Alternatives:* d3 treemap block layout (implemented, rejected); d3 force layout with grouping (prototyped; overlapping frames, less ordered).

### D3: Edge routing from ELK
Edges are drawn from ELK's spline sections (start, bend and end points) with `d3.curveBasis`. Style: solid for `certain`, dashed for `inferred`, purple for `declarative`; arrowhead at the callee. Declarative location callers start at their file frame (a compound node without functions). Out-of-scope callees are aggregated into a stub count on the caller node. Self-calls are drawn as a small loop. Call cycles are handled by ELK's cycle breaking.

### D4: Level of detail
Three zoom bands based on the d3 zoom transform `k` and on-screen frame size:
1. far: only frames with area above a pixel threshold, frame labels via `shouldShowFolderLabel`, edges aggregated per frame pair (count label);
2. middle: classes/files visible, function boxes without labels, individual edges;
3. near: function labels (`truncateLabel`), all edges.
Elements outside the viewport are culled. Rendering stays SVG; if measurements (task 5.2) show the far band is too slow for large workspaces, that band switches to a `<canvas>` layer behind the SVG.

### D5: Layout off the main thread (revised)
The cheap model building runs on the main thread; the expensive ELK layout runs in ELK's own Web Worker: `elk-api` on the main thread with `workerFactory` creating a worker from `elk-worker.min.js`, imported as text (`?raw`) and started from a Blob URL, because VS Code webviews cannot load worker scripts from resource URLs. The panel shows progress until the first result.
- *Why not an own worker:* `elk.bundled.js` detects a worker context and installs itself as the worker's message handler, which breaks a custom worker ("is is not a constructor" in the first attempt).
- *Fallback:* if the worker cannot start (probe layout fails), the bundled ELK is loaded on demand (`import()`, separate chunk) and runs on the main thread, deferred with `setTimeout` so that the progress indicator renders first.
- The webviews set no Content-Security-Policy; if one is introduced later it must allow `worker-src blob:`.

### D6: Colors, hotspots and filters
Box color uses `getHeatColor(churnScore)` by default with a toggle to `getCodeHealthColor(codeHealth)` - the same helpers as the other views. A function counts as a hotspot if its file is in `snapshot.hotspots`. Filters (hide inferred, hotspots only, folder restriction) are applied to the laid-out model without re-running the layout except for folder restriction, which re-runs the layout for the subtree.

### D7: Selection, navigation and updates
Click -> highlight neighbors and post `nodeSelected` (panel forwards to `setSelectedNodeAcrossProviders`); double-click -> `openFile` with start line. On `snapshot:update`, the panel posts the new snapshot to each instance; the viewer re-lays out (ELK is deterministic for identical input), keeps the zoom transform and re-selects by `FunctionId` if it still exists.

## Risks / Trade-offs

- [Layout time grows with workspace size] -> Runs in the worker with progress; folder restriction and diagrams per folder keep it small. See the measurements below.
- [Bundle size: elkjs adds ~1.4 MB to the webview bundle (worker source) plus a ~1.4 MB fallback chunk loaded only on demand] -> Accepted for the readability gain.
- [Small code changes can move nodes (a layered layout is less stable than the block layout)] -> Zoom and selection are kept on updates; positions are deterministic for unchanged input.
- [Edge clutter from name-based (inferred) edges, e.g. `map.get()` matched to a `get` method] -> Inferred-edge filter, neighbor highlighting, aggregated far-band edges; resolver tuning is out of scope here.
- [Drawing all edges slows down panning (measured: 3,300 edges -> ~7 fps)] -> Only edges with a visible end (or of the selection) are rendered.
- [Large workspaces: SVG element count] -> Culling and LOD; canvas fallback for the far band (D4) decided by measurement.
- [Worker + CSP issues inside VS Code webviews] -> Main-thread chunked fallback (D5).
- [Snapshot transfer to several tabs] -> Each tab receives the scoped subtree and relevant edges only.

## Measurements (task 5.2)

Headless Chromium 131 on the build output (`dist/webview`), 1400x900 viewport:

| Workspace | Functions / edges | First view | Pan frame rate |
|---|---|---|---|
| `src/analyzer/calls` (real code) | 62 / 79 | ~0.45 s | ~60 fps |
| synthetic, 12 modules x 25 files | 3,600 / 3,300 | ~4.0 s | ~60 fps |

- With all edges rendered, panning the large diagram dropped to ~7 fps; rendering only edges with a visible end (or of the selection) restored ~60 fps. No canvas layer is needed.
- The far band of the synthetic workspace (every module calls every other) shows a dense web of aggregated edges; real code is far less uniform. Revisit the far band if it is hard to read on real large workspaces.

## Migration Plan

- Ships after `add-call-hierarchy`; additive (new command, panel and view) plus the `elkjs` dependency. No data migration.

## Open Questions

- Exact LOD thresholds and the minimum box size are tuned during implementation; they do not change specs or tasks.
