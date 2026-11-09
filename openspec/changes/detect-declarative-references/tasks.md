# Tasks

## 1. Rules and settings

- [x] 1.1 Contribute `auspex.declarativeReferences` (array with JSON schema) and `auspex.declarativeReferences.heuristic` (boolean, default false) in `package.json` + `package.nls*.json`; verify the extension manifest loads and `settings.json` shows completion in the Extension Development Host.
- [x] 1.2 Implement pure `parseRules()` (design D1) returning rules, warnings and a rules hash; verify unit tests for valid rules, missing `files`, glob arrays, incomplete file/function pairs and hash stability.

## 2. Extraction

- [x] 2.1 Implement the tolerant `xmlReferenceScanner` (design D2) yielding attribute values, element text and file/function pairs with line numbers; verify tests for single/double quotes, multi-line tags, comments, CDATA, entities, and a malformed file where later references are still found.
- [x] 2.2 Implement `interpretValue()` (design D3); verify tests for bare names, `Container.method`, expressions with several calls, string literals inside expressions, and non-reference text.
- [x] 2.3 Run extraction in the per-file parse for rule-matching files, store `declarativeRefs`, include `rulesHash` in the cache reuse check, pass rules from `runScan` options, and bump `ANALYZER_VERSION` (design D4); verify `test/pipeline.test.ts` for extraction on a fixture `.form` file, cache reuse with unchanged rules and re-extraction after a rule change.

## 3. Resolution and edges

- [x] 3.1 Implement `DeclarativeEdgeSource` (design D5) and register it with `CallGraphBuilder`; verify tests for qualified names (`certain`), unique bare names (`certain`), ambiguous names (`inferred` per candidate), file/function pairs relative to root and to the XML file, and the caller-count scenario.
- [x] 3.2 Collect unresolved references per spec (bare/qualified/pairs listed, expression names dropped); verify tests for the typo and built-in scenarios.

## 4. Heuristic mode

- [x] 4.1 Implement content-based XML detection and heuristic filtering (design D7); verify tests that `action="Cart.save"` in an unconfigured `<?xml` file yields an `inferred` edge, `title="Save order"` yields none, and files matched by a rule are not scanned twice.

## 5. Output and docs

- [x] 5.1 Add the "Auspex" output channel writing rule warnings, per-rule counts and unresolved references after each scan, localized in `src/i18n.ts` (design D6); verify with a test of the pure report formatter and manually that the channel content is replaced on rescan.
- [x] 5.2 Document the rule format with an example and the heuristic setting in `README.md`, add an `[Unreleased]` entry in `CHANGELOG.md`; verify both entries exist.

## 6. Integration

- [ ] 6.1 Run `npm test` and, in the Extension Development Host with a sample `.form` file and rule, verify the XML location appears as an incoming caller in the Calls view, the CodeLens caller count includes it, and a typo appears in the output channel.
