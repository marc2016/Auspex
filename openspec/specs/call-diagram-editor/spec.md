# call-diagram-editor Specification

## Purpose
Defines the Call Diagram editor tab, which shows the functions of a workspace or folder as boxes nested in frames for their structure, connected by their calls, so users can see how code connects across files and modules.

## Requirements

### Requirement: Opening a call diagram
The system SHALL provide a command "Auspex: Open Call Diagram" that opens the diagram for the whole workspace in a new editor tab, and a context action on folders in the treemap that opens a diagram scoped to that folder. The diagram action of the subject in the Calls view SHALL open a diagram focused on that function. Each invocation SHALL open a separate tab, titled with its scope or focus function.

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

#### Scenario: Focused diagram from the Calls view
- **GIVEN** the Calls view shows `Cart.add` as its subject
- **WHEN** the user activates the subject's diagram action
- **THEN** a new tab "Call Diagram: Cart.add" opens, focused on `Cart.add` with the default depths

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

### Requirement: Automatic updates
When a new analysis result is available (after a scan or a file save), every open diagram SHALL update to it while keeping its scope, filters, viewport and selection where the selected function still exists.

#### Scenario: File saved
- **GIVEN** an open diagram showing `Cart.add`
- **WHEN** the user adds a call in `Cart.add` and saves
- **THEN** the new edge appears without the viewport resetting

### Requirement: Responsiveness
While the layout is being computed, the tab SHALL show progress in the diagram canvas and SHALL NOT block the editor. Once shown, pan and zoom SHALL remain interactive for workspaces with several thousand functions.

#### Scenario: Large workspace
- **GIVEN** a workspace with 3,000 functions
- **WHEN** the workspace diagram is opened
- **THEN** a progress indicator is shown in the diagram canvas until the first view appears, and the VS Code UI stays responsive meanwhile

### Requirement: Loading indicator in the canvas
While a diagram is loading and no diagram is shown yet, the tab SHALL show a loading indicator centered in the diagram canvas. The indicator SHALL show an activity animation, the current step out of three (waiting for analysis, building structure, computing layout), the number of functions being laid out once it is known, and the elapsed time since the load started. The indicator SHALL NOT show a percentage.

#### Scenario: Waiting for the analysis
- **GIVEN** a diagram tab opened before any analysis result exists
- **WHEN** the scan is still running
- **THEN** the canvas shows the indicator with step 1 of 3 "waiting for analysis" and a running elapsed time, without a function count

#### Scenario: Computing the layout
- **GIVEN** a workspace with 3,000 functions
- **WHEN** the structure has been built and the layout is being computed
- **THEN** the canvas shows step 3 of 3 "computing layout", "3,000 functions" and the elapsed time

#### Scenario: Elapsed time spans all steps
- **GIVEN** a load that spent 2 seconds in step 1
- **WHEN** the indicator switches to step 2
- **THEN** the elapsed time continues from 2 seconds instead of restarting

#### Scenario: Focus tab waiting for workspace data
- **GIVEN** a tab opened in focus mode on `Cart.add`
- **WHEN** the workspace-wide data for the focus has not arrived yet
- **THEN** the canvas shows the loading indicator and not the empty state

#### Scenario: Indicator disappears
- **WHEN** the layout is finished and the diagram is shown
- **THEN** the indicator is removed

### Requirement: Re-layout keeps the previous diagram
When a shown diagram is laid out again (folder restriction, focus or depth change, new analysis result), the previous diagram SHALL stay visible until the new one is ready. If the re-layout takes longer than a short delay (about 0.3 s), the previous diagram SHALL be dimmed and the loading indicator SHALL be shown on top of it. The indicator SHALL NOT block pan and zoom.

#### Scenario: Slow re-layout
- **GIVEN** a shown workspace diagram with 3,000 functions
- **WHEN** a new analysis result arrives and the layout takes several seconds
- **THEN** the previous diagram stays visible but dimmed, the loading indicator is shown on top, and the user can still pan and zoom

