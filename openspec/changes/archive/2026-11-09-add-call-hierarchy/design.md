# Design

## Context

See proposal.md - Why. Relevant current state:

- `AuspexPipeline.run` (`src/analyzer/pipeline.ts`) is plain Node (no `vscode` import) and is unit-tested: scope walk -> per-file parse with cache (`AstStructureAnalyzer`, extractors) -> git churn/coupling/knowledge -> `TreeAggregator` -> `AnalysisSnapshot` saved via `AuspexStorage`.
- Extractors are line/regex based (`JavaScriptExtractor`, `PythonExtractor`, `GenericBraceExtractor`); they know functions with start/end lines but no call sites. `detect-this-assigned-methods` adds constructor containers, `this` aliases and an `ANALYZER_VERSION` for cache invalidation.
- Sidebar views are `WebviewViewProvider`s (e.g. `CouplingViewProvider`) rendering the shared React webview with `window.__AUSPEX_VIEW__`; selection is broadcast via `setSelectedNodeAcrossProviders` in `extension.ts`. Single-file updates on save go through `TreeAggregator.updateFileInTree`.
- `HealthCodeLensProvider` emits one lens per method/class from the tree.
- `filterSnapshotByScope` derives a scoped snapshot from the raw one.

## Goals / Non-Goals

**Goals:**
- A pure, testable call model computed in the pipeline (specs: `call-analysis`).
- Language-server enrichment without making the pipeline depend on `vscode`.
- The "Calls" view and call-count CodeLens (specs: `call-hierarchy-view`).

**Non-Goals:**
- The repository diagram (`add-call-diagram-editor`) and XML references (`detect-declarative-references`) - only the extension points they need.
- Fan-in as a treemap color mode (possible follow-up).
- Type inference: `obj.m()` on arbitrary objects is resolved by name only (`inferred`), except `this`/aliases and AMD parameters.
- Calls inside languages other than JS/TS via the Auspex resolver; they rely on the language server.

## Decisions

### D1: Stable function ids
`FunctionId = "<relPath>#<qualifiedName>"`, where `qualifiedName` is `Container.method` for container methods, `method` for top-level functions and `parent > child` for nested helpers (matching extractor naming). On collision within a file, `@<startLine>` is appended. Call data references `FunctionId`s; views map them to `TreeNode`s by file + start line for metrics.
- *Why:* `TreeNode.path` (`file#name`) is not unique for same-named methods in different containers (see `detect-this-assigned-methods` non-goals). A separate id avoids changing existing node paths that other views rely on.

