# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
