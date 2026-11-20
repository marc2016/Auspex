# Spec Delta

## ADDED Requirements

### Requirement: Detail level
Every diagram tab SHALL offer the detail levels "Functions", "Classes" and "Files" in its toolbar. A new tab SHALL start at "Functions". Changing the level SHALL lay out the diagram again for the same scope, folder restriction, focus and filters, and SHALL fit the view to the new layout. The level SHALL be kept per tab while the tab is open.

#### Scenario: Switching to files
- **GIVEN** a workspace diagram at "Functions"
- **WHEN** the user chooses "Files"
- **THEN** the diagram shows one box per file, laid out again and fitted to the canvas

#### Scenario: New tab
- **GIVEN** a diagram tab set to "Files"
- **WHEN** the user opens another call diagram
- **THEN** the new tab starts at "Functions" and the first tab stays at "Files"

#### Scenario: Focus at the file level
- **GIVEN** a tab focused on `Cart.add` with caller depth 1 and callee depth 2
- **WHEN** the user chooses "Files"
- **THEN** the diagram shows one box for each file that contains a function of this focus, and the focus and depths are unchanged

### Requirement: File level boxes
At the "Files" level, the diagram SHALL show one box per file that contains a function in the diagram, nested in the frames of its folders and namespaces as at the "Functions" level. A file that only references functions (declarative location caller) SHALL also be shown as a box.

#### Scenario: Files in a folder
- **GIVEN** `src/cart/cart.js` and `src/cart/price.js` with functions
- **WHEN** the workspace diagram is shown at "Files"
- **THEN** the boxes `cart.js` and `price.js` lie inside frame `src/cart`, and no function or class boxes are shown

#### Scenario: Referencing file
- **GIVEN** `views/cart.xml` references `Cart.add` by name
- **WHEN** the diagram is shown at "Files"
- **THEN** `cart.xml` is a box with an edge to the box `cart.js`

### Requirement: Class level boxes
At the "Classes" level, the diagram SHALL show one box per class or other container that contains a function in the diagram, nested in the frame of its file and the frames above it. The functions of a file that are not in any class SHALL form one box per file, named after the file and marked as its loose functions.

#### Scenario: Class in a file
- **GIVEN** class `Cart` with methods `add` and `save` in `src/cart/cart.js`
- **WHEN** the diagram is shown at "Classes"
- **THEN** the box `Cart` lies inside frame `cart.js`, inside frame `src/cart`, and `add` and `save` are not shown as boxes

#### Scenario: Loose functions
- **GIVEN** `src/util/format.js` with top-level functions `formatPrice` and `formatDate` and no class
- **WHEN** the diagram is shown at "Classes"
- **THEN** one box for the loose functions of `format.js` is shown inside frame `format.js`

### Requirement: Combined edges
At the "Classes" and "Files" levels, all calls from functions in one box to functions in another box SHALL be drawn as one edge with a direction marker, labeled with the number of calls it stands for. The edge SHALL use the certain style when at least one of its calls is `certain`, and the inferred style otherwise. Calls between functions in the same box SHALL NOT be drawn.

#### Scenario: Several calls between two files
- **GIVEN** functions in `cart.js` make 3 `certain` calls and 2 `inferred` calls to functions in `store.js`
- **WHEN** the diagram is shown at "Files"
- **THEN** one edge from `cart.js` to `store.js` is drawn in the certain style with the label 5

#### Scenario: Only inferred calls
- **GIVEN** the only call from `cart.js` to `log.js` is `inferred`
- **WHEN** the diagram is shown at "Files"
- **THEN** the edge from `cart.js` to `log.js` uses the inferred style with the label 1

#### Scenario: Calls within a class
- **GIVEN** `Cart.add` calls `Cart.save`
- **WHEN** the diagram is shown at "Classes"
- **THEN** no edge is drawn for this call

#### Scenario: Callee outside the scope
- **GIVEN** a diagram scoped to `src/cart` and `Cart.save` calls `Store.persist` in `src/store`
- **WHEN** the diagram is shown at "Files"
- **THEN** `cart.js` shows an outgoing stub with the count of out-of-scope callees