### D2: Two-phase Auspex resolver (pure, in the pipeline)
1. **Per-file extraction** (`src/analyzer/calls/callSiteExtractor.ts`), run with the existing per-file parse and cached in `ParsedFileInfo.callSites`: for each known function, the call sites inside its line range excluding nested functions' ranges: `name(`, `recv.name(`, with `recv` classified as `this`/alias, AMD parameter, or other. Also the file's AMD dependency map (`define([...], function (a, b))` -> param -> dependency id). Strings, comments and regex literals are skipped using the same scanning rules as `findBraceBlockEnd`.
2. **Global resolution** (`src/analyzer/calls/callResolver.ts`) after all files are parsed, using an index of known functions by name, by container and by file: `this`/alias -> same container (`certain`); AMD param -> target file (dependency id resolved against workspace root, file's dir and `baseUrl` guesses; `certain` if the method is found); bare name -> same file first (`certain`), else all workspace functions with that name (`inferred`); other receivers -> container named like the receiver if unique, else by method name (`inferred`). Unmatched names are dropped (library calls).
- *Why:* phase 1 is per-file and cacheable; phase 2 is cheap in-memory work, so rescans stay fast.
- *Alternative:* resolve during parsing - impossible without the whole-workspace function index.

### D3: Edge sources and merge
```
interface CallEdgeSource { kind: 'js' | 'declarative'; collect(ctx): CallEdge[] | Promise<CallEdge[]> }
CallEdge { from: FunctionId | { file, line }, to: FunctionId, confidence, source }
```
`CallGraphBuilder` runs registered sources and merges by `(from, to)` keeping the highest confidence. The pipeline registers the Auspex resolver; `detect-declarative-references` will register its source the same way. The result is stored as `AnalysisSnapshot.callGraph` (`edges` plus derived per-function counts) and filtered by `filterSnapshotByScope` (edges whose callee is out of scope are dropped).
- *Why:* open-closed extension point, as required by the project plan.

### D4: Language server in the extension host only
`src/integrations/callHierarchy/lspCallSource.ts` wraps `vscode.prepareCallHierarchy`, `vscode.provideIncomingCalls` and `vscode.provideOutgoingCalls`. Result items (uri + range) are mapped to `FunctionId`s by the innermost known function containing the range; items outside the workspace or unmapped are dropped.
- **On demand:** when the Calls view subject changes, query incoming + outgoing for that function (with timeout ~5 s, cancellable), merge into an in-memory overlay, push to the view.
- **Background (setting `auspex.calls.languageServer`: `"onDemand"` (default) | `"background"` | `"off"`):** after a scan, iterate functions with a concurrency limit, `vscode.window.withProgress` cancellable, persist results to `storage/lsp_calls.json` keyed by file + file hash.
- *Why:* keeps the pipeline pure/testable; on demand is fast enough for one function while whole-repo crawling can take minutes.

### D5: Incremental update on save
The existing save handler re-parses the file (now including call sites). It then re-runs global resolution only for edges whose caller is in that file plus edges targeting functions whose ids changed in that file, and invalidates that file's LSP cache entries.
- *Alternative:* full resolution on each save - simple, likely fast enough for small repos; kept as fallback if the targeted update proves error-prone.
- *Implemented:* the full re-resolution variant. The extension keeps the parsed files (with call sites) in memory, replaces the saved file and re-runs global resolution (`updateCallGraphForFile`); resolution is in-memory only, so no targeted update was needed.

### D6: Calls view
`src/providers/CallsViewProvider.ts` following the `CouplingViewProvider` pattern (`viewType 'auspex.callsView'`, `__AUSPEX_VIEW__ = 'calls'`), registered in `package.json` under `auspex-sidebar` with `views.callsView` strings in `package.nls*.json` and `src/i18n.ts` / `webview/src/i18n.ts`. It receives the selected node via `setSelectedNodeAcrossProviders`. The webview component `CallsPanel.tsx` renders the two trees; expansion requests are answered by the provider from the call graph (+ LSP overlay). Recursion is detected by the path from the subject.

### D7: CodeLens
`HealthCodeLensProvider` gets a second lens per method using the counts from `callGraph` (+ overlay), title `"N callers | M calls"` (localized), command `auspex.showCalls` with the function's file/line, which selects the node and reveals `auspex.callsView`. Governed by the existing `auspex.codeLens.enabled`.

### D8: Versioning
Adding `callSites` to cached `ParsedFileInfo` changes results for unchanged files, so `ANALYZER_VERSION` is incremented (mechanism from `detect-this-assigned-methods`).

## Risks / Trade-offs

- [Name-based resolution creates noisy `inferred` edges for common names (`init`, `render`)] -> Shown distinctly; the views can hide inferred edges; LSP edges supersede when available.
- [Regex call-site extraction misreads edge cases (calls in template strings, chained calls `a().b()`)] -> Reuse the string/comment-aware scanner; chained calls only resolve their first segment; covered by fixtures.
- [AMD path resolution differs per project (`baseUrl`, `paths` config)] -> Try relative-to-file, relative-to-root and common source roots; unresolved ids just produce no edges. A setting for AMD base paths can follow if the spike shows need.
- [Snapshot size grows with edges] -> Store edges compactly (id table + index pairs); measure on a large repo.
- [Language server queries are slow or unavailable] -> Timeouts, cancellation, default on-demand only; the view never blocks on them.

## Migration Plan

- Ship after `detect-this-assigned-methods`; bump `ANALYZER_VERSION` so the first scan re-parses all files and computes call sites.
- New setting defaults to on-demand; no user action required. Rollback: older versions ignore `callGraph` and `callSites`.

## Open Questions

- Exact LSP coverage on AMD code (the spike in tasks) may justify adding an AMD base-path setting; this does not change the approach or the specs.
