# Proposal

## Why

The treemap shows how big and risky code is, and the planned "Calls" view shows the callers of one function, but neither shows how functions across the codebase connect within their structure. Users want a diagram of functions and their calls, framed by folders, namespaces and classes, that they can keep open as a regular editor tab next to their code - not as another mode inside the treemap tab.

## What Changes

- New editor tab "Call Diagram" (a separate webview editor, not a chart type inside the treemap tab), opened via a command and from the treemap/"Calls" view context. Several diagram tabs can be open at once.
- The diagram shows **all** functions of the chosen scope (whole workspace by default, or a folder) as boxes, nested in frames for folders, namespaces/modules, files and classes/containers, following the same hierarchy as the treemap.
- Calls between functions are drawn as edges; edges between distant frames are bundled. Edge confidence (`certain` / `inferred`) and source kind (e.g. `js`, `declarative`) are visually distinguishable.
- Layout is structure-based (frames arranged by hierarchy, functions inside their frame) and rendered with d3, which the webview already uses; no new layout dependency.
- Visual encoding consistent with the treemap: box size by LOC, color by Code Health / churn (hotspots).
- Interaction: pan/zoom; semantic zoom (zoomed out: frames and bundled edges only; zoomed in: functions and labels); selecting a function highlights its incoming/outgoing calls; double-click opens the function in the source editor.
- Filters: hide inferred edges, show only hotspots, restrict to a folder.

**Decided during planning**
- The diagram updates automatically when a new analysis result is available (scan or file save), keeping the current viewport and selection.
- Rendering starts with SVG plus level-of-detail; switching outer zoom levels to canvas is a fallback only if measurements on large workspaces require it (see design).
- Files are frames too, between namespace/module and class, matching the treemap hierarchy.

## Capabilities

### New Capabilities
- `call-diagram-editor`: the call diagram editor tab - opening, scope, nested framing, edge display, visual encoding, zoom levels, interaction and filters.

### Modified Capabilities
<!-- none: no specs exist yet -->

## Impact

- Depends on `add-call-hierarchy` for the call data model (`call-analysis`); benefits from `detect-this-assigned-methods` and `detect-declarative-references` (more nodes and edges).
- New webview editor provider under `src/panels/` (e.g. `CallDiagramPanel.ts`), command and menu contributions in `package.json` (+ `package.nls*.json`).
- Webview: new diagram component using d3 (hierarchy layout, zoom, edge bundling); reuse of helpers from `SystemMapViewer` / `systemMapUtils` where possible.
- Performance: layout and rendering for large workspaces must stay responsive (background computation, level-of-detail).
