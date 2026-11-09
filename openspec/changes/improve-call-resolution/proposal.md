# Proposal

## Why

Auspex's own call resolver produces too many wrong or weak edges. Measured on Auspex's own source (`src/`, `webview/src/`): 269 of 489 call edges (55 %) are `inferred`, and many of them are false:

- Member calls on objects whose type Auspex does not know fall back to "any workspace method with that name": `map.get()` becomes 47 edges to `FunctionIndex.get`, `x.dispose()` points at arbitrary panels. The most frequent names on such receivers are built-in methods (`push`, `get`, `replace`, `set`, `has`, `map`, `filter`, ...).
- Many correct edges are only `inferred` because ES imports are ignored: `resolveLanguage()`, imported via `import { resolveLanguage } from '../i18n'`, is matched by name (27 edges).

False edges clutter the Calls view, the call count CodeLens and the call diagram, and weaken trust in the `certain`/`inferred` distinction.

## What Changes

- **ES imports and `require`**: named, default and namespace imports (`import { a as b }`, `import d`, `import * as ns`) and CommonJS `require` (`const { a } = require('./x')`, `const x = require('./x')`) from relative paths are resolved to the target file; calls through them become `certain` edges.
- **Receiver type hints**: a receiver created with `new X()` or annotated with a TypeScript type (`index: FunctionIndex`, `const s: Store = ...`) in the calling function resolves `recv.m()` to method `m` of container `X`/`Store`.
- **Built-in method names**: member calls on receivers of unknown type whose method name is a common built-in (Array, Map, Set, String, Object, Promise, Node/DOM event APIs, ...) produce no edge.
- **Unique-name fallback only**: other member calls on unknown receivers produce an `inferred` edge only if exactly one container method in the workspace has that name; otherwise no edge (**BREAKING** for call counts: fewer, more reliable edges).
- **Module scope**: in ES modules (files with `import`/`export`), a bare call to a name that is neither defined in the file nor imported produces no edge, because module code cannot see other files' functions without importing them. Script files (e.g. AMD or classic scripts) keep the existing name-based fallback.
- Analyzer version bump so that cached call data is recomputed.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `call-analysis`: new resolution rules (imports, receiver type hints, built-in names, module scope) and a stricter confidence rule for member calls on unknown receivers. Introduced by `add-call-hierarchy`, which must be archived first.

## Impact

- Code: `src/analyzer/calls/callSiteExtractor.ts` (imports, receiver type hints), `src/analyzer/calls/callResolver.ts` (new rules), `src/analyzer/calls/types.ts` / `src/analyzer/types.ts` (new per-file and per-call-site fields), `ANALYZER_VERSION`.
- Tests: resolver and extractor tests; a regression check on Auspex's own source for the measured cases.
- Users: fewer `inferred` edges in the Calls view, CodeLens counts and call diagram; more edges become `certain`. The first scan after the update re-parses all files.
- Depends on `add-call-hierarchy` (call model) and is compatible with `detect-declarative-references` (declarative edges are unaffected).
