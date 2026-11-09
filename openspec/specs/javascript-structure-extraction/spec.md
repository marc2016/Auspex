# javascript-structure-extraction Specification

## Purpose
Defines how Auspex recognizes containers and their methods in JavaScript and TypeScript files, so that treemap nodes, Code Health and editor annotations reflect the code's real structure.

## Requirements

### Requirement: Methods assigned to this
The system SHALL recognize an assignment of a function value to a property of `this` inside a function body as a method of that function. Function values are function expressions (named or anonymous), async function expressions and arrow functions with block or expression bodies.

#### Scenario: Function expression assigned to this
- **GIVEN** a file containing `function Cart() { this.add = function (item) { ... }; }`
- **WHEN** the file is analyzed
- **THEN** a method `add()` is reported with the start and end line of its function expression

#### Scenario: Arrow function assigned to this
- **GIVEN** a file containing `function Cart() { this.total = () => { return 0; }; }`
- **WHEN** the file is analyzed
- **THEN** a method `total()` is reported, and its lines are not counted as part of the constructor body's complexity

#### Scenario: Async function assigned to this
- **GIVEN** a constructor containing `this.load = async function () { ... };`
- **WHEN** the file is analyzed
- **THEN** a method `load()` is reported

#### Scenario: Non-function value assigned to this
- **GIVEN** a constructor containing `this.items = items;` and `this.handler = onClick;`
- **WHEN** the file is analyzed
- **THEN** no method is reported for `items` or `handler`

### Requirement: Aliases of this
The system SHALL treat a local variable initialized with `this` inside a function (for example `var self = this;`) as equivalent to `this` within that function, so that function values assigned to its properties are recognized as methods of the same function.

#### Scenario: self alias
- **GIVEN** a constructor containing `var self = this;` followed by `self.remove = function (item) { ... };`
- **WHEN** the file is analyzed
- **THEN** a method `remove()` is reported for the same constructor as methods assigned via `this`

#### Scenario: Alias with another name
- **GIVEN** a constructor containing `const that = this;` followed by `that.reset = () => { ... };`
- **WHEN** the file is analyzed
- **THEN** a method `reset()` is reported for that constructor

#### Scenario: Property assignment on an unrelated object
- **GIVEN** a constructor containing `options.callback = function () { ... };` where `options` is not an alias of `this`
- **WHEN** the file is analyzed
- **THEN** `callback` is not reported as a method of the constructor

### Requirement: Constructor containers
The system SHALL report a function that has at least one method assigned to `this` or an alias as a container of kind "constructor" named after the function, regardless of the capitalization of its name. This classification SHALL take precedence over the component classification.

#### Scenario: PascalCase constructor
- **GIVEN** `function Cart() { this.add = function () { ... }; }`
- **WHEN** the file is analyzed
- **THEN** a container `Cart` of kind "constructor" is reported, not a component

#### Scenario: Lower-case constructor
- **GIVEN** `function cart() { this.add = function () { ... }; }`
- **WHEN** the file is analyzed
- **THEN** a container `cart` of kind "constructor" is reported containing `add()`

#### Scenario: Function without this-assigned methods
- **GIVEN** `function Header(props) { return render(props); }`
- **WHEN** the file is analyzed
- **THEN** it is classified exactly as before this change

#### Scenario: Constructor inside an AMD module
- **GIVEN** a file `define(['app/Store'], function (Store) { function Cart() { this.add = function () { ... }; } return Cart; });`
- **WHEN** the file is analyzed
- **THEN** a constructor container `Cart` with method `add()` is reported

### Requirement: Binding of this
The system SHALL attribute a this-assignment to the nearest enclosing function whose `this` it refers to: arrow functions SHALL be transparent, while an anonymous function expression (for example a callback) SHALL rebind `this`, so assignments directly inside it SHALL NOT create methods.

#### Scenario: Constructor nested in an IIFE module
- **GIVEN** `var Cart = (function () { function Cart() { this.add = function () { ... }; } return Cart; })();`
- **WHEN** the file is analyzed
- **THEN** a constructor container `Cart` with method `add()` is reported

#### Scenario: this inside an anonymous callback
- **GIVEN** `function init() { items.forEach(function (el) { this.onclick = function () { ... }; }); }`
- **WHEN** the file is analyzed
- **THEN** `init` is not reported as a constructor and `onclick` is not reported as a method

#### Scenario: this inside an arrow callback
- **GIVEN** `function Cart() { items.forEach((i) => { this.add = function () { ... }; }); }`
- **WHEN** the file is analyzed
- **THEN** `add()` is reported as a method of constructor `Cart`

### Requirement: Constructor tree layout
The system SHALL show a constructor's methods as direct children of the constructor container, each with its own LOC and Code Health, and SHALL keep the constructor body as a separate method named after the function (for example `Cart()`) whose LOC and complexity exclude the lines of the extracted methods.

#### Scenario: Treemap structure for a constructor
- **GIVEN** a constructor `Cart` with methods `add` and `remove` assigned to `this`
- **WHEN** the treemap is shown
- **THEN** the container `Cart` has the children `Cart()`, `add()` and `remove()`, and `add()` is not shown as a child of `Cart()`

#### Scenario: Editor annotations for a constructor method
- **GIVEN** editor health decorations and CodeLens are enabled
- **WHEN** a file with constructor `Cart` and method `this.add = function` is opened
- **THEN** a Code Health annotation is shown at the line where `add` is assigned

### Requirement: Closures remain nested
The system SHALL keep reporting functions declared inside a function, or assigned to anything other than `this` or an alias of `this`, as nested helpers of their enclosing function. This includes functions nested inside a constructor method.

#### Scenario: Private helper inside a constructor
- **GIVEN** a constructor `Cart` containing `function validate(item) { ... }` and `this.add = function () { validate(x); };`
- **WHEN** the file is analyzed
- **THEN** `validate` is reported as a nested helper of `Cart`, and `add()` as a method of the constructor container

#### Scenario: Closure inside a constructor method
- **GIVEN** `this.load = function () { function parse(r) { ... } };` inside constructor `Cart`
- **WHEN** the file is analyzed
- **THEN** `parse` is reported as a nested helper of `load`

### Requirement: Assignments inside container methods
The system SHALL NOT create a constructor container for a function that is already a method of a class, prototype or object literal. Function values assigned to `this` inside such a method SHALL be reported as nested helpers of that method, as before this change.

#### Scenario: this-assignment inside a prototype method
- **GIVEN** `Foo.prototype.init = function () { this.onClick = function () { ... }; };`
- **WHEN** the file is analyzed
- **THEN** no container is created for `init`, and `onClick` is reported as a nested helper of `init`

#### Scenario: this-assignment inside an ES6 class constructor
- **GIVEN** `class Foo { constructor() { this.handle = () => { ... }; } }`
- **WHEN** the file is analyzed
- **THEN** no additional container is created, and `handle` is reported as a nested helper of `constructor`

### Requirement: Constructor Code Health
The system SHALL evaluate constructor containers for the large-class biomarker with the same thresholds as ES6 classes and SHALL label findings for them as "Constructor".

#### Scenario: Oversized constructor
- **GIVEN** a constructor container with more methods than the class threshold allows
- **WHEN** Code Health is computed
- **THEN** a large-class biomarker is reported whose description refers to a "Constructor"
