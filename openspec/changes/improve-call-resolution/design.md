# Design

## Context

See proposal.md - Why. Current resolver (`add-call-hierarchy`):

- `callSiteExtractor` records per call site the caller, callee name and a receiver classification (`none`, `this`, `amd`, `other` with the receiver text). Files also store `amdDependencies`. Strings/comments are blanked by `sanitizeSource`; `this` aliases are scoped to the innermost declaring method.
- `JsCallResolver` resolves: `none` -> same-file visible function (certain) else all global functions with that name (inferred); `this` -> caller's container (certain) else any container method with that name (inferred); `amd` -> dependency file; `other` -> container named like the receiver (certain / case-insensitive inferred) else any container method with that name (inferred).
- Measured on Auspex's own code: 489 edges, 269 inferred; 1,590 of 2,334 call sites have `other` receivers, dominated by built-in method names.

## Goals / Non-Goals

**Goals:**
- Resolve ES imports and `require` of relative paths (spec: Calls through ES imports and require).
- Use local receiver type hints (spec: Receiver type hints).
- Stop name-based guessing for built-in names and ambiguous member names, and for unimported bare names in ES modules (specs: Built-in method names, Module scope, Edge confidence).

**Non-Goals:**
- Full type inference (return types, property types, generics, inheritance chains).
- `tsconfig`/`jsconfig` path aliases and package (`node_modules`) resolution; package imports produce no edges.
- Re-exports (`export { a } from './b'`, barrel files) beyond `index` files that define the function themselves.
- Changing language-server or declarative edges.

## Decisions

### D1: Per-file import table
`extractImports(lines)` (in `callSiteExtractor.ts`) parses, on comment-stripped source, `import` statements (default, named with `as`, namespace, combinations; `import type` skipped, multi-line clauses supported) and `require` declarations (`const x = require('...')`, `const { a, b: c } = require('...')`). Only relative specifiers (`./`, `../`) are kept. Result: `ParsedFileInfo.imports: { local, imported: string | '*' | 'default', source }[]`, plus `ParsedFileInfo.isModule` (any top-level `import`/`export`).
- *Why per file:* imports are module-scoped; storing them with the parse result keeps resolution cache-friendly like `amdDependencies`.

### D2: Module path resolution
`resolveModuleFile(source, fromFile, filePaths)` normalizes the path relative to the importing file and tries, in order: the path itself, `+ .ts/.tsx/.js/.jsx/.mjs/.cjs`, a `.js` specifier mapped to `.ts`/`.tsx` (TypeScript ESM style), and `/index` + those extensions. No match -> no edge (treated like a package).

### D3: Receiver type hints
While extracting call sites, collect declarations with their line: `var|let|const r(: T)? = new X(` (type `X`, last segment of a dotted name; generic arguments ignored) and TypeScript annotations `r: T` in the signature of a known function (from its start line up to the opening brace) and in `var|let|const r: T`. A hint applies within the innermost function containing the declaration (including nested functions), like `this` aliases. The nearest hint wins. The call site stores `receiverType`.
- In the resolver, a call with `receiverType` is resolved only against container `T` (workspace container or imported container); if `T` is not a workspace container (e.g. `Map`), the call produces no edge.

### D4: Resolution order
For each call site:
1. `this` receiver -> caller's container (unchanged); the unknown-container fallback follows rule 6.
2. Bare call whose name is imported -> imported function in the target file (`certain`); default import -> function/container with the local name, else the file's only top-level function or container; otherwise no edge.
3. Receiver that is an import -> namespace import: function `callee` in the target file; named/default import of a container: its method `callee`; `certain`, otherwise no edge.
4. Receiver with `receiverType` -> rule D3.
5. AMD receiver -> unchanged.
6. Other receivers: exact container name -> `certain` (unchanged); then, if the method name is in the built-in list -> no edge; otherwise a unique container method with that name -> `inferred`; otherwise no edge. (The case-insensitive container match is kept as `inferred`.)
7. Bare call not imported: same file -> unchanged; else if the file is an ES module -> no edge; else (script) global fallback unchanged.

### D5: Built-in method list
A constant set in `callResolver.ts` with methods of Array, Map, Set, WeakMap, String, Object, Number, Promise, JSON, Math, Date, RegExp, EventEmitter/DOM events (`on`, `off`, `emit`, `addEventListener`, `removeEventListener`, `dispatchEvent`, `postMessage`), Node streams/fs basics (`write`, `end`, `read`, `pipe`, `close`), and common disposable/lifecycle names (`dispose`, `toString`, `valueOf`). Applied only to receivers without a type hint and without an import.
- *Why a list:* the measured noise comes almost entirely from these names; a list is simple, transparent and testable.
- *Alternative:* a frequency threshold (names defined by many containers) - less predictable; rejected.

### D6: Versioning and incremental updates
New fields on `ParsedFileInfo` (`imports`, `isModule`) and `CallSite` (`receiverType`) change cached results -> increment `ANALYZER_VERSION`. Incremental updates on save keep working because the resolver re-runs on all cached files.

## Risks / Trade-offs

- [Correct edges dropped by the built-in list (e.g. a project method really named `get` called on an untyped receiver)] -> Typed receivers and imports still resolve; the language server (on demand / background) adds certain edges.
- [Fewer edges in script files that use ES modules partially (mixed files)] -> A file counts as a module only with top-level `import`/`export` statements; AMD and classic scripts are unaffected.
- [Regex-based import parsing misses unusual syntax (dynamic `import()`, `export * from`)] -> Out of scope; such calls behave as before or produce no edge.

## Measurements (task 3.2)

Auspex's own source (`src/`, `webview/src/`; tests, `dist`, `openspec` excluded), Auspex resolver only:

| | Before | After |
|---|---|---|
| Call edges | 489 | 429 |
| `inferred` | 269 (55 %) | 19 (4 %) |
| `certain` | 220 | 410 |
| Edges into `FunctionIndex.get` (all from untyped `map.get()`) | 47 | 0 |
| `resolveLanguage` edges that are `certain` | 0 of 27 | 27 of 27 |

- A local class now shadows same-named classes in other files for type hints and receivers named like a container (found by the receiver-type test with two `Store` classes).
- Calls through properties (`this.service.call()`, `ctx.index.get()`) stay unresolved (no edge): property types are a non-goal.

## Migration Plan

- Ships after `add-call-hierarchy`; first scan after the update re-parses all files (version bump). Archive `add-call-hierarchy` before this change, because this change modifies its `call-analysis` requirements.
