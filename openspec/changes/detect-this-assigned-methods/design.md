# Design

## Context

See proposal.md - Why. Relevant current behavior, verified by running the extractor on sample input:

- `JavaScriptExtractor.extractStructures` is a single line-by-line pass with a scope stack (`EnclosingScope`: class, object_literal, prototype, module, component, function). Block ends come from `findBraceBlockEnd`.
- `this.add = function` already matches the generic "property assignment" pattern (`(?:\w+\.)+(\w+)\s*=\s*function`). Because the enclosing scope is a function, it is emitted as a nested method `Cart > add()` with `parentMethod = 'Cart'`. `self.x = function` behaves the same. Arrow assignments (`this.x = () =>`) match no pattern.
- A PascalCase top-level function becomes a `component` container; a lower-case one gets no container.
- `TreeAggregator` places a method under its `parentMethod` node if set; otherwise under the class whose line range contains it, otherwise under the file.
- `CodeHealthAnalyzer` already excludes child methods by line range (`m.startLine > method.startLine && m.endLine <= method.endLine`), independent of `isNested`.
- `AuspexPipeline` reuses a cached `ParsedFileInfo` when `codeHealth` is a number and the file's mtime is not newer. `extension.ts` restores `snapshot.json` when `tree.codeHealth` is a number. There is no version check anywhere.

## Goals / Non-Goals

**Goals:**
- Model constructor functions and their `this`-assigned methods as container + methods (specs: `javascript-structure-extraction`).
- Make analyzer improvements reach existing workspaces automatically (specs: `analysis-cache`).
- Keep the single-pass, regex/scope-stack architecture; no new parser dependency.

**Non-Goals:**
- Globally unique node identities for same-named methods in one file (e.g. two constructors each with `add`). Node paths stay `file#name` as for classes today; this is addressed by `add-call-hierarchy`.
- Recognizing `this.x = function` inside ES6 class constructors or prototype methods as class methods.
- `Foo.prototype.x` and `this.x` for the same `Foo` being merged into one container.
- Resolving calls between methods.

## Decisions

### D1: Detect constructors lazily, while scanning the body
A function scope is pushed as today. When a this-assignment is found, the extractor walks the scope stack to the nearest **this-binding** scope (see D2a). If that is a named function that is not a method of a class/object/prototype container and not itself a this-method, the scope is **promoted** to a constructor: a `ClassInfo { kind: 'constructor' }` spanning the function's lines is created (or a component container is re-kinded), and the scope gets a `classRef`. Named functions nested in other functions (IIFE/AMD module wrappers) are allowed.
- *Why:* the extractor is single-pass; we cannot know up front whether a function will assign to `this`. Promotion on first hit avoids a second pass or lookahead over the whole body.
- *Alternative:* pre-scan each function body for `this.\w+ =` - simpler to reason about but doubles work for every function and duplicates scope logic.

### D2a: Anonymous function scopes for this-binding
Lines that open an anonymous function expression block (`function (...) {` without a name, as used for callbacks and AMD factories) push a new, non-emitted scope of kind `anonymous` with its block end from `findBraceBlockEnd`. Arrow functions push nothing and are therefore transparent. The this-binding lookup stops at the nearest `function`/`component`/`anonymous` scope; if it is `anonymous`, the assignment is ignored (falls back to today's generic handling).
- *Why:* models JavaScript's `this` semantics closely enough to reject callback assignments (`forEach(function () { this.x = ... })`) without rejecting constructors inside AMD/IIFE wrappers.
- *Impact on existing output:* `anonymous` scopes are never emitted and are skipped by the existing nested-function lookup (`kind === 'function' | 'component'`), so names of existing nested functions do not change.

### D2: Alias tracking per function scope
`EnclosingScope` gets an `thisAliases: Set<string>` (always containing `this`). A line matching `(?:var|let|const)\s+(\w+)\s*=\s*this\s*[;,]?$` adds the name to the nearest function scope's set. The assignment pattern becomes `^\s*(\w+)\.(\w+)\s*=\s*<function value>` and is accepted only if the receiver is in that set.
- *Why:* restricting to declared aliases prevents `options.callback = function` from becoming a method.
- *Alternative:* fixed name list (`self|that|me|_this`) - misses project-specific names and wrongly accepts `self` that is not bound to `this`.

### D3: Function-value pattern including arrows
One regex for the right-hand side: `(?:async\s+)?function\b[^(]*\(` or `(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>`. It is checked before the generic property-assignment pattern so this-assignments are handled by the new path only. The existing multi-line-signature lookahead is reused when the parameter list continues on the next lines.

### D4: Emitted shape
For a method `add` of constructor `Cart`: `MethodInfo { name: 'add()', parentMethod: undefined, isNested: false }`, pushed to `methods` and to `Cart.methods`; its scope is pushed with name `add` so closures inside it become `add > parse()` with `parentMethod = 'add'`. The constructor body stays `MethodInfo { name: 'Cart()' }`.
- *Why:* with no `parentMethod`, `TreeAggregator` already places `add()` under the `Cart` container by line range - no aggregator change needed. Health already excludes child ranges from `Cart()`.
- Constructor promotion happens after `Cart()` was emitted; if `Cart` was classified as `component`, its `ClassInfo.kind` is changed to `constructor` in place.

### D5: Code Health
`'constructor'` is added to `ClassInfo.kind` (and the local `EnclosingScope.kind` union). In `CodeHealthAnalyzer` it uses the default (class) thresholds and the label "Constructor". `significantClasses` keeps constructors like classes.

### D6: Analyzer version
A constant `ANALYZER_VERSION` (integer, starting at 2) lives in `src/analyzer/types.ts` next to `ParsedFileInfo`. `ParsedFileInfo.analyzerVersion?` and `AnalysisSnapshot.analyzerVersion?` are set by `AstAnalyzer` and the pipeline. Reuse conditions in `pipeline.ts` and `extension.ts` add `=== ANALYZER_VERSION`.
- *Why:* explicit, cheap, and future extractor changes only need a bump.
- *Alternative:* hash of extractor source - automatic but brittle in bundled builds and invalidates on cosmetic edits.

## Risks / Trade-offs

- [Regex receivers miss edge cases, e.g. `this['x'] = function` or `Object.assign(this, {...})`] → Out of scope; documented as not detected. Behavior falls back to today's.
- [Promoting a function that only incidentally assigns to `this` (e.g. a jQuery callback `$(el).each(function () { this.onclick = function () {} })`)] → Anonymous function scopes rebind `this` (D2a), so such assignments are ignored. Remaining false positives (a named non-constructor function assigning functions to `this`) are rare and harmless in display.
- [`.bind(this)` / `call(this)` callbacks are treated as rebinding] → Their assignments are ignored, matching today's behavior; acceptable.
- [Extra `findBraceBlockEnd` calls for anonymous functions] → Bounded by the existing `maxLines` limit; verify scan time on a large fixture stays within ~10% of before.
- [Same-named methods in two constructors of one file collide in `TreeAggregator.methodMap` for nested-helper parent lookup] → Pre-existing limitation for classes; noted in Non-Goals.
- [Full re-parse on first scan after upgrade is slower] → One-time cost; the scan already reports progress.
- [Changed names break user expectations / saved selections] → Called out as BREAKING (display) in proposal and CHANGELOG.

## Migration Plan

- Ship with `ANALYZER_VERSION = 2`; old caches and snapshots are ignored and rebuilt on next scan.
- Rollback: reverting the release restores old extraction code; old versions ignore the unknown `analyzerVersion` field and keep reusing new-shape cache entries until the files change. Deleting the extension's storage folder forces a clean state.