#### Scenario: Fast re-layout
- **GIVEN** a shown focus diagram with 12 functions
- **WHEN** the user changes the callee depth and the new layout is ready within 0.3 s
- **THEN** the diagram changes without the indicator or the dimming appearing

### Requirement: Error and empty state in the canvas
If the layout fails, the tab SHALL show the error message centered in the canvas. If the current scope, folder restriction or focus contains no functions, the tab SHALL show the empty-state message centered in the canvas. Neither message SHALL be shown while a load is running.

#### Scenario: No functions in the scope
- **GIVEN** a diagram opened for a folder without any functions
- **WHEN** loading is finished
- **THEN** the canvas shows "no functions in this area" in its center

#### Scenario: Layout error
- **WHEN** the layout computation fails
- **THEN** the canvas shows the error message in its center and no loading indicator

### Requirement: Fit after a folder restriction change
When the user chooses, changes or clears the folder restriction, the tab SHALL fit the view to the resulting diagram once it is laid out. A new analysis result alone SHALL NOT change the viewport.

#### Scenario: Restricting to a small folder
- **GIVEN** a workspace diagram with 3,000 functions fitted to the tab
- **WHEN** the user restricts the view to a folder with 5 functions
- **THEN** the 5 functions fill the canvas instead of appearing as tiny boxes in a corner

#### Scenario: Clearing the restriction
- **GIVEN** a diagram restricted to a folder and zoomed in
- **WHEN** the user clears the folder restriction
- **THEN** the whole diagram of the scope is fitted to the canvas

#### Scenario: File saved while restricted
- **GIVEN** a diagram restricted to a folder, panned and zoomed by the user
- **WHEN** a new analysis result arrives after a file save
- **THEN** the diagram updates and the viewport stays where the user left it

### Requirement: Fit only when the canvas has a size
The tab SHALL NOT fit the view while the diagram canvas has no width or no height. A fit that could not run SHALL be carried out as soon as the canvas has a size, so that a diagram is never shown at zoom 0.

#### Scenario: Layout finishes in a tab without a size
- **GIVEN** a diagram tab whose canvas has no size while its layout finishes
- **WHEN** the canvas gets a size
- **THEN** the diagram is fitted to the canvas and is visible

#### Scenario: Canvas resized after the fit
- **GIVEN** a diagram that has been fitted and then zoomed by the user
- **WHEN** the tab is resized
- **THEN** the viewport stays as the user left it

### Requirement: Focus on a function
The diagram SHALL offer a focus mode with a start function, a caller depth and a callee depth. In focus mode it SHALL show only the start function, the functions that reach it through at most the caller depth of calls, and the functions it reaches through at most the callee depth of calls, laid out with callers above and callees below, inside their frames. Each depth SHALL be selectable from 0 to 10 or "all", defaulting to 2.

#### Scenario: Caller chain and callees
- **GIVEN** `onSubmit` calls `saveOrder`, `saveOrder` calls `Cart.add`, and `Cart.add` calls `Store.persist`, which calls `writeFile`
- **WHEN** the diagram is focused on `Cart.add` with caller depth 2 and callee depth 1
- **THEN** `onSubmit`, `saveOrder`, `Cart.add` and `Store.persist` are shown, `writeFile` is not, and `onSubmit` is above `saveOrder`, which is above `Cart.add`, which is above `Store.persist`

#### Scenario: Depth zero
- **WHEN** the diagram is focused on `Cart.add` with caller depth 0 and callee depth 0
- **THEN** only `Cart.add` is shown

#### Scenario: Unlimited depth
- **GIVEN** a chain of 15 callers above `Cart.add`
- **WHEN** the caller depth is set to "all"
- **THEN** all 15 callers are shown

### Requirement: Focus traversal rules
The focus traversal SHALL use the whole workspace call graph regardless of the tab's folder scope, SHALL include each function at most once (call cycles are not followed again), SHALL follow `inferred` edges only while inferred edges are shown, and SHALL include declarative callers (references from non-code files) on the caller side as file frames.

