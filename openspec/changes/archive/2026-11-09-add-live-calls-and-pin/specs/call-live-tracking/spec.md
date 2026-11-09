# Spec Delta

## Purpose

Defines live mode: how the function at the editor's text cursor is determined and handed to the Calls view and the call diagram tabs, so that the call information follows the code the user is working in.

## ADDED Requirements

### Requirement: Live mode switch
The system SHALL provide a live mode that is either on or off for the workspace, on by default. It SHALL be switchable from a toggle in the Calls view title bar and from a command "Auspex: Toggle Live Calls". The toggle SHALL show the current state. The state SHALL persist across restarts.

#### Scenario: Default
- **GIVEN** the user has never changed live mode
- **WHEN** the extension starts
- **THEN** live mode is on

#### Scenario: Switching off
- **GIVEN** live mode is on
- **WHEN** the user activates the toggle in the Calls view title bar
- **THEN** live mode is off, the toggle shows the off state, and cursor movements no longer change any call view

#### Scenario: Persisted
- **GIVEN** the user switched live mode off
- **WHEN** VS Code is restarted
- **THEN** live mode is still off

### Requirement: Current function from the text cursor
While live mode is on, the system SHALL determine the current function from the primary text cursor of the active file editor whenever the cursor position or the active editor changes. Changes by mouse click, keyboard and programmatic navigation (for example Go to Definition or opening a file from an Auspex view) SHALL count; mouse hover SHALL NOT. The current function SHALL be the innermost known function or method whose range contains the cursor line.

#### Scenario: Click into a method
- **GIVEN** live mode is on and `cart.ts` contains the method `Cart.add`
- **WHEN** the user clicks into the body of `Cart.add`
- **THEN** `Cart.add` becomes the current function

#### Scenario: Nested function
- **GIVEN** `outer` contains a nested function `inner`
- **WHEN** the cursor is placed inside `inner`
- **THEN** `inner` becomes the current function, not `outer`

#### Scenario: Keyboard navigation
- **WHEN** the user moves the cursor with the arrow keys from `Cart.add` into `Cart.remove`
- **THEN** `Cart.remove` becomes the current function

#### Scenario: Live mode off
- **GIVEN** live mode is off
- **WHEN** the user clicks into `Cart.add`
- **THEN** the current function does not change

### Requirement: Resolution independent of unsaved line shifts
The current function SHALL be resolved against the file's structure as currently edited (including unsaved changes) and matched to the call data by file and qualified name, so that lines inserted or removed since the last analysis do not lead to a wrong function. When several call data functions in the file share the qualified name, the one whose start line is closest to the edited start line SHALL be used.

#### Scenario: Lines inserted above
- **GIVEN** the call data was computed when `Cart.add` started at line 10
- **AND** the user inserted 20 lines above it without saving
- **WHEN** the cursor is placed in `Cart.add`, now at line 32
- **THEN** `Cart.add` is the current function

#### Scenario: Function not in call data yet
- **GIVEN** the user typed a new function `Cart.clear` that has not been saved or analyzed
- **WHEN** the cursor is placed inside it
- **THEN** `Cart.clear` is the current function marked as having no call data yet

### Requirement: Cursor outside functions
When the cursor is not inside any known function, or the active editor is not a workspace file, the current function SHALL remain unchanged.

#### Scenario: Cursor in imports
- **GIVEN** `Cart.add` is the current function
- **WHEN** the user moves the cursor to the import block of the file
- **THEN** `Cart.add` remains the current function

#### Scenario: Focus moves to a webview
- **GIVEN** `Cart.add` is the current function
- **WHEN** the user clicks into the call diagram tab
- **THEN** `Cart.add` remains the current function

### Requirement: Responsive updates
Changes of the current function SHALL be applied to the Calls view within 300 ms after the cursor stops moving and to call diagram tabs within 600 ms. Cursor movements that stay within the same function SHALL NOT cause any update. Updates SHALL NOT block typing or cursor movement.

#### Scenario: Moving within a function
- **GIVEN** `Cart.add` is the current function
- **WHEN** the user moves the cursor between lines inside `Cart.add`
- **THEN** no call view is updated

#### Scenario: Fast scrolling through functions
- **WHEN** the user holds the down arrow and passes through five functions within one second
- **THEN** the call views update to the function where the cursor comes to rest, without showing every intermediate function
