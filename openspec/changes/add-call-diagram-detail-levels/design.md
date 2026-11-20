# Design

## Context

See proposal.md for the motivation. The diagram is built in a web worker (`protocol.ts`, `handleDiagramRequest`): folder restriction, then optional focus (`computeFocus` on the function call graph), then `buildDiagramModel` (frames and function leaves), then `computeDiagramLayout` (`collectDiagramEdges`, ELK layered layout with `INCLUDE_CHILDREN`). The viewer applies the filters on the finished layout (`applyFilters` in `view.ts`), so changing "hide inferred" or "hotspots only" does not lay out again, except for focus requests, where `hideInferred` is part of the focus computation.

Facts the design relies on:
- Call graph edges are function pairs (`from` is a function id or, for declarative callers, a file location), with `confidence` and `source`. There is one edge per caller/callee pair, not per call site.
- `collectDiagramEdges` deduplicates by `fromKey->toKey` and keeps the confidence of the first edge it sees. At the function level this does not matter, because keys are function ids.
- Tree nodes of type `file` and `class` carry `loc`, `churnScore` and `codeHealth`; hotspots are file paths.
- Frames other than functions currently do not copy these metrics into `DiagramNode`.
- Selection sync to the other views goes through `functionSelected` (file + start line → `findMethodNodeAt`), so only methods can be selected today.

## Goals / Non-Goals

**Goals:**
- The class and file levels reuse the existing pipeline. Collapsing happens after focus and model building, so scope, folder restriction and focus behave identically at every level.
- Cycle detection and filters stay on the client, so toggling "hide inferred" updates edges, counts and cycles without a new layout.

**Non-Goals:**
- A separate ELK configuration per level. The layered layout with the same spacing is used for every level.
- Laying out again when a filter changes. Positions stay as computed with all edges, as at the function level today.

## Decisions

### D1 Collapsing the model

A new step `collapseModel(model, level)` in `model.ts` runs in the worker after `buildDiagramModel` and before the layout. For `functions` it returns the model unchanged. Otherwise it replaces subtrees by box leaves:
- `files`: every `file` frame becomes a leaf of kind `file`.
- `classes`: the outermost `class` frame below a file becomes a leaf of kind `class` (nested containers are merged into it). The function leaves directly in a file frame are replaced by one leaf of kind `loose` with key `loose:<file>` and the file name as its name; the viewer adds the "functions" marker to the label.
- A file frame without functions (declarative caller) is already a leaf and stays one.

Every box leaf gets `members: string[]`, the keys of the function leaves it replaced. The presence of `members` marks a box; rendering and lookups branch on it, not on `kind`. Keys of file and class boxes are the keys their frames had (`file:<path>`, `class:<path>`), so a selection made at one level survives updates at the same level.

`buildDiagramModel` copies `loc`, `codeHealth` and `churnScore` from the tree into file and class frames. The `loose` box uses the sum of its members' LOC and the values of its file for color, because the tree has no node for "loose functions of a file".

*Alternatives:* collapsing in `buildDiagramModel` through an option (that mixes two concerns in an already dense function, and the focus filter works on function leaves); collapsing after the layout by hiding children (no layout gain, and no better flow, which is the point of the change).

### D2 Combined edges

`collectDiagramEdges` maps every function key to its box through the `members` index (identity at the function level). For each pair of distinct boxes it emits one edge with `certainCount` and `inferredCount` (number of call-graph edges, i.e. caller/callee function pairs, not call sites). `confidence` is `certain` when `certainCount > 0`. `source` is `declarative` only when all of its calls are declarative. Pairs within one box are dropped. Stubs are counted per box. At the function level the counts are filled in too (always 1), so the renderer and the filters treat both cases the same way.

"Number of calls" in the spec means these function pairs. Counting call sites would need data the call graph does not keep.

### D3 Filters on combined edges

`applyFilters` with `hideInferred` keeps edges with `certainCount > 0` and shows `certainCount` as the label. Without the filter the label is `certainCount + inferredCount`. At the function level this is the same as today's `confidence !== 'inferred'`. "Hotspots only" keeps box leaves whose `hotspot` flag is set (file boxes and class/loose boxes in hotspot files), their frames, and the edges between kept boxes, with the same ancestor walk as for functions.

