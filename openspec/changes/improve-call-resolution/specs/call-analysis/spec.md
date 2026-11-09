# Spec Delta

## MODIFIED Requirements

### Requirement: Edge confidence
Every call edge SHALL carry a confidence of `certain` or `inferred`. An edge SHALL be `certain` when the callee is determined unambiguously, and `inferred` when it is matched by name only. A bare call in a script file that matches several candidate functions by name SHALL produce an `inferred` edge to each candidate. A member call on a receiver of unknown type SHALL produce an `inferred` edge only if exactly one container method in the workspace has that name, and no edge otherwise.

#### Scenario: Ambiguous bare name
- **GIVEN** a script file (no `import`/`export`) with a call `render()` that is not defined in the calling file, and two other files each define a function `render`
- **WHEN** call analysis runs
- **THEN** two `inferred` edges exist, one to each `render`

#### Scenario: Unique bare name in another file
- **GIVEN** a script file with a call `formatPrice()` that is not defined in the calling file, and exactly one workspace function is named `formatPrice`
- **WHEN** call analysis runs
- **THEN** one `inferred` edge to that function exists

#### Scenario: Unique method name on an unknown receiver
- **GIVEN** a call `cart.checkout()` where the type of `cart` is unknown and exactly one container method in the workspace is named `checkout`
- **WHEN** call analysis runs
- **THEN** one `inferred` edge to that method exists

#### Scenario: Ambiguous method name on an unknown receiver
- **GIVEN** a call `item.dispose()` where the type of `item` is unknown and three container methods in the workspace are named `dispose`
- **WHEN** call analysis runs
- **THEN** no edge is created for this call

## ADDED Requirements

### Requirement: Calls through ES imports and require
The system SHALL resolve calls through named, default and namespace ES imports and through CommonJS `require` of relative module paths to the function or container method in the imported file, with confidence `certain`.

#### Scenario: Named import
- **GIVEN** `import { resolveLanguage } from '../i18n';` and a call `resolveLanguage()`
- **AND** `i18n.ts` next to the importing folder defines a top-level function `resolveLanguage`
- **WHEN** call analysis runs
- **THEN** a `certain` edge to `resolveLanguage` in `i18n.ts` exists

#### Scenario: Renamed import
- **GIVEN** `import { save as persist } from './store';` and a call `persist()`
- **WHEN** call analysis runs
- **THEN** a `certain` edge to `save` in `store` exists

#### Scenario: Namespace import
- **GIVEN** `import * as util from './util';` and a call `util.format()`
- **WHEN** call analysis runs
- **THEN** a `certain` edge to `format` in `util` exists

#### Scenario: Imported class or object
- **GIVEN** `import { Store } from './store';` and a call `Store.persist()`, and `store` defines container `Store` with method `persist`
- **WHEN** call analysis runs
- **THEN** a `certain` edge to `Store.persist` exists

#### Scenario: require
- **GIVEN** `const { format } = require('./util');` and a call `format()`
- **WHEN** call analysis runs
- **THEN** a `certain` edge to `format` in `util` exists

#### Scenario: Module path with index file
- **GIVEN** `import { run } from './jobs';` where `jobs` is a folder containing `index.ts` that defines `run`
- **WHEN** call analysis runs
- **THEN** a `certain` edge to `run` in `jobs/index.ts` exists

#### Scenario: Package import
- **GIVEN** `import { join } from 'path';` and a call `join(a, b)`
- **WHEN** call analysis runs
- **THEN** no edge is created for this call

### Requirement: Receiver type hints
The system SHALL resolve a member call `recv.m()` to method `m` of container `X` with confidence `certain` when, in the calling function or its enclosing functions, `recv` is assigned `new X(...)` or declared with the TypeScript type `X` (parameter or variable annotation), and `X` is a known or imported container.

#### Scenario: Local new
- **GIVEN** `var c = new Cart();` followed by `c.save();` in one function, and container `Cart` with method `save`
- **WHEN** call analysis runs
- **THEN** a `certain` edge to `Cart.save` exists

#### Scenario: Parameter type annotation
- **GIVEN** `function find(index: FunctionIndex) { return index.get(id); }` and container `FunctionIndex` with method `get`
- **WHEN** call analysis runs
- **THEN** a `certain` edge to `FunctionIndex.get` exists

#### Scenario: Type of a library class
- **GIVEN** `const seen = new Map<string, number>();` followed by `seen.get(key)`
- **WHEN** call analysis runs
- **THEN** no edge is created for this call

### Requirement: Built-in method names on unknown receivers
The system SHALL NOT create edges for member calls on receivers of unknown type whose method name is a common built-in method of JavaScript or platform objects (for example `push`, `get`, `set`, `has`, `map`, `filter`, `forEach`, `replace`, `slice`, `then`, `postMessage`, `dispose`).

#### Scenario: Map access
- **GIVEN** `byName.get(name)` where the type of `byName` is unknown, and a workspace container method `FunctionIndex.get` exists
- **WHEN** call analysis runs
- **THEN** no edge to `FunctionIndex.get` is created for this call

#### Scenario: Built-in name with a type hint
- **GIVEN** `function f(index: FunctionIndex) { index.get(id); }`
- **WHEN** call analysis runs
- **THEN** the call resolves to `FunctionIndex.get` as `certain`, because the receiver type is known

### Requirement: Module scope of bare calls
In an ES module (a file containing `import` or `export` statements), the system SHALL NOT resolve a bare call to a function of another file unless the name is imported, because module code cannot reach other files' functions without importing them.

#### Scenario: Unimported name in a module
- **GIVEN** a file with `export function a() { helper(); }`, no definition or import of `helper` in it, and a function `helper` in another file
- **WHEN** call analysis runs
- **THEN** no edge from `a` to the other file's `helper` is created

#### Scenario: Local function in a module
- **GIVEN** a module with `export function a() { helper(); }` and `function helper() {}` in the same file
- **WHEN** call analysis runs
- **THEN** a `certain` edge from `a` to `helper` exists
