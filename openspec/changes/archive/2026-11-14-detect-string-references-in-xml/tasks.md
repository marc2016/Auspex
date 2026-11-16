# Tasks

## 1. Rules

- [x] 1.1 Add `dispatchers` (string or list, default `[]`) to `DeclarativeRule` and validate it in `parseRules()` with a warning for invalid values; verify with new cases in `test/declarative/rules.test.ts` (valid list, single string, invalid `42`, hash changes when dispatchers change)
- [x] 1.2 Add `dispatchers` to the rule item schema in `package.json` with description and example; verify `npm run compile:ext` succeeds and the JSON is valid

## 2. Extraction

- [x] 2.1 Extend `DeclarativeRefForm` with `'string'` and `DeclarativeRef` with `carrier` and `dispatcher`; implement the carrier-aware string-argument scan in `interpretValue()` (D1); verify with tests in `test/declarative/xmlReferences.test.ts` for the spec scenarios "Expression value", "String argument", "Non-name string", "Nested call", plus escaped quotes and backtick literals with and without `${`
- [x] 2.2 Set `dispatcher` per rule in `extractDeclarativeRefs()` with exact dotted-name matching (D3) and upgrade duplicates to `true` (D2); take string arguments in `extractHeuristicRefs()` as well; verify with tests for a dispatcher rule, a non-dispatcher rule, two overlapping rules, and heuristic extraction
- [x] 2.3 Bump `ANALYZER_VERSION` to 6 in `src/analyzer/types.ts`; verify the existing versioning/pipeline tests pass with `npm test`

## 3. Resolution

- [x] 3.1 Resolve `'string'` references in `DeclarativeEdgeSource` per D4 (dispatcher: like named references; otherwise unique-only and `inferred`; heuristic always unique-only and `inferred`) and report unresolved dispatcher references only; verify with tests in `test/declarative/declarativeEdgeSource.test.ts` for the resolution and unresolved scenarios of the delta spec
- [x] 3.2 Collect carrier statistics (`lastCarriers`: resolved count and dispatcher flag per carrier) in `DeclarativeEdgeSource`; verify with a test that counts only references that produced an edge

## 4. Report

- [x] 4.1 Add `carriers` to `DeclarativeReport`, fill it in `buildDeclarativeReport()`, and print the carrier section in `formatDeclarativeReport()` (sorted, configured ones marked, omitted when empty; `hasDeclarativeReport()` true when carriers exist); add de/en strings in `src/i18n.ts`; verify with tests in `test/declarative/report.test.ts` for the three "Carrier report" scenarios
- [x] 4.2 Verify end to end with a pipeline test in `test/pipeline.test.ts`: an XML file with `onClick="invoke('Cart.save')"` and a JS `Cart.save` yields an `inferred` declarative edge without dispatchers and a `certain` one with `"dispatchers": ["invoke"]`, and the report lists `invoke`

## 5. Docs

- [x] 5.1 Document string arguments, `dispatchers` and the carrier report in `README.md` and add an `[Unreleased]` entry in `CHANGELOG.md`; verify `npm test` passes and `npx tsc --noEmit` shows no new errors compared to before the change
