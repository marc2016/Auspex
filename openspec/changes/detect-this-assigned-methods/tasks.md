# Tasks

## 1. Types and analyzer version

- [x] 1.1 Add `'constructor'` to `ClassInfo.kind` in `src/analyzer/types.ts` and to the `EnclosingScope.kind` union in `JavaScriptExtractor.ts` (plus `'anonymous'` for the local union only); verify `npx tsc --noEmit` passes.
- [x] 1.2 Add `ANALYZER_VERSION = 2` and optional `analyzerVersion` fields on `ParsedFileInfo` and `AnalysisSnapshot` (design D6); verify type check passes.

## 2. Extractor: this-binding scopes and aliases

- [x] 2.1 Push non-emitted `anonymous` scopes for anonymous function-expression blocks (design D2a); add a test in `test/rhinoJavaScriptExtractor.test.ts` (new `describe('Constructor functions and this-assigned methods')`) asserting that names and counts of existing nested functions in the current fixtures are unchanged; verify `npm test` passes.
- [x] 2.2 Track `this` aliases per function scope (`var|let|const x = this`) (design D2); verify with tests for `self` and `that` aliases and for the "unrelated object" scenario (`options.callback = function` is not a method).

## 3. Extractor: constructor promotion and methods

- [x] 3.1 Detect this/alias assignments of function values incl. async functions and arrows, single- and multi-line signatures (design D3); verify tests for function expression, arrow, async and non-function values (`this.items = items`) per spec `javascript-structure-extraction`.
- [x] 3.2 Promote the nearest this-binding named function to a `constructor` container, re-kinding an existing component; skip functions that are container methods (design D1, D4); verify tests for PascalCase, lower-case, AMD-wrapped and IIFE-wrapped constructors, the prototype-method and ES6-constructor cases, and the anonymous- vs arrow-callback cases.
- [x] 3.3 Emit methods as `add()` without `parentMethod`, keep `Cart()` body method and nest closures under the method scope (design D4); verify tests that `validate` stays a nested helper of `Cart`, `parse` is nested under `load`, and an unrelated `function Header(props)` keeps its previous classification.
- [x] 3.4 Add a `TreeAggregator` test (`test/treeAggregator.test.ts`) with a constructor fixture asserting container `Cart` has children `Cart()`, `add()`, `remove()` and `add()` is not under `Cart()`.

## 4. Code Health and editor

- [x] 4.1 Treat `constructor` containers with class thresholds and label "Constructor" in `src/analyzer/codeHealth.ts`, and keep them in `significantClasses`; verify a test in `test/codeHealth.test.ts` for an oversized constructor and that `Cart()` complexity excludes method lines.
- [x] 4.2 Verify with a test in `test/healthCodeLens.test.ts` (or `editorHealthDecorator.test.ts`) that a CodeLens/decoration appears on the `this.add = function` line for a constructor fixture.

## 5. Versioned cache

- [x] 5.1 Set `analyzerVersion` on results in `AstAnalyzer` and on snapshots in the pipeline; reuse cached file results in `src/analyzer/pipeline.ts` only when the version matches (spec `analysis-cache`); verify tests in `test/pipeline.test.ts` for same-version reuse, older-version re-analysis and missing-version re-analysis.
- [x] 5.2 Restore `snapshot.json` in `src/extension.ts` only when `analyzerVersion === ANALYZER_VERSION`; verify by a test (or by extracting the check into a small tested helper) that an older snapshot is treated as absent.

## 6. Docs and integration

- [x] 6.1 Add an `[Unreleased]` entry to `CHANGELOG.md` describing constructor detection, arrow support, the analyzer-version cache invalidation and the display change for `Foo > bar()` nodes; verify the entry is present.
- [ ] 6.2 Run the full suite (`npm test`) and a manual scan of a sample AMD/constructor project in the Extension Development Host; verify the treemap shows constructor containers with their methods and the first scan after upgrade re-parses unchanged files.
