# Spec Delta

## Purpose

Defines the "Calls" sidebar view that shows who calls a selected function and what it calls, annotated with Auspex metrics, and how users reach it from the treemap and the editor.

## ADDED Requirements

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
