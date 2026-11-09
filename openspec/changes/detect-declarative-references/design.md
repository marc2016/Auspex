# Design

## Context

See proposal.md - Why. Relevant current state and dependencies:

- The scope walk in `AstStructureAnalyzer` already visits all non-ignored files; files with unknown extensions get a LOC-only `ParsedFileInfo` (`analyzeSource`, no `lang`).
- Settings are read in `extension.ts` (`runScan`) and passed to `AuspexPipeline.run` as options (e.g. `authorAliases`, `respectGitIgnore`); `onDidChangeConfiguration` is already handled.
- `add-call-hierarchy` provides `CallEdgeSource`, location callers, `CallGraphBuilder` and the function index (by name, container, file). `detect-this-assigned-methods` provides `ANALYZER_VERSION`-based cache reuse.
- The `ignore` package (gitignore-style matching) is already a dependency.
- No output channel exists yet.

## Goals / Non-Goals

**Goals:**
- Configurable extraction of JS references from XML-like files and a `declarative` edge source (spec: `declarative-references`).

**Non-Goals:**
- Analyzing embedded JS code inside XML (e.g. `<script>` blocks) as functions.
- Full XML/namespace/entity support or schema validation.
- Showing XML files as structured nodes (elements) in the treemap; they remain file tiles.
- A settings UI; rules are edited in `settings.json`.

## Decisions

### D1: Rule format
```json
"auspex.declarativeReferences": [
  { "files": "**/*.form",
    "attributes": ["onClick", "handler"],
    "elements": ["handler"],
    "fileAttribute": "script", "functionAttribute": "function" }
]
```
`files` is a single glob or an array of globs, matched with gitignore semantics via `ignore` against the workspace-relative path. Contributed in `package.json` with a JSON schema so `settings.json` offers completion and validation. Invalid rules are dropped by a pure `parseRules()` that returns rules + warnings.

### D2: Tolerant line-aware XML scanner, no new dependency
`src/analyzer/declarative/xmlReferenceScanner.ts` scans the text once with a small state machine: tags (`<name ...>`), attributes (`name="..."` / `'...'`), element text up to the next `<`, comments (`<!-- -->`) and CDATA skipped, tracking line numbers. Unclosed or malformed constructs end the current tag and scanning continues. Entities `&amp; &lt; &gt; &quot; &apos;` are decoded in values.
- *Why:* we need line numbers and tolerance for broken files more than full XML correctness; avoids a parser dependency in the bundled extension.
- *Alternative:* an XML parser library (e.g. sax-based) - more correct, but adds a dependency and its error handling still needs wrapping for line-accurate partial results.

### D3: Value interpretation
A pure `interpretValue(value)` returns reference names: if the value contains `(`, extract every `ident(` and `ident.ident(` occurrence (skipping string literals); else if it matches `^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?$`, it is a bare or qualified name; else no reference. File/function pairs are combined per element by the scanner.

### D4: Pipeline integration and caching
Extraction runs during the per-file parse for files matching a rule (or, in heuristic mode, files whose first non-whitespace content is `<?xml` or `<name`). Results are stored as `ParsedFileInfo.declarativeRefs` (value, line, form, optional target file). Cache reuse additionally requires `cached.rulesHash === hash(effective rules + heuristic flag)`; the hash is passed with pipeline options. A rule change therefore re-extracts only files that have `declarativeRefs` or match a rule.
- *Why:* consistent with per-file caching; avoids re-reading unchanged XML on every scan.

### D5: Declarative edge source
`DeclarativeEdgeSource implements CallEdgeSource` (`kind: 'declarative'`) resolves refs with the function index from `add-call-hierarchy` per spec rules, emitting location callers `{ file, line }`. File/function pairs resolve the file path relative to the workspace root, then relative to the XML file. Unresolved refs are collected and returned alongside edges.

### D6: Output channel
A lazily created `vscode.window.createOutputChannel('Auspex')` in `extension.ts`; after each scan the unresolved list (`file:line  value`) and rule warnings are written (replacing the previous content). Strings localized via `src/i18n.ts`.

### D7: Heuristic mode
Setting `auspex.declarativeReferences.heuristic` (boolean, default false). Heuristic refs are always `inferred`, and a bare name is only kept if exactly one known function has it (spec). Applied after rules: files matched by a rule are not scanned heuristically.

## Risks / Trade-offs

- [Glob and rule mistakes silently find nothing] -> Warnings for invalid rules; output channel shows counts per rule (files matched, refs found, unresolved).
- [Large XML files slow down the scan] -> Single-pass scanner; files above the existing 2 MB limit are skipped like code files.
- [Bare names in expressions (e.g. `alert(`, `parseInt(`) produce unresolved noise] -> Names matching no known function are listed as unresolved only for bare/qualified values, not for names extracted from expressions.
- [Heuristic false positives] -> Off by default, always `inferred`, restricted to code-like values.

## Migration Plan

- Ships after `add-call-hierarchy`; no behavior change until rules are configured. Bump `ANALYZER_VERSION` because `ParsedFileInfo` gains `declarativeRefs`.
