# Tasks

## 1. Collapsed model and combined edges (worker)

- [x] 1.1 In `webview/src/utils/callDiagram/model.ts`, copy `loc`, `codeHealth` and `churnScore` from the tree into file and class frames in `buildDiagramModel` (design D1); verify in `test/callDiagramModel.test.ts` that a file frame and a class frame carry the values of their tree nodes.
- [x] 1.2 Add `DiagramLevel`, the `loose` node kind, `members` on `DiagramNode`, and `collapseModel(model, level)` (design D1); verify unit tests: `functions` returns the model unchanged; `files` turns every file frame into a leaf with all its function keys as members and keeps folder frames; `classes` turns the outermost class into a leaf (nested container merged), creates one `loose:<file>` leaf for top-level functions, and leaves a file without loose functions without a `loose` leaf; a declarative-only file frame stays a leaf at both levels; keys of file and class boxes equal their frame keys.
- [x] 1.3 Extend `collectDiagramEdges` in `layout.ts` to map function keys to boxes through `members`, combine edges per box pair with `certainCount`/`inferredCount`, derive `confidence` and `source`, drop pairs within a box, count stubs per box, and fill counts of 1 at the function level (design D2); verify unit tests for the spec scenarios "Several calls between two files" (certain, 5), "Only inferred calls" (inferred, 1), "Calls within a class" (no edge), "Callee outside the scope" (stub on the file box), a declarative file-to-file edge, and unchanged function-level edges.
- [x] 1.4 Add `level` to `DiagramRequest` in `protocol.ts` and call `collapseModel` after `buildDiagramModel` in `handleDiagramRequest`; give box leaves a size from `functionNodeSize(name, loc)` in `toElkGraph` (design D1, D6); verify in `test/callDiagramWorker.test.ts` that a `files` request for the whole scope, a folder restriction and a focus request each return one laid-out node per file with combined edges, and that `functions` requests are unchanged.

## 2. Filters and cycles (client logic)

- [x] 2.1 Update `applyFilters` in `view.ts` for combined edges and box leaves: `hideInferred` keeps edges with `certainCount > 0` and exposes the shown count; "hotspots only" keeps box leaves in hotspot files, their frames and edges between kept boxes (design D3); verify in `test/callDiagramView.test.ts` the spec scenario "Hide inferred calls in combined edges" (3 shown, `log.js` edge hidden), hotspots-only at the file level, and that existing function-level filter tests still pass.
- [x] 2.2 Add `findCycles(nodes, edges)` (Tarjan SCC on box leaves, components of size >= 2, sorted by bounding-box top then left, cycle-edge set) and return no cycles at the function level (design D4); verify unit tests for the spec scenarios "Two files calling each other", "Longer cycle" (with `d.js` excluded), "Cycle only through inferred calls" (no cycle after `applyFilters` with `hideInferred`), "Recursion at the function level", and the stable ordering of two components.
- [x] 2.3 Add `boxOf(layout)` mapping function keys to the key of their box (identity at the function level) and the summed focus boundary per box (design D7, D8); verify unit tests that `Cart.add` maps to `file:src/cart/cart.js` at `files`, a top-level function maps to its `loose:` box at `classes`, and boundary counts of two members are summed.

## 3. Viewer

- [x] 3.1 Add the strings for the level selector ("Functions", "Classes", "Files"), the loose-functions label, cycle count, "no cycles", "cycle i of N (k boxes)" and the step buttons in German and English in `webview/src/i18n.ts`; verify `test/i18n.test.ts` passes.
- [x] 3.2 In `CallDiagramViewer.tsx`, add `level` state (default `functions`) with a toolbar selector, pass it in the layout request, and set the pending fit on level change (design D6); verify `npm test` and a headless Chromium check with the 3,600-function sample that switching to "Files" lays out again and fits, switching back restores the function diagram, and a second tab starts at "Functions".
- [x] 3.3 Render box leaves at the class and file levels with always-visible labels (loose box labeled as the file's functions), skip the far-band aggregation, draw edge count labels at the path midpoint and scale stroke width with the count; color boxes with `functionColor` from their own values (design D6); verify a `renderToStaticMarkup` or Chromium check that a fitted file diagram shows every file name and edge count, and that the Code Health color of a file box matches the treemap color for that file.
- [x] 3.4 Mark cycles from `findCycles` (red outline on boxes, red cycle edges keeping the dashed style for inferred) and add the toolbar counter with previous/next stepping, fit to the component, highlight with dimming, reset on background click, new selection or an out-of-range index (design D4, D5); verify in headless Chromium with a sample containing three file cycles (one only through inferred calls) that the counter shows 3, stepping twice shows "cycle 2 of 3" and fits the view to it, enabling "hide inferred edges" shows 2, and a cycle-free class diagram shows "no cycles" without step buttons.
- [x] 3.5 Use `boxOf` for selection highlighting, the location marker and the focus boundary markers at the class and file levels (design D7, D8); verify in headless Chromium that a cursor message for `Cart.add` marks the `cart.js` box at "Files" and scrolls it into view at the same zoom, and that clicking a file box highlights its connected files and edges.

## 4. Selection in the other views and double-click

- [x] 4.1 Send `nodeSelected { filePath, startLine? }` for class, loose and file boxes and `openFile` with the class start line (or no line for file and loose boxes) on double-click (design D7); verify in `test/callDiagramPanel.test.ts` that the panel forwards `nodeSelected` to its new callback and still handles `openFile`.
- [x] 4.2 In `src/extension.ts`, handle the callback: resolve the file node with `findFileNode` and, with a start line, the class node starting there (generalize `findMethodNodeAt` to a node type), then select it across providers; verify unit tests that a file path selects the file node and a file path with the class start line selects the class node, and that function selection is unchanged.

## 5. Docs and integration

- [x] 5.1 Describe the detail levels and cycle marking in the "Call Diagram" section of `README.md` and add the feature to the `[Unreleased]` section of `CHANGELOG.md` under "Added"; verify both entries exist.
- [x] 5.2 Run `npm test`, the type check (`npx tsc --noEmit` for the extension and the webview) and `npm run build`; verify all pass.
- [x] 5.3 Headless Chromium end-to-end check with the 3,600-function sample at "Files" and "Classes": layout time noticeably below the function level, labels readable when fitted, focus and folder restriction work at both levels; decide the open question on hiding edge labels at far zoom and record the answer in design.md. Keep screenshots in the scratchpad, not in the repository.
- [x] 5.4 Manual check in the Extension Development Host: switch levels in a workspace diagram, step through cycles, select a file and a class box (the details view shows the file or class), double-click a class box (file opens at the class).

## Workflow follow-up

- Archive the change with `/opsx:archive` after the manual check.
