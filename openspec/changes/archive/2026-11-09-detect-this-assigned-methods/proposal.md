# Proposal

## Why

Legacy JavaScript commonly defines public instance methods inside constructor functions via `this.foo = function () { ... }` or an alias such as `var self = this; self.foo = ...`, often inside AMD `define()` modules. Auspex currently misrepresents this pattern:

- Function-expression assignments are picked up only as *nested helper functions* of the constructor (e.g. `Cart > add()`), not as methods of a `Cart` container. A PascalCase constructor is classified as a React-style "component"; a lower-case constructor gets no container at all.
- Arrow-function assignments (`this.total = () => { ... }`) are not detected, so their LOC and complexity are attributed to the constructor.
- Unchanged files keep their old parse result indefinitely, because the parse cache is invalidated only by file modification time.

The planned call hierarchy (`add-call-hierarchy`) needs these methods as proper, addressable nodes so that `this.add()` and `cart.add()` can resolve to `Cart.add`.

## What Changes

- A function that assigns function values to `this` (or to a local alias of `this`) is recognized as a **constructor** container, regardless of the capitalization of its name.
- `this.x = function`, `this.x = async function` and `this.x = (...) => ...` assignments become **methods** of that constructor, shown with their plain name (e.g. `add()`) directly under the container, with their own LOC, Code Health, gutter decoration and CodeLens.
- The constructor body itself remains a method (e.g. `Cart()`), excluding the extracted methods' lines from its complexity.
- Genuine closures (function declarations or non-`this` assignments inside a function) stay nested helpers, as today.
- Code Health evaluates constructor containers with class-like thresholds and labels them "Constructor".
- Parsed-file cache and stored snapshots carry an analyzer version; results from an older version are re-analyzed automatically.
- **BREAKING (display)**: affected methods change name and position in the tree (`Cart > add()` under `Cart()` becomes `add()` under `Cart`); Code Health scores of affected files may change.

## Capabilities

### New Capabilities
- `javascript-structure-extraction`: how Auspex recognizes containers (classes, prototypes, object literals, constructors) and their methods in JavaScript/TypeScript files.
- `analysis-cache`: when cached per-file parse results and stored snapshots may be reused and when they must be re-analyzed.

### Modified Capabilities
<!-- none: no specs exist yet -->

## Impact

- Code: `src/analyzer/extractors/JavaScriptExtractor.ts`, `src/analyzer/types.ts` (`ClassInfo.kind`, version field), `src/analyzer/codeHealth.ts` (constructor thresholds/label), `src/analyzer/pipeline.ts` and `src/extension.ts` (version-aware cache reuse).
- Tests: extractor tests for constructors, aliases, arrows and AMD modules; cache invalidation tests; existing tests that assert `Foo > bar()` naming for this-assignments must be updated.
- Users: first scan after upgrade re-parses all files; JS projects using constructor functions show a more accurate tree.
