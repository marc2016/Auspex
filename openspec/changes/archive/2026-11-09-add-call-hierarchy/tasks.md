# Tasks

## 1. Call model and function ids

- [x] 1.1 Add call types (`FunctionId`, `CallSite`, `CallEdge`, `CallGraph`, `CallEdgeSource`) to `src/analyzer/types.ts` (or `src/analyzer/calls/types.ts`) and `callSites?` on `ParsedFileInfo`, `callGraph?` on `AnalysisSnapshot`; verify `npx tsc --noEmit` passes.
- [x] 1.2 Implement `FunctionId` construction incl. `@line` disambiguation and a lookup from `FunctionId` to `TreeNode` by file + start line (design D1); verify unit tests for container methods, nested helpers and same-named methods in one file.

## 2. Per-file call-site extraction

- [x] 2.1 Implement `callSiteExtractor` for JS/TS: call sites per function excluding nested ranges, receiver classification (`this`/alias, AMD param, other), skipping strings/comments/regex (design D2.1); verify fixtures for `foo()`, `this.foo()`, `self.foo()` in callbacks, `Store.persist()`, calls in strings/comments (ignored) and chained calls.
- [x] 2.2 Extract the AMD dependency map from `define([...], function (...) {})` incl. multi-line headers; verify fixtures with 0, 1 and several dependencies and mismatched param counts.
- [x] 2.3 Run extraction in `AstStructureAnalyzer` for JS/TS and store `callSites` on `ParsedFileInfo`; bump `ANALYZER_VERSION` (design D8); verify `test/astAnalyzer.test.ts` and `test/pipeline.test.ts` cover that cached entries of the old version are re-parsed.

## 3. Resolution and graph building

- [x] 3.1 Implement `callResolver` (design D2.2) with the confidence rules of spec `call-analysis`; verify tests for same-file bare calls, `this`/alias calls (`certain`), AMD calls incl. unresolvable ids, ambiguous names (one `inferred` edge per candidate), unique cross-file names (`inferred`), library calls (no edge) and recursion.
- [x] 3.2 Implement `CallGraphBuilder` with registered `CallEdgeSource`s, merge by `(from, to)` keeping highest confidence, location callers, and per-function caller/callee counts (design D3); verify tests for the duplicate-edge and location-caller scenarios.
- [x] 3.3 Build the call graph in `AuspexPipeline.run` and store it on the snapshot; drop out-of-scope edges in `filterSnapshotByScope`; verify `test/pipeline.test.ts` asserts a call graph on a JS fixture repo and `test/scopeFilter.test.ts` asserts edge filtering.
- [x] 3.4 Update the call graph incrementally in the save handler (design D5); verify a test (extract the update into a pure function) that adding `this.reset()` to a method adds the edge without a full run.

## 4. Language server source

- [x] 4.1 Implement `lspCallSource` mapping call hierarchy items to `FunctionId`s with timeout and cancellation (design D4); verify unit tests with a mocked `vscode` module (pattern from existing provider tests) for mapping, out-of-workspace items and provider absence.
- [x] 4.2 Add setting `auspex.calls.languageServer` (`onDemand` default, `background`, `off`) to `package.json` + `package.nls*.json`; implement the background crawl with `withProgress`, concurrency limit and `storage/lsp_calls.json` keyed by file hash; verify tests for cache reuse/invalidation and that scan results are delivered before the crawl finishes.
- [ ] 4.3 Spike: run on-demand and background modes on a real AMD/constructor codebase and record in this change's design.md how many edges the language server finds vs. the Auspex resolver; verify the numbers are documented.

## 5. Calls view

- [x] 5.1 Add `CallsViewProvider` (`auspex.callsView`), register it in `extension.ts` and `package.json`, add view titles/strings in `src/i18n.ts`, `webview/src/i18n.ts`, `package.nls*.json`, and include it in `setSelectedNodeAcrossProviders`; verify `test/callsViewProvider.test.ts` (modeled on `couplingViewProvider.test.ts`) for init, selection and openFile messages.
- [x] 5.2 Implement `webview/src/components/CallsPanel.tsx`: incoming/outgoing trees, lazy expansion, recursion marker, metric annotations, inferred and location-caller styling, availability states (no scan, LSP loading, name-only); verify with webview helper tests for tree building and recursion detection.
- [x] 5.3 Wire on-demand LSP queries to subject changes and push overlay updates to the view; verify with a provider test that LSP results are merged and that a failing query leaves Auspex edges visible.

## 6. CodeLens and docs

- [x] 6.1 Add the call-count lens and `auspex.showCalls` command (design D7); verify `test/healthCodeLens.test.ts` for the lens title, the disabled setting and the command arguments.
- [x] 6.2 Document the Calls view, confidence markers and `auspex.calls.languageServer` in `README.md` and add an `[Unreleased]` entry in `CHANGELOG.md`; verify both entries exist.

## 7. Integration

- [ ] 7.1 Run `npm test` and check in the Extension Development Host on a JS/AMD sample: select a method in the treemap, Calls view shows callers/callees with metrics, CodeLens counts match, saving a file updates edges; verify each step manually.