### Requirement: Dependency cycles
At the "Classes" and "Files" levels, the diagram SHALL mark every box that belongs to a dependency cycle and every visible edge between two boxes of the same cycle. A cycle is a group of two or more boxes that reach each other through visible edges. Cycles SHALL be determined from the visible edges only. At the "Functions" level, no cycles SHALL be marked.

#### Scenario: Two files calling each other
- **GIVEN** `cart.js` calls `store.js` and `store.js` calls `cart.js`, both with `certain` calls
- **WHEN** the diagram is shown at "Files"
- **THEN** both boxes and both edges are marked as a cycle

#### Scenario: Cycle only through inferred calls
- **GIVEN** `cart.js` calls `store.js` with a `certain` call and `store.js` calls `cart.js` only with an `inferred` call
- **WHEN** the user enables "hide inferred edges"
- **THEN** the remaining edge from `cart.js` to `store.js` and both boxes are no longer marked

#### Scenario: Longer cycle
- **GIVEN** `a.js` calls `b.js`, `b.js` calls `c.js` and `c.js` calls `a.js`, and `d.js` calls `a.js`
- **WHEN** the diagram is shown at "Files"
- **THEN** `a.js`, `b.js`, `c.js` and the three edges between them are marked, and `d.js` and its edge are not

#### Scenario: Recursion at the function level
- **GIVEN** `a` calls `b` and `b` calls `a`
- **WHEN** the diagram is shown at "Functions"
- **THEN** no cycle is marked

### Requirement: Cycle navigation
At the "Classes" and "Files" levels, the toolbar SHALL show the number of dependency cycles in the diagram and, when there is at least one, SHALL offer to step to the next and previous cycle. Stepping to a cycle SHALL fit the view to the boxes of that cycle and highlight them. When there are no cycles, the toolbar SHALL say so.

#### Scenario: Stepping through cycles
- **GIVEN** a diagram at "Files" with 3 cycles
- **WHEN** the user steps to the next cycle twice
- **THEN** the toolbar shows "cycle 2 of 3" and the view is fitted to the boxes of the second cycle

#### Scenario: Count follows the filter
- **GIVEN** a diagram at "Files" with 3 cycles, one of which exists only through `inferred` calls
- **WHEN** the user enables "hide inferred edges"
- **THEN** the toolbar shows 2 cycles

#### Scenario: No cycles
- **GIVEN** a diagram at "Classes" without cycles
- **WHEN** it is shown
- **THEN** the toolbar states that there are no cycles and offers no stepping

### Requirement: Location marker at the class and file level
At the "Classes" and "Files" levels, the location marker SHALL mark the box that contains the current function, with the same behavior as at the "Functions" level.

#### Scenario: Marker at the file level
- **GIVEN** live mode is on and a tab at "Files" shows `cart.js`
- **WHEN** the user clicks into `Cart.add` in `cart.js` in the editor
- **THEN** the box `cart.js` is marked as the cursor location

#### Scenario: Marker at the class level
- **GIVEN** live mode is on and a tab at "Classes" shows the box for the loose functions of `format.js`
- **WHEN** the user clicks into the top-level function `formatPrice` in the editor
- **THEN** the box for the loose functions of `format.js` is marked as the cursor location

## MODIFIED Requirements

### Requirement: Nested frames
At the "Functions" level, the diagram SHALL show every function and method in its scope as a box, nested inside frames for its folders, namespace/module, file and class/container, following the same hierarchy as the treemap. At the "Classes" and "Files" levels, the boxes are classes or files, nested in the frames above them. Each frame SHALL show its name.

#### Scenario: Method in a class in a file in a folder
- **GIVEN** method `add` of class `Cart` in `src/cart/cart.js`
- **WHEN** the workspace diagram is shown at "Functions"
- **THEN** the box `add` lies inside frame `Cart`, inside frame `cart.js`, inside frame `src/cart`

#### Scenario: Single-child folder chains
- **GIVEN** folders `src/app/core` where `src` and `app` contain only one subfolder each
- **WHEN** the diagram is shown
- **THEN** they are shown as one frame `src/app/core`, as in the system map

