# Tasks

## 1. Panel and command

- [x] 1.1 Add `CallDiagramPanel` as a multi-instance webview panel with scope argument, tab title "Call Diagram: <scope>", snapshot broadcast to all instances and disposal handling (design D1); verify `test/callDiagramPanel.test.ts` (modeled on `treemapPanel.test.ts`) for two simultaneous instances, titles, and that closing one keeps the other.
- [x] 1.2 Contribute command `auspex.openCallDiagram` (+ `package.nls*.json`, `src/i18n.ts`) that triggers a scan when no snapshot exists; verify a test for the no-snapshot path and manually that the command opens a tab independent of the treemap.
- [x] 1.3 Route `__AUSPEX_VIEW__ = "callDiagram"` in `webview/src/App.tsx` to a placeholder `CallDiagramViewer`; verify the webview builds (`npm run compile:webview`).

## 2. Diagram model and layout

- [x] 2.1 Implement the pure model builder: scoped subtree -> compacted frame hierarchy (folders, namespace, file, class) with method leaves and flattened nested helpers (design D2); verify unit tests for nesting, single-child folder compaction and helper flattening.
- [x] 2.2 Add `elkjs` as a dependency and replace the treemap-based layout with the ELK layered flow layout (design D2, revised): compound frames with label padding, label-sized function nodes with LOC-bounded height, absolute coordinates; verify tests that every function lies inside all its ancestor frames, that a call chain is placed top to bottom (spec: Call flow direction), that a cycle still lays out, and that identical input yields identical positions.
- [x] 2.2a Remove the obsolete treemap layout and bundling code and its tests; verify `npm test` passes and no import of the removed code remains.
- [x] 2.3 Route edges from ELK sections with LCA offsets, keep in-scope filtering, out-of-scope stubs and declarative location callers (design D3, revised); verify tests for an intra-class edge, a cross-folder edge, an out-of-scope callee stub, a location caller and a self-call.
- [x] 2.4 Run the ELK layout in ELK's own Web Worker (Blob URL) with progress messages and a deferred main-thread fallback (design D5, revised); verify a test of the worker message protocol (pure handler) and manually that the VS Code UI stays responsive while a large diagram is laid out.

## 3. Rendering and level of detail

- [ ] 3.1 Render frames, boxes and edges in `CallDiagramViewer` with d3 zoom/pan, certain vs. inferred styles and arrowheads; verify manually on a sample workspace and with a snapshot test of the generated SVG structure for a small fixture.
- [x] 3.2 Implement the three zoom bands, viewport culling and aggregated far-band edges with counts (design D4); verify unit tests for band selection by zoom factor and for frame-pair edge aggregation.
- [x] 3.3 Apply colors via `getHeatColor` with a toggle to `getCodeHealthColor` (design D6); verify a unit test that a function node gets the same color as in the treemap for the same metrics.

## 4. Interaction, filters and updates

- [x] 4.1 Implement click highlighting (neighbors + edges, dimming others) with `nodeSelected` forwarding, and double-click `openFile` (design D7); verify panel tests for both messages and a unit test for neighbor computation.
- [x] 4.2 Implement filters: hide inferred edges, hotspots only (file in `snapshot.hotspots`), folder restriction with re-layout (design D6); verify unit tests for each filter on a fixture model.
- [x] 4.3 Handle `snapshot:update` keeping scope, filters, zoom transform and selection by `FunctionId`; verify a unit test that selection and transform survive an update in which the selected function still exists.
- [x] 4.4 Add context actions "Open Call Diagram" for folders in the treemap details panel and for functions in the Calls view; verify manually and with a webview helper test that the correct scope path is sent.

## 5. Docs and performance

- [x] 5.1 Document the Call Diagram (opening, zoom levels, filters, edge styles) in `README.md` and add an `[Unreleased]` entry in `CHANGELOG.md`; verify both entries exist.
- [x] 5.2 Measure time to first view and pan/zoom frame rate on a workspace with ~3,000 functions; if the far band is not interactive, add the canvas layer for it (design D4); verify the measured numbers are recorded in this change's design.md.

## 6. Integration

- [ ] 6.1 Run `npm test` and check in the Extension Development Host: open two diagrams, zoom from frames to function labels, select and double-click a function, toggle filters, save a file and see the diagram update without viewport reset; verify each step manually.
