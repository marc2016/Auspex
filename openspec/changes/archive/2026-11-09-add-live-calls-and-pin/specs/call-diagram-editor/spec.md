# Spec Delta

## ADDED Requirements

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