### Requirement: Visual encoding
Function nodes SHALL be wide enough for their name, their height SHALL grow moderately with the function's LOC within fixed bounds, and their color SHALL use the same Code Health / hotspot color scale as the treemap. Class and file boxes SHALL be wide enough for their name, their height SHALL grow moderately with the LOC of their functions within fixed bounds, and their color SHALL use the same scales with the value of the class or file.

#### Scenario: Hotspot color
- **GIVEN** a function with low Code Health and high churn
- **WHEN** the diagram is shown
- **THEN** its box has the same hotspot color it would have in the treemap

#### Scenario: File color
- **GIVEN** file `cart.js` with low Code Health
- **WHEN** the diagram is shown at "Files" with the Code Health color mode
- **THEN** the box `cart.js` has the color the treemap uses for this file

### Requirement: Zoom levels
The diagram SHALL support pan and zoom. At the "Functions" level, far zoom levels SHALL show only frames, their names and bundled edges between frames with call counts; function boxes and labels SHALL appear as the user zooms in. At the "Classes" and "Files" levels, boxes, their names, edges and edge labels SHALL be shown at every zoom level.

#### Scenario: Zoomed out
- **GIVEN** the workspace diagram at "Functions" fully zoomed out
- **WHEN** it is shown
- **THEN** top-level frames with names and aggregated edges with counts are visible, without individual function labels

#### Scenario: Zoomed in
- **WHEN** the user zooms into a class frame at "Functions"
- **THEN** the function boxes and their names inside it become visible

#### Scenario: Zoomed out at the file level
- **GIVEN** the workspace diagram at "Files" fitted to the canvas
- **WHEN** it is shown
- **THEN** every file box with its name and every edge with its call count is drawn

### Requirement: Selection and navigation
Clicking a box SHALL select it, highlight its incoming and outgoing edges and connected boxes, and select the same function, class or file in the other Auspex views. Double-clicking a function box SHALL open its file at the function's start line; double-clicking a class box SHALL open its file at the class's start line; double-clicking a file box SHALL open the file.

#### Scenario: Highlight calls
- **WHEN** the user clicks `Cart.add`
- **THEN** its callers and callees and the connecting edges are highlighted and other elements are dimmed

#### Scenario: Open source
- **WHEN** the user double-clicks `Cart.add`
- **THEN** the file containing `Cart.add` opens with its start line revealed

#### Scenario: Select a file
- **GIVEN** the diagram at "Files"
- **WHEN** the user clicks the box `cart.js`
- **THEN** the files calling and called by `cart.js` and the connecting edges are highlighted, and `cart.js` is selected in the other Auspex views

#### Scenario: Open a class
- **GIVEN** the diagram at "Classes"
- **WHEN** the user double-clicks the box `Cart`
- **THEN** `cart.js` opens with the start line of class `Cart` revealed

### Requirement: Filters
The diagram SHALL offer filters to hide `inferred` edges, to show only hotspot functions (and the edges between them), and to restrict the view to a folder within the current scope. Filters SHALL apply without re-opening the tab. At the "Classes" and "Files" levels, hiding `inferred` edges SHALL remove the `inferred` calls from every combined edge, update its count, and remove edges left without calls; "hotspots only" SHALL keep the boxes in hotspot files.

#### Scenario: Hide inferred edges
- **WHEN** the user enables "hide inferred edges"
- **THEN** only `certain` edges remain visible

#### Scenario: Hotspots only
- **WHEN** the user enables "hotspots only"
- **THEN** only functions classified as hotspots, their frames and the edges between them remain visible

#### Scenario: Hide inferred calls in combined edges
- **GIVEN** at "Files" an edge from `cart.js` to `store.js` with 3 `certain` and 2 `inferred` calls, and an edge from `cart.js` to `log.js` with 1 `inferred` call
- **WHEN** the user enables "hide inferred edges"
- **THEN** the edge to `store.js` shows 3 and the edge to `log.js` is hidden
