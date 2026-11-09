# Spec Delta

## Purpose

Defines the Call Diagram editor tab, which shows the functions of a workspace or folder as boxes nested in frames for their structure, connected by their calls, so users can see how code connects across files and modules.

## ADDED Requirements

### Requirement: Opening a call diagram
The system SHALL provide a command "Auspex: Open Call Diagram" that opens the diagram for the whole workspace in a new editor tab, and context actions on folders in the treemap and on functions in the Calls view that open a diagram scoped to that folder or to the folder containing that function. Each invocation SHALL open a separate tab, titled with its scope.

#### Scenario: Open from the command palette
- **GIVEN** an analysis exists
- **WHEN** the user runs "Auspex: Open Call Diagram"
- **THEN** an editor tab "Call Diagram: <workspace name>" opens, independent of the treemap tab

#### Scenario: Two diagrams side by side
- **GIVEN** a diagram for `src/cart` is open
- **WHEN** the user opens a diagram for `src/store`
- **THEN** a second tab opens and the first remains unchanged

#### Scenario: No analysis yet
- **GIVEN** no scan has been run
- **WHEN** the user opens a call diagram
- **THEN** a scan is started and the tab shows progress until the diagram can be shown

### Requirement: Nested frames
The diagram SHALL show every function and method in its scope as a box, nested inside frames for its folders, namespace/module, file and class/container, following the same hierarchy as the treemap. Each frame SHALL show its name.

#### Scenario: Method in a class in a file in a folder
- **GIVEN** method `add` of class `Cart` in `src/cart/cart.js`
- **WHEN** the workspace diagram is shown
- **THEN** the box `add` lies inside frame `Cart`, inside frame `cart.js`, inside frame `src/cart`

#### Scenario: Single-child folder chains
- **GIVEN** folders `src/app/core` where `src` and `app` contain only one subfolder each
- **WHEN** the diagram is shown
- **THEN** they are shown as one frame `src/app/core`, as in the system map

### Requirement: Call edges
The diagram SHALL draw an edge for every call edge whose caller and callee are both in scope, with a direction marker, routed around frames and nodes. `inferred` edges SHALL be visually distinct from `certain` edges, and `declarative` edges from location callers SHALL start at the frame of the referencing file.

#### Scenario: Certain and inferred edges
- **GIVEN** `save` calls `persist` (`certain`) and `render` (`inferred`)
- **WHEN** the diagram is shown
- **THEN** both edges are drawn and the edge to `render` uses the inferred style

#### Scenario: Callee outside the scope
- **GIVEN** a diagram scoped to `src/cart` and `Cart.save` calls `Store.persist` in `src/store`
- **WHEN** the diagram is shown
- **THEN** the call is indicated as an outgoing stub at `Cart.save` with the count of out-of-scope callees, not as an edge to a hidden box

### Requirement: Call flow direction
The diagram SHALL arrange functions so that calls flow in one main direction, top to bottom: within and across frames, a caller SHALL be placed above its callees unless a call cycle prevents it.

#### Scenario: Call chain
- **GIVEN** `collect` calls `resolveSite`, which calls `resolveBare`, all in one class
- **WHEN** the diagram is shown
- **THEN** `collect` is above `resolveSite`, which is above `resolveBare`

#### Scenario: Cycle
- **GIVEN** `a` calls `b` and `b` calls `a`
- **WHEN** the diagram is shown
- **THEN** both are drawn with both edges and the layout completes

### Requirement: Visual encoding
Function nodes SHALL be wide enough for their name, their height SHALL grow moderately with the function's LOC within fixed bounds, and their color SHALL use the same Code Health / hotspot color scale as the treemap.

#### Scenario: Hotspot color
- **GIVEN** a function with low Code Health and high churn
- **WHEN** the diagram is shown
- **THEN** its box has the same hotspot color it would have in the treemap

### Requirement: Zoom levels
The diagram SHALL support pan and zoom. At far zoom levels it SHALL show only frames, their names and bundled edges between frames with call counts; function boxes and labels SHALL appear as the user zooms in.

#### Scenario: Zoomed out
- **GIVEN** the workspace diagram fully zoomed out
- **WHEN** it is shown
- **THEN** top-level frames with names and aggregated edges with counts are visible, without individual function labels

#### Scenario: Zoomed in
- **WHEN** the user zooms into a class frame
- **THEN** the function boxes and their names inside it become visible

### Requirement: Selection and navigation
Clicking a function box SHALL select it, highlight its incoming and outgoing edges and connected boxes, and select the same node in the other Auspex views. Double-clicking a function box SHALL open its file at the function's start line.

#### Scenario: Highlight calls
- **WHEN** the user clicks `Cart.add`
- **THEN** its callers and callees and the connecting edges are highlighted and other elements are dimmed

#### Scenario: Open source
- **WHEN** the user double-clicks `Cart.add`
- **THEN** the file containing `Cart.add` opens with its start line revealed

### Requirement: Filters
The diagram SHALL offer filters to hide `inferred` edges, to show only hotspot functions (and the edges between them), and to restrict the view to a folder within the current scope. Filters SHALL apply without re-opening the tab.

#### Scenario: Hide inferred edges
- **WHEN** the user enables "hide inferred edges"
- **THEN** only `certain` edges remain visible

#### Scenario: Hotspots only
- **WHEN** the user enables "hotspots only"
- **THEN** only functions classified as hotspots, their frames and the edges between them remain visible

### Requirement: Automatic updates
When a new analysis result is available (after a scan or a file save), every open diagram SHALL update to it while keeping its scope, filters, viewport and selection where the selected function still exists.

#### Scenario: File saved
- **GIVEN** an open diagram showing `Cart.add`
- **WHEN** the user adds a call in `Cart.add` and saves
- **THEN** the new edge appears without the viewport resetting

### Requirement: Responsiveness
While the layout is being computed, the tab SHALL show progress and SHALL NOT block the editor. Once shown, pan and zoom SHALL remain interactive for workspaces with several thousand functions.

#### Scenario: Large workspace
- **GIVEN** a workspace with 3,000 functions
- **WHEN** the workspace diagram is opened
- **THEN** a progress indicator is shown until the first view appears, and the VS Code UI stays responsive meanwhile
