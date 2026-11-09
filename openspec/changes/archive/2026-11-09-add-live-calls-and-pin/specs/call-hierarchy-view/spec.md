# Spec Delta

## ADDED Requirements

### Requirement: Calls view follows the current function
While live mode is on and the Calls view is not pinned, the Calls view SHALL show the current function from the text cursor as its subject. Explicit selections (treemap, call diagram, CodeLens) SHALL continue to set the subject as before; the most recent of cursor change and explicit selection wins. When the current function has no call data yet, the view SHALL state that the function has not been analyzed and that saving the file analyzes it.

#### Scenario: Follow the cursor
- **GIVEN** live mode is on and the Calls view is not pinned
- **WHEN** the user clicks into `Cart.add`
- **THEN** the Calls view shows `Cart.add` as its subject with its callers and callees

#### Scenario: Unsaved new function
- **GIVEN** live mode is on and the Calls view is not pinned
- **WHEN** the cursor is placed in a new, unsaved function `Cart.clear`
- **THEN** the Calls view shows `Cart.clear` with a hint that saving the file analyzes its calls

#### Scenario: Navigating the call chain
- **GIVEN** live mode is on, the Calls view is not pinned and shows `Cart.add`
- **WHEN** the user clicks the caller `OrderForm.submit` in the incoming tree
- **THEN** its file opens at `OrderForm.submit` and the Calls view shows `OrderForm.submit` as its subject

### Requirement: Pinning the Calls view
The Calls view SHALL offer a pin toggle in its title bar. While pinned, its subject SHALL NOT be replaced by the current function, by selections in the treemap or call diagram, or by CodeLens; opening entries from the view SHALL NOT change the subject. Unpinning SHALL set the subject to the current function if live mode is on and a current function exists, and otherwise keep the subject. The pin state SHALL be visible in the view.

#### Scenario: Pinned subject stays
- **GIVEN** the Calls view shows `Cart.add` and is pinned
- **WHEN** the user clicks into `Cart.remove` in the editor or selects `Cart.remove` in the treemap
- **THEN** the Calls view still shows `Cart.add`

#### Scenario: Unpinning
- **GIVEN** the Calls view is pinned on `Cart.add`, live mode is on, and the cursor is in `Cart.remove`
- **WHEN** the user unpins the view
- **THEN** the Calls view shows `Cart.remove`

### Requirement: Location marker in the pinned Calls view
While the Calls view is pinned and live mode is on, every entry in the incoming and outgoing trees that represents the current function SHALL be visibly marked as the cursor location, and the subject SHALL be marked when it is the current function. The marker SHALL be distinct from the inferred/recursive markers and SHALL move as the current function changes.

#### Scenario: Current function among callees
- **GIVEN** the Calls view is pinned on `OrderForm.submit`, whose outgoing tree contains `Cart.add`
- **WHEN** the user clicks into `Cart.add` in the editor
- **THEN** the `Cart.add` entry in the outgoing tree is marked as the cursor location

#### Scenario: Current function not shown
- **GIVEN** the Calls view is pinned on `OrderForm.submit`
- **WHEN** the cursor is in a function that appears nowhere in the shown trees
- **THEN** no entry is marked

### Requirement: Editor switches keep the subject
Switching the active editor to another file SHALL NOT replace the Calls view subject with that file. The Calls view SHALL keep its subject until a function becomes the subject by an explicit selection or, in live mode, by the cursor. Explicitly selecting a folder, file or class in the treemap SHALL still show the hint to select a function when the view is not pinned.

#### Scenario: Switching files with live mode off
- **GIVEN** live mode is off and the Calls view shows `Cart.add`
- **WHEN** the user switches to the editor of `order.ts`
- **THEN** the Calls view still shows `Cart.add`

#### Scenario: Treemap file selection
- **GIVEN** the Calls view is not pinned
- **WHEN** the user selects the file `order.ts` in the treemap
- **THEN** the Calls view shows the hint to select a function
