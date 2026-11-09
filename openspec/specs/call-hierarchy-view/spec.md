# call-hierarchy-view Specification

## Purpose
Defines the "Calls" sidebar view that shows who calls a selected function and what it calls, annotated with Auspex metrics, and how users reach it from the treemap and the editor.

## Requirements

### Requirement: Calls view
The system SHALL provide a sidebar view "Calls" in the Auspex view container that shows, for the selected function or method, two expandable trees: incoming calls (callers) and outgoing calls (callees).

#### Scenario: Function selected
- **GIVEN** the user selects the method `Cart.add` in the treemap
- **WHEN** the Calls view is visible
- **THEN** it shows `Cart.add` as its subject, its callers under "Incoming" and its callees under "Outgoing"

#### Scenario: Non-function selected
- **GIVEN** the user selects a folder, file or class
- **WHEN** the Calls view is visible
- **THEN** it shows a hint to select a function instead of a call tree

#### Scenario: No calls
- **GIVEN** a selected function that has no callers
- **WHEN** the Calls view shows it
- **THEN** the incoming section states that no callers were found

### Requirement: Expanding the call tree
Each entry in the incoming or outgoing tree SHALL be expandable to show its own callers or callees respectively, loaded when expanded. An entry that already appears on the path from the subject SHALL be marked as recursive and SHALL NOT be expandable further.

#### Scenario: Expanding a caller
- **GIVEN** `Cart.add` is called by `OrderForm.submit`
- **WHEN** the user expands `OrderForm.submit` in the incoming tree
- **THEN** the callers of `OrderForm.submit` are shown beneath it

#### Scenario: Cycle
- **GIVEN** `a` calls `b` and `b` calls `a`
- **WHEN** the user expands `a` -> `b` in the outgoing tree of `a`
- **THEN** `a` appears beneath `b` marked as recursive and cannot be expanded

### Requirement: Metric annotations
Each function entry SHALL show its name, its containing file, its Code Health score, a churn/hotspot color consistent with the treemap, and its LOC. Each entry SHALL indicate whether the edge leading to it is `certain` or `inferred`, and entries whose caller is a non-code location SHALL show the file and line with a distinct icon.

#### Scenario: Inferred edge display
- **GIVEN** the edge from `save` to `render` is `inferred`
- **WHEN** `render` is shown in the outgoing tree of `save`
- **THEN** the entry is visually marked as inferred

#### Scenario: Location caller display
- **GIVEN** `Cart.save` is referenced from `order.form` line 12
- **WHEN** the incoming tree of `Cart.save` is shown
- **THEN** an entry `order.form:12` with a non-code icon is shown, without health or LOC

### Requirement: Navigation from the Calls view
Clicking an entry SHALL open the corresponding file in the editor at the function's start line (or the referenced line for location callers).

#### Scenario: Open caller
- **WHEN** the user clicks `OrderForm.submit` in the incoming tree
- **THEN** the file containing `OrderForm.submit` opens with its start line revealed

### Requirement: Call count CodeLens
When CodeLens is enabled, the system SHALL show above each known function a CodeLens with the number of callers and callees known for it. Activating it SHALL select that function and reveal the Calls view.

#### Scenario: Call count lens
- **GIVEN** `Cart.add` has 5 known callers and 3 known callees
- **WHEN** its file is open with CodeLens enabled
- **THEN** a lens reading "5 callers | 3 calls" is shown above `Cart.add`

#### Scenario: Activating the lens
- **WHEN** the user activates the call count lens of `Cart.add`
- **THEN** the Calls view is revealed with `Cart.add` as its subject

#### Scenario: CodeLens disabled
- **GIVEN** the setting `auspex.codeLens.enabled` is false
- **WHEN** a file is opened
- **THEN** no call count lens is shown

### Requirement: Call data availability states
The Calls view SHALL indicate when call data is not yet available (no scan yet), when language server results are still loading for the subject, and when the subject's language has no call support beyond name-based resolution.

#### Scenario: Before the first scan
- **GIVEN** no analysis has been run
- **WHEN** the Calls view is opened
- **THEN** it explains that a scan is needed and offers to start one

#### Scenario: Language server loading
- **GIVEN** a subject whose language has a call hierarchy provider
- **WHEN** the query is in progress
- **THEN** Auspex-resolved entries are shown together with a loading indicator

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
