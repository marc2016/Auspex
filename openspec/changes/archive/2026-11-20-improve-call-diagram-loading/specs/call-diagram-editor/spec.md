# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Responsiveness
While the layout is being computed, the tab SHALL show progress in the diagram canvas and SHALL NOT block the editor. Once shown, pan and zoom SHALL remain interactive for workspaces with several thousand functions.

#### Scenario: Large workspace
- **GIVEN** a workspace with 3,000 functions
- **WHEN** the workspace diagram is opened
- **THEN** a progress indicator is shown in the diagram canvas until the first view appears, and the VS Code UI stays responsive meanwhile
