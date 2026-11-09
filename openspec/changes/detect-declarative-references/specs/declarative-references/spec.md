# Spec Delta

## Purpose

Defines how Auspex finds references to JavaScript functions in XML-based files of in-house formats, resolves them to known functions and contributes them as callers to the call analysis.

## ADDED Requirements

### Requirement: Reference rules setting
The system SHALL read reference rules from the setting `auspex.declarativeReferences`. Each rule SHALL contain a file glob and at least one of: attribute names, element names, or a file/function attribute pair. Rules with invalid entries SHALL be ignored with a warning, without failing the scan.

#### Scenario: Valid rule
- **GIVEN** the rule `{ "files": "**/*.form", "attributes": ["onClick", "handler"] }`
- **WHEN** a scan runs
- **THEN** files matching `**/*.form` are searched for references in `onClick` and `handler` attributes

#### Scenario: Invalid rule
- **GIVEN** a rule without `files`
- **WHEN** a scan runs
- **THEN** the rule is ignored, a warning names it, and the scan completes

#### Scenario: No rules
- **GIVEN** no rules are configured and the heuristic mode is off
- **WHEN** a scan runs
- **THEN** no declarative references are extracted

### Requirement: Extraction from matching files
For each file matching a rule, the system SHALL read it as XML regardless of its file extension and extract the values of the configured attributes and the text of the configured elements, each with its line number. Malformed content SHALL be scanned as far as possible without failing the scan.

#### Scenario: Custom extension
- **GIVEN** a file `order.form` with `<button onClick="Cart.save"/>` on line 12, matching a rule for `onClick`
- **WHEN** the scan runs
- **THEN** a reference `Cart.save` at `order.form:12` is extracted

#### Scenario: Element text
- **GIVEN** a rule with `"elements": ["handler"]` and the content `<handler>validateOrder</handler>`
- **WHEN** the scan runs
- **THEN** a reference `validateOrder` is extracted with the element's line

#### Scenario: Malformed file
- **GIVEN** a matching file with an unclosed tag before a valid `onClick` attribute
- **WHEN** the scan runs
- **THEN** the valid reference is still extracted and the scan completes

### Requirement: Reference forms
The system SHALL interpret a reference value as one of: a bare function name, a qualified `Container.method` name, or a JavaScript expression from which every called name (`name(` or `a.b(`) is taken as a reference. For a rule with a file/function attribute pair, the two attributes of one element SHALL form a single reference to that function in that file.

#### Scenario: Expression value
- **GIVEN** `onClick="save(this, 1); track('x')"`
- **WHEN** the reference is interpreted
- **THEN** references `save` and `track` are produced

#### Scenario: File and function pair
- **GIVEN** a rule with `"fileAttribute": "script", "functionAttribute": "function"` and `<action script="app/Cart.js" function="save"/>`
- **WHEN** the reference is interpreted
- **THEN** one reference to `save` in `app/Cart.js` is produced

### Requirement: Resolution to known functions
The system SHALL resolve each reference against the functions known from the structure analysis: a file/function pair to that function in that file; `Container.method` to the method of the uniquely named container; a bare name to the unique function of that name. A unique match SHALL be `certain`; a name matching several functions SHALL produce an `inferred` edge to each candidate.

#### Scenario: Qualified name
- **GIVEN** exactly one container `Cart` with method `save`
- **WHEN** `Cart.save` from `order.form:12` is resolved
- **THEN** a `certain` edge from location `order.form:12` to `Cart.save` exists

#### Scenario: Ambiguous bare name
- **GIVEN** two functions named `save` in different files
- **WHEN** the bare reference `save` is resolved
- **THEN** two `inferred` edges exist, one to each `save`

### Requirement: Declarative edges in the call analysis
Resolved references SHALL be contributed to the call analysis as edges with source kind `declarative` and a location caller (file and line), so that they appear among the incoming calls of the referenced function.

#### Scenario: XML caller in the Calls view
- **GIVEN** `order.form:12` references `Cart.save`
- **WHEN** the user views the calls of `Cart.save`
- **THEN** `order.form:12` is listed as an incoming caller with the non-code icon

#### Scenario: Caller counts
- **GIVEN** `Cart.save` has one JS caller and two declarative references
- **WHEN** its call count CodeLens is shown
- **THEN** it reports 3 callers

### Requirement: Unresolved references
References that match no known function SHALL NOT produce edges. Unmatched bare names, qualified names and file/function pairs SHALL be listed with file, line and value in the "Auspex" output channel after each scan; unmatched names taken from expressions SHALL be dropped silently, since they are typically built-ins.

#### Scenario: Typo in a handler
- **GIVEN** `onClick="Cart.sav"` and no method `sav` exists
- **WHEN** the scan completes
- **THEN** the output channel lists `Cart.sav` with its file and line, and no edge is created

#### Scenario: Built-in call in an expression
- **GIVEN** `onClick="save(); alert('ok')"` and no workspace function `alert`
- **WHEN** the scan completes
- **THEN** `alert` is neither an edge nor listed as unresolved

### Requirement: Heuristic mode
When the setting `auspex.declarativeReferences.heuristic` is enabled (default: disabled), the system SHALL additionally scan files without a matching rule whose content starts with an XML declaration or root element, consider all attribute values, and keep only values that contain a call expression, a qualified name matching a known container method, or a name that matches exactly one known function. All heuristic edges SHALL be `inferred`.

#### Scenario: Heuristic match
- **GIVEN** heuristic mode is enabled and an unconfigured file `x.view` starting with `<?xml` contains `action="Cart.save"`
- **WHEN** the scan runs
- **THEN** an `inferred` declarative edge from `x.view` to `Cart.save` exists

#### Scenario: Heuristic ignores plain text
- **GIVEN** heuristic mode is enabled and an attribute `title="Save order"`
- **WHEN** the scan runs
- **THEN** no edge is created for it

### Requirement: Cached declarative references
Extracted references SHALL be cached per file under the same reuse rules as other per-file analysis results, and SHALL be re-extracted for all matching files when the reference rules change.

#### Scenario: Rules changed
- **GIVEN** cached references from a previous scan
- **WHEN** the user adds an attribute to a rule and a scan runs
- **THEN** references are re-extracted for files matching the changed rule
