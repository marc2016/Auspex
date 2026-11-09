# Design

## Context

See proposal.md - Why. Current state (`add-call-diagram-editor`, `add-call-hierarchy`):

- `CallDiagramPanel.open(extensionUri, workspacePath, scopePath, snapshot, callbacks)` opens one tab per call; `buildCallDiagramData(snapshot, scope)` sends the scoped subtree plus edges touching the scope (`diagram:data`).
- The webview builds a frame model (`buildDiagramModel`), lays it out with ELK in ELK's worker (`computeDiagramLayout`) and renders it in `CallDiagramViewer`; requests carry an optional `folderPath` restriction. Filters (`hideInferred`, `hotspotsOnly`) and neighbor highlighting are applied after layout.
- The model keeps frames that contain functions or files referenced by location callers.
- `CallGraph.counts` holds caller/callee counts per function; `CallGraphService` provides `findFunctionAt(file, line)`.
- CodeLens (`HealthCodeLensProvider`) already shows the health and call-count lenses per method; the Calls view subject has a diagram button that currently opens the folder diagram.

## Goals / Non-Goals

**Goals:**
- Focus mode with separate caller/callee depths, boundary markers and warning (spec: `call-diagram-editor`).
- Four entry points; the Calls view subject action becomes a focus action.

**Non-Goals:**
- Path search between two functions ("how does A reach B").
- Persisting focus settings across sessions.
- Focus on classes, files or folders (functions only).

## Decisions

### D1: Pure traversal shared by tests and webview
`computeFocus(graph, startId, { up, down, includeInferred })` in `src/analyzer/calls/focus.ts` runs two breadth-first searches on the call graph: backwards over incoming edges up to `up` levels (location callers are collected as leaves and not expanded), forwards over outgoing edges up to `down` levels; `Infinity` stands for "all". A function reached by both searches is included once. Result: included function ids, included location callers, the edges between included nodes, and per boundary function the counts of callers/callees that were not included.
- *Why pure:* traversal rules (cycles, inferred, depth) are the core of the spec and need direct unit tests.

### D2: Focus data is workspace-wide
A focused tab requests the workspace-wide data (`buildCallDiagramData(snapshot, '')`) regardless of its folder scope, so the traversal can leave the folder (spec: Caller outside the tab's folder). The panel keeps sending scoped data for the scope view; for focus it sends a second payload `diagram:focusData` on demand (first focus in that tab and on every snapshot update while focused).
- *Alternative:* always send workspace data - simpler, but scope views of big workspaces would transfer much more data.

### D3: Model restricted to the focus
`buildDiagramModel(data, { functions?: Set<FunctionId> })` keeps only listed function leaves (and frames containing them); location-caller file frames are kept when the focus includes them. `DiagramRequest` gets `focus?: { fnId, up, down, includeInferred }`; `handleDiagramRequest` computes `computeFocus` on the request data, restricts the call graph to the focus edges, builds the restricted model and lays it out. Boundary counts are returned with the layout (`DiagramLayout.boundary`).
- ELK's layered layout places callers above callees automatically; no extra ranking is needed for the scenarios. The start node is emphasized by the viewer.

### D4: Viewer focus state and bar
`CallDiagramViewer` holds `focus: { fnId, label, up, down } | null`. The toolbar shows "Focus" when a function is selected; in focus mode a focus bar replaces the folder selector: label, two `<select>` inputs (0-10, all), and a close button. Changing a depth re-requests the layout (stale results are ignored by request id). The warning appears when the focus contains more than 300 functions. Boundary markers render as small "+N" badges above (callers) and below (callees) the node. Leaving focus restores the previous scope request; zoom is re-fitted on entering and leaving focus.
- `hideInferred` toggling in focus mode re-runs the traversal (it changes which nodes are reachable), unlike in the scope view where it only filters.

### D5: Entry points
- **Extension commands:** `auspex.openCallDiagram` accepts `string` (scope) or `{ scopePath?, focus?: { file, startLine } }`; the panel maps file/start line to a `FunctionId` via `CallGraphService.findFunctionAt` and posts `diagram:focus` after `ready`. New command `auspex.focusInCallDiagram` (title "Auspex: Show Calls in Diagram") uses the active editor's cursor line; without a function it shows an information message. Contributed to `editor/context` for JavaScript/TypeScript files.
- **CodeLens:** a third lens "In diagram" per known function, command `auspex.openCallDiagram` with `{ focus: { file, startLine } }`; governed by `auspex.codeLens.enabled`.
- **Calls view:** the subject's diagram button posts `openCallDiagram` with `focus` instead of the folder scope (spec MODIFIED requirement).
- **Diagram:** the "Focus" action switches the current tab (no new tab).

### D6: Tab title
A tab opened with a focus is titled "Call Diagram: <qualified function name>"; entering focus inside an existing tab keeps its title (the focus bar names the function).

## Risks / Trade-offs

- [Three CodeLens entries per function may feel crowded] -> Short title ("In diagram"); all lenses follow `auspex.codeLens.enabled`. A separate setting can follow if users ask for it.
- [Very wide fan-in with "all" can still be large (layout seconds)] -> Warning above 300 functions; ELK runs in its worker with progress.
- [Workspace-wide payload for focus in large workspaces] -> Sent only on demand for focused tabs (D2).
- [Inferred edges make the focus wider than reality] -> Follows the hide-inferred filter; resolution quality improved by `improve-call-resolution`.

## Migration Plan

- Ships after `add-call-diagram-editor` (archive it first: this change modifies its `Opening a call diagram` requirement). No data migration.
