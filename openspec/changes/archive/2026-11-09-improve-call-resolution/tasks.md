# Tasks

## 1. Extraction

- [x] 1.1 Implement `extractImports()` for ES imports (default, named with `as`, namespace, combinations, multi-line, `import type` skipped) and `require` declarations, keeping relative specifiers only, plus `isModule` detection (design D1); verify unit tests for each import form, `require` forms, package imports (ignored) and commented-out imports.
- [x] 1.2 Collect receiver type hints (`new X()`, parameter and variable type annotations) scoped to the innermost declaring function and store `receiverType` on call sites (design D3); verify tests for local `new`, a parameter annotation, a generic library type (`new Map<string, number>()` -> `Map`) and a hint declared in an enclosing function.
- [x] 1.3 Store `imports`, `isModule` and `receiverType` in the parse result (`ParsedFileInfo`, `CallSite`) and increment `ANALYZER_VERSION` (design D6); verify `test/astAnalyzer.test.ts` asserts the new fields for a TS fixture and the existing version tests still pass.

## 2. Resolution

- [x] 2.1 Implement `resolveModuleFile()` with extension, `.js`-to-`.ts` and `index` handling (design D2); verify tests for each case and a package specifier (no match).
- [x] 2.2 Resolve bare calls and receivers through imports (named, renamed, default, namespace, imported container, `require`) as `certain` (design D4 steps 2-3); verify resolver tests for every import scenario of spec `call-analysis` (Calls through ES imports and require).
- [x] 2.3 Resolve calls with `receiverType` against the typed container only, and produce no edge for non-workspace types (design D4 step 4); verify tests for the Receiver type hints scenarios.
- [x] 2.4 Add the built-in method list and the unique-name rule for other receivers, also for the `this` unknown-container fallback (design D4 step 6, D5); verify tests for the Map access, built-in name with type hint, unique and ambiguous method name scenarios.
- [x] 2.5 Apply module scope to bare calls (design D4 step 7); verify tests for the unimported name in a module, a local function in a module, and that script/AMD files keep the ambiguous and unique bare-name scenarios of the modified Edge confidence requirement.

## 3. Regression and docs

- [x] 3.1 Add a regression test that runs the resolver on a fixture modeled on the measured cases (Map `get` on an untyped receiver next to a `FunctionIndex.get` method; an imported `resolveLanguage`); verify no edge to `FunctionIndex.get` from the Map call and a `certain` edge for `resolveLanguage`.
- [x] 3.2 Re-run the measurement on Auspex's own source (`src/`, `webview/src/`) and record before/after numbers (edges, inferred, top inferred targets) in this change's design.md; verify `FunctionIndex.get` no longer receives edges from untyped `get` calls.
- [x] 3.3 Update the call resolution description in `README.md` (imports, type hints, built-in names) and add an `[Unreleased]` entry in `CHANGELOG.md`; verify both entries exist and `npm test` passes.
