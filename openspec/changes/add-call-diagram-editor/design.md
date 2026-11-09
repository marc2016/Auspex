# Design

## Context

See proposal.md - Why. Relevant current state and dependencies:

- `TreemapPanel` (`src/panels/TreemapPanel.ts`) is a singleton `WebviewPanel` (`currentPanel`, `viewType 'auspexTreemap'`) loading the shared React bundle from `dist/webview`; message types include `ready`, `nodeSelected`, `openFile`, `rescan`.
- The webview draws with d3 + SVG: `SystemMapViewer` (hierarchical map, `d3.zoom`, `compactTree` for single-child folder chains, `shouldShowFolderLabel`/`truncateLabel` for zoom-dependent labels) and `CouplingGraphViewer` (force layout). Colors: `getHeatColor` (churn) in `TreemapViewer.tsx`, `getCodeHealthColor` in `SystemMapViewer.tsx`.
- Hotspots are file-level (`AnalysisSnapshot.hotspots`).
- `add-call-hierarchy` provides `AnalysisSnapshot.callGraph` (edges with confidence, source kind, location callers) and `FunctionId` -> `TreeNode` mapping; selection broadcast via `setSelectedNodeAcrossProviders`.

## Goals / Non-Goals

**Goals:**
- A multi-instance editor tab rendering the structure-based call diagram (spec: `call-diagram-editor`).
- Reuse the existing webview bundle, d3 and color/label helpers; no new runtime dependency.

**Non-Goals:**
- Flow/layered layouts that order functions by call direction (possible later "flow layout" option for selections).
- Editing code or the diagram (no drag-to-reposition persistence).
- Export to image/SVG file.

## Decisions

### D1: Multi-instance panel
`src/panels/CallDiagramPanel.ts` creates a new `WebviewPanel` (`viewType 'auspexCallDiagram'`) per open request with `retainContextWhenHidden`, keeps instances in a `Set` for broadcasting snapshot updates, and disposes them on close. The HTML injects `window.__AUSPEX_VIEW__ = "callDiagram"` and the scope path; `App.tsx` routes that view to a new `CallDiagramViewer`. Commands: `auspex.openCallDiagram` (palette; optional `scopePath` argument), used by the treemap folder context action and the Calls view context action.
- *Why not a CustomEditor:* the diagram is not backed by a document; a plain webview panel matches the "own tab, several at once" decision.

### D2: Structure-based layout with d3-hierarchy
Build a hierarchy from the scoped `TreeNode` subtree (folders compacted with `compactTree`; files and classes as frames; methods as leaves; nested helpers flattened into their top-level method's frame as leaves). Layout with `d3.treemap()` using `paddingTop` for frame labels, `paddingInner` for spacing, and leaf value `max(minArea, sqrt(loc))` so small functions stay legible and large ones are bigger without dominating.
- *Why:* O(n), deterministic and stable across updates (same input -> same positions), which keeps the viewport meaningful after refreshes; matches the user's choice of d3-only structure layout.
- *Alternative:* force layout with clustering (unstable positions, poor frame containment) or ELK (new dependency, slow for thousands of nodes) - rejected.

### D3: Hierarchical edge bundling
Edges are drawn as `d3.line().curve(d3.curveBundle.beta(0.85))` through the centers of the ancestor frames on the path from caller to callee via their lowest common ancestor. Style: solid for `certain`, dashed for `inferred`; arrowhead at the callee; declarative location callers start at their file frame (or the file's tile when the file is outside the hierarchy of functions). Out-of-scope callees are aggregated into a stub badge with a count on the caller box.

### D4: Level of detail
Three zoom bands based on the d3 zoom transform `k` and on-screen frame size:
1. far: only frames with area above a pixel threshold, frame labels via `shouldShowFolderLabel`, edges aggregated per frame pair (count label);
2. middle: classes/files visible, function boxes without labels, individual edges;
3. near: function labels (`truncateLabel`), all edges.
Elements outside the viewport are culled. Rendering stays SVG; if measurements (task 5.2) show the far band is too slow for large workspaces, that band switches to a `<canvas>` layer behind the SVG.

### D5: Layout off the main thread
Hierarchy + treemap layout + edge routing run in a Web Worker bundled by Vite (`new Worker(new URL(..., import.meta.url), { type: 'module' })`); the panel shows progress until the first result. The webviews currently set no Content-Security-Policy; if one is introduced later it must allow `worker-src` for the webview origin / blob.
- *Fallback:* if the worker cannot be created, compute on the main thread in chunks via `requestIdleCallback`.

### D6: Colors, hotspots and filters
Box color uses `getHeatColor(churnScore)` by default with a toggle to `getCodeHealthColor(codeHealth)` - the same helpers as the other views. A function counts as a hotspot if its file is in `snapshot.hotspots`. Filters (hide inferred, hotspots only, folder restriction) are applied to the laid-out model without re-running the layout except for folder restriction, which re-runs the layout for the subtree.

### D7: Selection, navigation and updates
Click -> highlight neighbors and post `nodeSelected` (panel forwards to `setSelectedNodeAcrossProviders`); double-click -> `openFile` with start line. On `snapshot:update`, the panel posts the new snapshot to each instance; the viewer re-lays out (stable positions per D2), keeps the zoom transform and re-selects by `FunctionId` if it still exists.

## Risks / Trade-offs

- [Treemap-like layout may feel similar to the treemap view] -> Distinguished by frames with labels, uniform minimum box size, edges and function-level focus; the treemap stays the metric view.
- [Edge clutter in dense workspaces] -> Bundling, aggregated far-band edges, inferred-edge filter and neighbor highlighting.
- [Large workspaces: SVG element count] -> Culling and LOD; canvas fallback for the far band (D4) decided by measurement.
- [Worker + CSP issues inside VS Code webviews] -> Main-thread chunked fallback (D5).
- [Snapshot transfer to several tabs] -> Each tab receives the scoped subtree and relevant edges only.

## Migration Plan

- Ships after `add-call-hierarchy`; purely additive (new command, panel and view). No data migration.

## Open Questions

- Exact LOD thresholds and the minimum box size are tuned during implementation; they do not change specs or tasks.