#### Scenario: Caller outside the tab's folder
- **GIVEN** a tab scoped to `src/cart` and a caller of `Cart.add` in `src/ui`
- **WHEN** the tab is focused on `Cart.add` with caller depth 1
- **THEN** the caller in `src/ui` is shown

#### Scenario: Cycle
- **GIVEN** `a` calls `b` and `b` calls `a`
- **WHEN** the diagram is focused on `a` with callee depth "all"
- **THEN** `a` and `b` are each shown once, with both edges

#### Scenario: Hidden inferred edges
- **GIVEN** `x` reaches `Cart.add` only through an `inferred` edge
- **WHEN** "hide inferred edges" is enabled and the diagram is focused on `Cart.add` with caller depth 1
- **THEN** `x` is not shown

#### Scenario: XML caller
- **GIVEN** `order.form` references `Cart.add`
- **WHEN** the diagram is focused on `Cart.add` with caller depth 1
- **THEN** a frame for `order.form` with an edge to `Cart.add` is shown

### Requirement: Focus boundary markers
In focus mode, a shown function whose callers or callees beyond the depth limit are not shown SHALL display the number of hidden callers and hidden callees (for example "+3").

#### Scenario: More callers beyond the depth
- **GIVEN** `saveOrder` has 3 callers and the focus on `Cart.add` uses caller depth 1, so that `saveOrder` is at the limit
- **WHEN** the diagram is shown
- **THEN** `saveOrder` shows "+3" callers

### Requirement: Large focus warning
When a focus would contain more than 300 functions, the diagram SHALL show a warning that suggests reducing a depth, and SHALL still show the result.

#### Scenario: Wide fan-in
- **GIVEN** a function with 400 transitive callers
- **WHEN** the caller depth is set to "all"
- **THEN** the diagram shows the result together with a warning to reduce the depth

### Requirement: Focus bar
In focus mode, the tab SHALL show a focus bar with the start function, the caller depth, the callee depth and an action to leave focus mode. Changing a depth SHALL update the diagram in place; leaving focus mode SHALL return to the tab's scope view.

#### Scenario: Change depth
- **GIVEN** a diagram focused on `Cart.add` with callee depth 1
- **WHEN** the user changes the callee depth to 3
- **THEN** the diagram updates in the same tab with callees up to depth 3

#### Scenario: Leave focus
- **WHEN** the user leaves focus mode
- **THEN** the tab shows its scope view again with the previous filters

### Requirement: Focus entry points
Users SHALL be able to start a focus from the diagram (select a function, then a "Focus" action), from the Calls view subject, from a CodeLens "In diagram" above each known function, and from the editor context menu command "Auspex: Show Calls in Diagram" for the function at the cursor. The CodeLens SHALL follow `auspex.codeLens.enabled`.

#### Scenario: Focus from the diagram
- **GIVEN** `Cart.add` is selected in a diagram
- **WHEN** the user activates "Focus"
- **THEN** the same tab switches to focus mode on `Cart.add`

#### Scenario: CodeLens
- **GIVEN** CodeLens is enabled
- **WHEN** the user activates "In diagram" above `Cart.add`
- **THEN** a new diagram tab focused on `Cart.add` opens

#### Scenario: Editor context menu
- **GIVEN** the cursor is inside `Cart.add` in the editor
- **WHEN** the user runs "Auspex: Show Calls in Diagram" from the context menu
- **THEN** a new diagram tab focused on `Cart.add` opens

#### Scenario: Cursor outside a function
- **GIVEN** the cursor is on a line that belongs to no known function
- **WHEN** the user runs "Auspex: Show Calls in Diagram"
- **THEN** an information message says that no function was found at the cursor and no tab opens