Focus requests with `hideInferred` keep sending the flag to the worker as today. The collapsed edges then contain no inferred calls.

### D4 Dependency cycles

`findCycles(nodes, edges)` in `view.ts` runs Tarjan's strongly connected components algorithm on the visible box leaves and visible edges (output of `applyFilters`) and returns the components with at least two boxes. Self edges do not occur because pairs within a box are dropped. The result is memoized on the visible diagram. With a few hundred boxes it takes well under a millisecond, so it can run on every filter change.

An edge is marked when both ends are in the same component. The components are sorted by the top-left position of their bounding box (y, then x), so stepping goes through the diagram from top to bottom in a stable order. The function level returns no cycles.

Marking: boxes in a cycle get a red outline, cycle edges are drawn red and solid or dashed by confidence. The colors come from VS Code's error color with a fixed fallback, so they work in light and dark themes.

*Alternatives:* computing cycles in the worker (they would not follow the client-side filters without a round trip); marking only the back edges ELK draws upwards (depends on the layout and misses edges of the cycle that point down).

### D5 Cycle navigation

The viewer keeps `cycleIndex: number | null`. The toolbar shows "N cycles" (or "no cycles") at the class and file levels, and buttons for previous and next. Stepping sets the index, fits the view to the bounding box of the component (reusing `fitTransform` with padding) and highlights its boxes and edges by dimming the rest, the same mechanism the click selection uses. A click on the canvas background or a new selection clears the highlight. When the cycle list changes (filter, new data), an index that is now out of range is reset to `null`.

The label while stepping is "cycle i of N (k boxes)", so a large component shows its size.

### D6 Level in the request and the viewer

`DiagramRequest` gets `level: 'functions' | 'classes' | 'files'`. The viewer keeps `level` in state (default `functions`) and adds it to the request. A level change sets the pending fit, like a focus or folder change (pending-fit logic of the previous change). The level is not persisted. A new tab starts at `functions`, as the spec requires.

At the class and file levels the viewer uses the `near` zoom band for boxes at every zoom factor, so labels are always shown and the far-band aggregation (`aggregationDepth`, `aggregateEdges`) is skipped. Edge labels show the count at the midpoint of the routed path. Stroke width grows with the log of the count, as in today's far band.

Box sizes reuse `functionNodeSize(name, loc)`. Its height cap keeps large files from dominating.

The progress message keeps reporting the function count, which still describes the input of the layout step. The loading indicator is unchanged.

### D7 Selection, double-click and location marker

A new webview message `nodeSelected { filePath, startLine? }` is sent for class and file boxes (`functionSelected` stays for functions). The panel forwards it to a new callback. In `extension.ts` it resolves the file node with `findFileNode` and, if `startLine` is given, the class node starting at that line (a generalization of `findMethodNodeAt` to a node type), then selects it across providers. The `loose` box selects its file.

Double-click sends the existing `openFile` message with the class start line, or without a line for file and loose boxes.

The location marker maps the cursor function id to its box through the `members` index of the layout, so the box containing the function is marked and scrolled into view by the existing logic.

### D8 Focus boundary markers

At the class and file levels, the hidden caller and callee counts of the focus boundary are summed per box over its members. A box shows the marker when the sum is above zero.

## Risks / Trade-offs

- [Inferred edges create false cycles, e.g. a name-based match from `map.get()` to a `get` method] → Cycles follow the "hide inferred" filter, and the count in the toolbar shows the effect immediately. Resolver tuning stays out of scope.
- [One large component (dozens of files in one cycle) is hard to read] → Navigation fits to it and shows its size. Breaking it down further (e.g. showing the shortest cycle) is a follow-up if it occurs on real workspaces.
- [Positions are computed with all edges, so hiding inferred edges can leave a layout that no longer flows cleanly] → Same behavior as at the function level today. A re-layout on filter change is a non-goal.
- [Edge labels clutter dense file diagrams] → Labels use a small font and are drawn only for visible edges. If they turn out to be too dense, they can be limited to the hovered or selected box without changing the specs.
- [The loose box has no Code Health of its own] → It uses the file's value (D1). This is noted in the tooltip, which names it as the loose functions of the file.

## Open Questions

- Whether edge labels should be hidden at very far zoom on large file diagrams. Decide after a check with the 3,600-function sample. This is a rendering threshold only.
