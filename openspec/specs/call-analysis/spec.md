# call-analysis Specification

## Purpose
Defines how Auspex determines call relationships between the functions it knows in a workspace, including how certain each relationship is and where it came from, so that call views and diagrams can show who calls whom.

## Requirements

### Requirement: Call edges between known functions
The system SHALL determine call edges whose caller and callee are functions or methods known from the structure analysis of the workspace. Calls to functions outside the workspace (libraries, runtime, built-ins) SHALL NOT produce edges.

#### Scenario: Call within the same file
- **GIVEN** `function save() { validate(); }` and `function validate() {}` in the same file
- **WHEN** call analysis runs
- **THEN** an edge from `save` to `validate` exists

#### Scenario: Library call ignored
- **GIVEN** a function that calls `JSON.parse(x)` and `console.log(x)`
- **WHEN** call analysis runs
- **THEN** no edge is produced for these calls

#### Scenario: Recursive call
- **GIVEN** a function `walk` that calls `walk`
- **WHEN** call analysis runs
- **THEN** an edge from `walk` to itself exists

### Requirement: Calls through this and aliases
The system SHALL resolve calls of the form `this.m()` or `alias.m()` (where `alias` is bound to `this`) inside a method of a container to the method `m` of the same container.

#### Scenario: this call in a constructor method
- **GIVEN** constructor `Cart` with methods `add` and `validate`, and `add` contains `this.validate()`
- **WHEN** call analysis runs
- **THEN** an edge from `Cart.add` to `Cart.validate` exists with confidence `certain`

#### Scenario: self call in a callback
- **GIVEN** constructor `Cart` with `var self = this;` and a method `load` containing `items.forEach(function () { self.add(); })`
- **WHEN** call analysis runs
- **THEN** an edge from `Cart.load` to `Cart.add` exists

### Requirement: Calls across AMD modules
The system SHALL map the parameters of an AMD factory (`define([deps], function (params) {...})`) to the files of the listed dependencies, resolving dependency ids relative to the workspace, and SHALL resolve `param.m()` calls to the function or method `m` exported by that file.

#### Scenario: Call into another AMD module
- **GIVEN** `cart.js` contains `define(['app/Store'], function (Store) { ... Store.persist(); ... })` and `app/Store.js` defines a method `persist`
- **WHEN** call analysis runs
- **THEN** an edge from the calling function in `cart.js` to `persist` in `app/Store.js` exists

#### Scenario: Unresolvable dependency id
- **GIVEN** an AMD dependency id that matches no workspace file (e.g. a library loaded via a path alias)
- **WHEN** call analysis runs
- **THEN** calls through that parameter produce no edges and the scan does not fail

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

### Requirement: Edge sources
Every call edge SHALL record the kind of source that produced it (for example `js` for code analysis or language server, `declarative` for references in non-code files). When several sources produce the same caller-callee pair, the system SHALL keep a single edge with the highest confidence.

#### Scenario: Duplicate edge from two sources
- **GIVEN** the language server and the Auspex resolver both report a call from `save` to `persist`, one as `certain` and one as `inferred`
- **WHEN** edges are merged
- **THEN** exactly one edge from `save` to `persist` exists with confidence `certain`

### Requirement: Callers in non-code files
A caller SHALL be either a known function or a location in a workspace file (file path and line) that is not a function, so that references from non-code files can appear as callers.

#### Scenario: Location caller
- **GIVEN** an edge source reports that line 12 of `order.form` references `Cart.save`
- **WHEN** the incoming calls of `Cart.save` are requested
- **THEN** the result contains a caller identifying `order.form` line 12

### Requirement: Language server calls on demand
For the function whose calls are being viewed, the system SHALL query VS Code's call hierarchy provider for incoming and outgoing calls if one is available for that language, map the results to known functions, and add them as `certain` edges. The view SHALL remain usable with Auspex-resolved edges while the query is running or if it fails.

#### Scenario: TypeScript function with language server
- **GIVEN** a TypeScript workspace with the TypeScript language features enabled
- **WHEN** the user views the calls of a function
- **THEN** callers found by the language server in other files are shown as `certain`

#### Scenario: No language server available
- **GIVEN** a file type for which no call hierarchy provider is registered
- **WHEN** the user views the calls of a function in it
- **THEN** only Auspex-resolved edges are shown and no error is displayed

### Requirement: Optional background language server analysis
The system SHALL provide a setting that, when enabled, queries the language server for the outgoing calls of all known functions in the background after a scan, reporting progress and allowing cancellation. It SHALL be disabled by default and SHALL NOT delay the availability of scan results.

#### Scenario: Background analysis enabled
- **GIVEN** the background setting is enabled
- **WHEN** a scan completes
- **THEN** the treemap is available immediately and language server edges are added as the background analysis progresses

### Requirement: Incremental and cached call data
The system SHALL cache per-file call information under the same reuse rules as other per-file analysis results, and SHALL update the call edges of a file when it is saved, without rescanning the workspace.

#### Scenario: Saving a file
- **GIVEN** a call analysis exists and the user adds a call `this.reset()` to `Cart.add` and saves the file
- **WHEN** the save is processed
- **THEN** an edge from `Cart.add` to `Cart.reset` exists without a full rescan

#### Scenario: Unchanged files on rescan
- **GIVEN** a cached call analysis and no modified files
- **WHEN** a rescan runs
- **THEN** per-file call information is reused rather than recomputed

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