### Requirement: Diagram tabs follow the current function
While live mode is on, each call diagram tab that is not pinned SHALL follow the current function from the text cursor:
- a tab in focus mode SHALL change its start function to the current function, keeping its caller depth, callee depth and filters;
- a tab not in focus mode SHALL mark the current function's box as the cursor location and scroll it into view, without a new layout.
A current function without call data SHALL NOT change a tab.

#### Scenario: Focus tab re-focuses
- **GIVEN** live mode is on and a diagram tab is focused on `Cart.add` with caller depth 1 and callee depth 3, not pinned
- **WHEN** the user clicks into `Cart.remove`
- **THEN** the tab is focused on `Cart.remove` with caller depth 1 and callee depth 3

#### Scenario: Scope tab marks only
- **GIVEN** live mode is on and a workspace diagram tab is open, not pinned
- **WHEN** the user clicks into `Cart.remove`
- **THEN** the box of `Cart.remove` is marked as the cursor location and is scrolled into view, and the layout is unchanged

### Requirement: Pinning a diagram tab
Each call diagram tab SHALL offer a pin toggle, shown in the focus bar in focus mode and in the toolbar otherwise. While pinned, the tab's scope, focus, depths and layout SHALL NOT be changed by the current function or by selections in other views. Unpinning a focus tab while live mode is on and a current function with call data exists SHALL focus it on that function. Pin states SHALL be independent per tab and independent of the Calls view pin.

#### Scenario: Pinned focus stays
- **GIVEN** a diagram tab focused on `Cart.add` is pinned and live mode is on
- **WHEN** the user clicks into `Cart.remove`
- **THEN** the tab stays focused on `Cart.add`

#### Scenario: Independent pins
- **GIVEN** diagram tab A is pinned, diagram tab B is not pinned, and the Calls view is not pinned
- **WHEN** the user clicks into `Cart.remove`
- **THEN** tab B and the Calls view follow `Cart.remove` and tab A does not change its focus

### Requirement: Location marker in diagram tabs
While live mode is on, every diagram tab (pinned or not) SHALL mark the box of the current function as the cursor location when it is shown in the tab. The marker SHALL be visually distinct from the click selection, SHALL NOT highlight edges, and SHALL coexist with a selection on another box. When the marked box lies outside the visible area it SHALL be scrolled into view without changing the zoom; when it is visible the viewport SHALL NOT move. When live mode is switched off, markers SHALL be removed.

#### Scenario: Marker in a pinned tab
- **GIVEN** a pinned tab focused on `OrderForm.submit` that shows `Cart.add`
- **WHEN** the user clicks into `Cart.add` in the editor
- **THEN** the box of `Cart.add` is marked as the cursor location and the focus is unchanged

#### Scenario: Marker outside the viewport
- **GIVEN** a pinned tab where the box of `Cart.add` is outside the visible area
- **WHEN** `Cart.add` becomes the current function
- **THEN** the viewport pans so that the box is visible, at the same zoom

#### Scenario: Marker and selection
- **GIVEN** the user selected `Cart.save` in the diagram, highlighting its edges
- **WHEN** `Cart.add` becomes the current function
- **THEN** `Cart.add` is marked as the cursor location and `Cart.save` stays selected with its edges highlighted

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

### Requirement: Current function outside a pinned tab
When a pinned tab in focus mode does not contain the current function and the current function has call data, the focus bar SHALL state that the current function is outside the diagram and SHALL offer an action "Focus here" that focuses the tab on it while keeping its depths and its pin. The note SHALL disappear when the current function is shown in the tab again.

#### Scenario: Outside the focus
- **GIVEN** a pinned tab focused on `Cart.add` with depths 1/1 that does not contain `Report.render`
- **WHEN** the user clicks into `Report.render`
- **THEN** the focus bar states that `Report.render` is outside the diagram and offers "Focus here"

#### Scenario: Focus here
- **GIVEN** the note for `Report.render` is shown in a pinned tab
- **WHEN** the user activates "Focus here"
- **THEN** the tab is focused on `Report.render` with the same depths and remains pinned
