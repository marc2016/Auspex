# Proposal

## Why

Projects often wire JavaScript functions to UI or process definitions in XML-based files with in-house file extensions (not `.xml`). These files reference JS functions declaratively, e.g. `handler="save"`, `handler="Cart.save"`, `script="app/Cart.js"` + `function="save"`, or `onClick="save(this, 1)"`. Today Auspex treats such files as opaque LOC tiles, so these references are invisible: a JS handler looks unused, its real callers are missing from the planned call hierarchy, and its risk is underestimated.

## What Changes

- New workspace setting `auspex.declarativeReferences`: a list of rules, each with a file glob (e.g. `**/*.form`) and where JS references occur:
  - attributes (and optionally element text) whose values contain a function name, a qualified `Object.method`, or a JS expression from which called names are extracted;
  - attribute pairs naming a JS file and a function in it.
- During a scan, files matching a rule are read as XML and their references are extracted with file and line.
- References are resolved against Auspex's inventory of known JS functions:
  - file + name: that function in that file;
  - `Object.method`: method of the uniquely named container;
  - bare names or names extracted from expressions: unique match → `certain`, multiple matches → `inferred` edges to each candidate, no match → reported as unresolved.
- Resolved references become `declarative` edges in the call model of `add-call-hierarchy`, so XML files appear as callers in the "Calls" view and the call diagram (`add-call-diagram-editor`) with their own icon.
- Without any configured rule, an optional heuristic mode scans attribute values of XML-like files (detected by content, e.g. `<?xml` or a root element) and keeps only code-like matches (`x.y`, `x(...)`, or names unique in the repo), always as `inferred`.
- Results are cached per file like other analysis results.

**Defaults decided during planning**
- Element text is supported via an optional `elements` list per rule (in addition to attributes).
- The heuristic mode is off by default (setting `auspex.declarativeReferences.heuristic`), to avoid false references without explicit configuration.

## Capabilities

### New Capabilities
- `declarative-references`: configuration of reference rules, extraction of JS references from XML-like files, resolution to known functions with confidence, and reporting of unresolved references.

### Modified Capabilities
<!-- none: no specs exist yet; contributes edges to `call-analysis` introduced by add-call-hierarchy -->

## Impact

- Depends on `add-call-hierarchy` (edge-source model, Calls view) and benefits from `detect-this-assigned-methods` (more resolvable targets).
- New analyzer step under `src/analyzer/` (XML reference extraction + resolver), setting contribution in `package.json` / `package.nls*.json`, cache integration.
- An XML parser dependency may be needed (or a tolerant, line-aware scanner); must handle large and malformed files without failing the scan.
- Performance: matching files are read in full; must stay within the existing scan budget.
