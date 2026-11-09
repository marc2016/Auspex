import { describe, it, expect } from 'vitest';
import { JavaScriptExtractor } from '../src/analyzer/extractors/JavaScriptExtractor';
import { CodeHealthAnalyzer } from '../src/analyzer/codeHealth';

describe('Rhino 1.7 JavaScript & Extractor Analysis', () => {
  const extractor = new JavaScriptExtractor();
  const healthAnalyzer = new CodeHealthAnalyzer();

  describe('Language Support and Namespaces', () => {
    it('supports javascript and typescript', () => {
      expect(extractor.supportedLanguages).toEqual(
        expect.arrayContaining(['javascript', 'typescript'])
      );
    });

    it('extracts TypeScript namespace or module declarations', () => {
      const lines = [
        '// TS file',
        'export namespace Auspex.Services.Health {',
        '  export class Analyzer {}',
        '}',
      ];
      expect(extractor.extractNamespace(lines)).toBe('Auspex.Services.Health');
    });

    it('extracts module syntax', () => {
      const lines = ['module LegacyEngine {', '  export function run() {}', '}'];
      expect(extractor.extractNamespace(lines)).toBe('LegacyEngine');
    });
  });

  describe('Rhino 1.7 Object Literal Modules', () => {
    it('extracts Rhino 1.7 object literal modules and assigns member methods', () => {
      const lines = [
        '// Rhino 1.7 Engine Module',
        'var RhinoEngine = {',
        '  version: "1.7.0",',
        '  init: function(config) {',
        '    this.config = config;',
        '  },',
        '  processBatch: function(items) {',
        '    for (var i = 0; i < items.length; i++) {',
        '      this.handleItem(items[i]);',
        '    }',
        '  },',
        '  handleItem: function(item) {',
        '    return item.id;',
        '  }',
        '};',
      ];

      const result = extractor.extractStructures(lines, 'javascript');

      expect(result.classes).toHaveLength(1);
      const cls = result.classes[0];
      expect(cls.name).toBe('RhinoEngine');
      expect(cls.kind).toBe('object_literal');
      expect(cls.methods).toHaveLength(3);
      expect(cls.methods.map((m) => m.name)).toEqual([
        'init()',
        'processBatch()',
        'handleItem()',
      ]);

      expect(result.methods).toHaveLength(3);
    });

    it('extracts global or window attached object literals', () => {
      const lines = [
        'window.AppController = {',
        '  boot: function() {',
        '    console.log("booting");',
        '  },',
        '  shutdown: function() {',
        '    console.log("stopped");',
        '  }',
        '};',
      ];

      const result = extractor.extractStructures(lines, 'javascript');
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('AppController');
      expect(result.classes[0].methods.map((m) => m.name)).toEqual(['boot()', 'shutdown()']);
    });

    it('extracts exports object literals', () => {
      const lines = [
        'exports.Formatter = {',
        '  formatDate: function(d) { return d.toISOString(); },',
        '  formatCurrency: function(c) { return "$" + c; }',
        '};',
      ];

      const result = extractor.extractStructures(lines, 'javascript');
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('Formatter');
      expect(result.classes[0].methods).toHaveLength(2);
    });
  });

  describe('Rhino 1.7 Prototype-based Classes', () => {
    it('extracts Rhino 1.7 prototype-based classes and methods', () => {
      const lines = [
        'function OrderManager(id) {',
        '  this.id = id;',
        '}',
        '',
        'OrderManager.prototype = {',
        '  validate: function() {',
        '    return this.id > 0;',
        '  },',
        '  commit: function() {',
        '    return true;',
        '  }',
        '};',
      ];

      const result = extractor.extractStructures(lines, 'javascript');

      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      const proto = result.classes.find((c) => c.name.includes('OrderManager'));
      expect(proto).toBeDefined();
      expect(proto?.methods.map((m) => m.name)).toContain('validate()');
      expect(proto?.methods.map((m) => m.name)).toContain('commit()');
    });

    it('extracts single prototype assignments like Foo.prototype.bar = function()', () => {
      const lines = [
        'function Worker(task) {',
        '  this.task = task;',
        '}',
        'Worker.prototype.start = function() {',
        '  this.running = true;',
        '};',
        'Worker.prototype.stop = function() {',
        '  this.running = false;',
        '};',
      ];

      const result = extractor.extractStructures(lines, 'javascript');
      const workerClass = result.classes.find((c) => c.name.includes('Worker'));
      expect(workerClass).toBeDefined();
      expect(workerClass?.methods.map((m) => m.name)).toEqual(['start()', 'stop()']);
    });
  });

  describe('Standard ES6 Classes and Modern JS/TS Syntax', () => {
    it('extracts ES6 classes with constructor and shorthand methods', () => {
      const lines = [
        'export default class CalculationEngine {',
        '  constructor(seed) {',
        '    this.seed = seed;',
        '  }',
        '  public calculate(val: number): number {',
        '    return val * this.seed;',
        '  }',
        '  private async syncRemote(): Promise<void> {',
        '    await fetch();',
        '  }',
        '}',
      ];

      const result = extractor.extractStructures(lines, 'typescript');
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('CalculationEngine');
      expect(result.classes[0].kind).toBe('class');
      expect(result.classes[0].methods.map((m) => m.name)).toEqual([
        'constructor()',
        'calculate()',
        'syncRemote()',
      ]);
    });

    it('extracts arrow functions and class property arrows', () => {
      const lines = [
        'const standaloneArrow = (x, y) => {',
        '  return x + y;',
        '};',
        '',
        'class Component {',
        '  handleClick = (e) => {',
        '    console.log(e);',
        '  };',
        '}',
      ];

      const result = extractor.extractStructures(lines, 'javascript');
      expect(result.methods.map((m) => m.name)).toContain('standaloneArrow()');
      expect(result.classes[0].methods.map((m) => m.name)).toContain('handleClick()');
    });
  });

  describe('Code Health & God Object Evaluation', () => {
    it('detects God Object smell on oversized Rhino object literals in Code Health', () => {
      // Generate a large Rhino object literal with 12 methods and 320 LOC
      const lines: string[] = ['var BigGodObject = {'];
      for (let i = 1; i <= 12; i++) {
        lines.push(`  method${i}: function(param1, param2) {`);
        for (let j = 0; j < 25; j++) {
          lines.push(`    var step_${j} = param1 + param2 + ${j};`);
        }
        lines.push('    return step_0;');
        lines.push('  },');
      }
      lines.push('};');

      const { classes, methods } = extractor.extractStructures(lines, 'javascript');
      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('BigGodObject');
      expect(classes[0].methods.length).toBe(12);

      const health = healthAnalyzer.analyzeFile(lines, methods, classes, 'javascript');
      expect(health.score).toBeLessThan(9.0);

      const godObjectFinding = health.biomarkers.find((b) => b.type === 'brain_class');
      expect(godObjectFinding).toBeDefined();
      expect(godObjectFinding?.details).toContain('Object');
      expect(godObjectFinding?.details).toContain('God Object smell');
      expect(godObjectFinding?.details).toContain('BigGodObject');
    });

    it('detects method-level biomarkers (nested complexity, large method) inside Rhino functions', () => {
      const lines = [
        'var LegacyUtility = {',
        '  deepFunction: function(a, b, c, d, e, f) {', // 6 params -> excess_parameters
      ];
      // Add heavy LOC and deep nesting across multiple lines
      for (let i = 0; i < 15; i++) {
        lines.push('    if (a) {');
        lines.push('      if (b) {');
        lines.push('        if (c) {');
        lines.push('          if (d) {');
        lines.push('            if (e) {');
        lines.push('              console.log(i);');
        lines.push('            }');
        lines.push('          }');
        lines.push('        }');
        lines.push('      }');
        lines.push('    }');
      }
      lines.push('  }');
      lines.push('};');

      const { classes, methods } = extractor.extractStructures(lines, 'javascript');
      expect(methods).toHaveLength(1);

      const health = healthAnalyzer.analyzeFile(lines, methods, classes, 'javascript');
      const methodFindings = health.biomarkers.filter((b) => b.functionName === 'deepFunction()');

      expect(methodFindings.some((b) => b.type === 'excess_parameters')).toBe(true);
      expect(methodFindings.some((b) => b.type === 'large_method')).toBe(true);
      expect(methodFindings.some((b) => b.type === 'deep_nesting')).toBe(true);
    });

    it('filters out trivial data object literals that contain no methods', () => {
      const lines = [
        'var appConfig = {',
        '  apiUrl: "https://api.example.com",',
        '  timeout: 5000,',
        '  retries: 3',
        '};',
      ];

      const result = extractor.extractStructures(lines, 'javascript');
      // Simple config without methods and < 40 LOC is not treated as a class/module
      expect(result.classes).toHaveLength(0);
      expect(result.methods).toHaveLength(0);
    });

    it('does not confuse control flow statements with functions', () => {
      const lines = [
        'if (condition) {',
        '  doSomething();',
        '}',
        'while (running) {',
        '  step();',
        '}',
        'for (var i = 0; i < 10; i++) {',
        '  process(i);',
        '}',
      ];

      const result = extractor.extractStructures(lines, 'javascript');
      expect(result.methods).toHaveLength(0);
    });
  });

  describe('Constructor functions and this-assigned methods', () => {
    const extract = (src: string) => extractor.extractStructures(src.split('\n'), 'javascript');
    const names = (r: { methods: { name: string }[] }) => r.methods.map((m) => m.name);

    describe('anonymous function scopes', () => {
      it('keeps names of nested functions declared inside anonymous callbacks', () => {
        const r = extract(
          [
            'function outer(items) {',
            '  items.forEach(function (x) {',
            '    function inner(y) {',
            '      return y;',
            '    }',
            '    inner(x);',
            '  });',
            '}',
          ].join('\n')
        );
        expect(names(r)).toEqual(['outer()', 'outer > inner()']);
        expect(r.methods[1].parentMethod).toBe('outer');
        expect(r.classes).toHaveLength(0);
      });
    });

    describe('aliases of this', () => {
      it('treats var self = this as this', () => {
        const r = extract(
          [
            'function Cart() {',
            '  var self = this;',
            '  self.remove = function (item) {',
            '    return item;',
            '  };',
            '}',
          ].join('\n')
        );
        expect(r.classes).toHaveLength(1);
        expect(r.classes[0].kind).toBe('constructor');
        expect(r.classes[0].methods.map((m) => m.name)).toEqual(['remove()']);
      });

      it('accepts aliases with other names', () => {
        const r = extract(
          [
            'function Cart() {',
            '  const that = this;',
            '  that.reset = () => {',
            '    return 0;',
            '  };',
            '}',
          ].join('\n')
        );
        expect(r.classes[0].methods.map((m) => m.name)).toEqual(['reset()']);
      });

      it('resolves an alias used inside an anonymous callback to the declaring constructor', () => {
        const r = extract(
          [
            'function Cart(items) {',
            '  var self = this;',
            '  items.forEach(function (i) {',
            '    self.add = function () {',
            '      return i;',
            '    };',
            '  });',
            '}',
          ].join('\n')
        );
        expect(r.classes[0].name).toBe('Cart');
        expect(r.classes[0].methods.map((m) => m.name)).toEqual(['add()']);
      });

      it('does not treat assignments on unrelated objects as methods', () => {
        const r = extract(
          [
            'function Cart(options) {',
            '  options.callback = function () {',
            '    return 1;',
            '  };',
            '}',
          ].join('\n')
        );
        expect(r.classes.every((c) => c.kind !== 'constructor')).toBe(true);
        expect(names(r)).toContain('Cart > callback()');
      });
    });

    describe('function values assigned to this', () => {
      const r = extract(
        [
          'function Cart(items) {',
          '  this.items = items;',
          '  this.handler = onClick;',
          '  this.add = function (item) {',
          '    this.items.push(item);',
          '  };',
          '  this.total = () => {',
          '    return 0;',
          '  };',
          '  this.load = async function () {',
          '    return 1;',
          '  };',
          '  this.double = (x) => x * 2;',
          '  this.reset = (',
          '    a,',
          '    b',
          '  ) => {',
          '    return a + b;',
          '  };',
          '}',
        ].join('\n')
      );
      const byName = (n: string) => r.methods.find((m) => m.name === n);

      it('detects function expressions with their own line range', () => {
        expect(byName('add()')).toMatchObject({ startLine: 4, endLine: 6 });
      });

      it('detects arrow functions with block and expression bodies', () => {
        expect(byName('total()')).toMatchObject({ startLine: 7, endLine: 9 });
        expect(byName('double()')).toMatchObject({ startLine: 13, endLine: 13 });
      });

      it('detects async function expressions', () => {
        expect(byName('load()')).toMatchObject({ startLine: 10, endLine: 12 });
      });

      it('detects arrow functions with multi-line parameter lists', () => {
        expect(byName('reset()')).toMatchObject({ startLine: 14, endLine: 19 });
      });

      it('ignores non-function values', () => {
        expect(byName('items()')).toBeUndefined();
        expect(byName('handler()')).toBeUndefined();
      });

      it('reports the methods without parent and keeps the constructor body', () => {
        expect(byName('add()')?.parentMethod).toBeUndefined();
        expect(byName('add()')?.isNested).toBeFalsy();
        expect(byName('Cart()')).toMatchObject({ startLine: 1, endLine: 20 });
        expect(r.classes[0].methods.map((m) => m.name)).toEqual([
          'add()',
          'total()',
          'load()',
          'double()',
          'reset()',
        ]);
      });
    });

    describe('constructor containers', () => {
      it('classifies a PascalCase constructor as constructor, not component', () => {
        const r = extract(['function Cart() {', '  this.add = function () {', '    return 1;', '  };', '}'].join('\n'));
        expect(r.classes).toHaveLength(1);
        expect(r.classes[0]).toMatchObject({ name: 'Cart', kind: 'constructor', startLine: 1, endLine: 5 });
      });

      it('creates a container for a lower-case constructor', () => {
        const r = extract(['function cart() {', '  this.add = function () {', '    return 1;', '  };', '}'].join('\n'));
        expect(r.classes).toHaveLength(1);
        expect(r.classes[0]).toMatchObject({ name: 'cart', kind: 'constructor' });
        expect(r.classes[0].methods.map((m) => m.name)).toEqual(['add()']);
      });

      it('keeps functions without this-assigned methods unchanged', () => {
        const r = extract(['function Header(props) {', '  return render(props);', '}'].join('\n'));
        expect(names(r)).toEqual(['Header()']);
        expect(r.classes.every((c) => c.kind !== 'constructor')).toBe(true);
      });

      it('detects a constructor inside an AMD module', () => {
        const r = extract(
          [
            "define(['app/Store'], function (Store) {",
            '  function Cart() {',
            '    this.add = function () {',
            '      Store.persist();',
            '    };',
            '  }',
            '  return Cart;',
            '});',
          ].join('\n')
        );
        expect(r.classes).toHaveLength(1);
        expect(r.classes[0]).toMatchObject({ name: 'Cart', kind: 'constructor', startLine: 2, endLine: 6 });
        expect(r.classes[0].methods.map((m) => m.name)).toEqual(['add()']);
      });

      it('detects a constructor nested in an IIFE module and drops the wrapper component', () => {
        const r = extract(
          [
            'var Cart = (function () {',
            '  function Cart() {',
            '    this.add = function () {',
            '      return 1;',
            '    };',
            '  }',
            '  return Cart;',
            '})();',
          ].join('\n')
        );
        expect(r.classes).toHaveLength(1);
        expect(r.classes[0]).toMatchObject({ name: 'Cart', kind: 'constructor', startLine: 2, endLine: 6 });
        expect(r.classes[0].methods.map((m) => m.name)).toEqual(['add()']);
        const body = r.methods.find((m) => m.startLine === 2);
        expect(body).toMatchObject({ name: 'Cart()', isNested: false });
        expect(body?.parentMethod).toBeUndefined();
      });
    });

    describe('binding of this', () => {
      it('ignores this-assignments inside anonymous callbacks', () => {
        const r = extract(
          [
            'function init(items) {',
            '  items.forEach(function (el) {',
            '    this.onclick = function () {',
            '      return 1;',
            '    };',
            '  });',
            '}',
          ].join('\n')
        );
        expect(r.classes).toHaveLength(0);
        expect(names(r)).toEqual(['init()', 'init > onclick()']);
      });

      it('treats arrow callbacks as transparent', () => {
        const r = extract(
          [
            'function Cart(items) {',
            '  items.forEach((i) => {',
            '    this.add = function () {',
            '      return i;',
            '    };',
            '  });',
            '}',
          ].join('\n')
        );
        expect(r.classes[0]).toMatchObject({ name: 'Cart', kind: 'constructor' });
        expect(r.classes[0].methods.map((m) => m.name)).toEqual(['add()']);
      });
    });

    describe('closures and container methods', () => {
      it('keeps private helpers nested and nests closures under constructor methods', () => {
        const r = extract(
          [
            'function Cart() {',
            '  function validate(item) {',
            '    return !!item;',
            '  }',
            '  this.add = function (x) {',
            '    validate(x);',
            '  };',
            '  this.load = function () {',
            '    function parse(r) {',
            '      return r;',
            '    }',
            '    return parse(1);',
            '  };',
            '}',
          ].join('\n')
        );
        expect(r.methods.find((m) => m.name === 'Cart > validate()')).toMatchObject({
          parentMethod: 'Cart',
          isNested: true,
        });
        expect(r.methods.find((m) => m.name === 'add()')?.parentMethod).toBeUndefined();
        expect(r.methods.find((m) => m.name === 'load > parse()')).toMatchObject({
          parentMethod: 'load',
          isNested: true,
        });
      });

      it('does not create a constructor for this-assignments inside a prototype method', () => {
        const r = extract(
          [
            'Foo.prototype.init = function () {',
            '  this.onClick = function () {',
            '    return 1;',
            '  };',
            '};',
          ].join('\n')
        );
        expect(r.classes.map((c) => c.kind)).toEqual(['prototype']);
        expect(names(r)).toEqual(['init()', 'init > onClick()']);
      });

      it('reports arrow assignments in an ES6 class constructor as nested helpers', () => {
        const r = extract(
          [
            'class Foo {',
            '  constructor() {',
            '    this.handle = () => {',
            '      return 1;',
            '    };',
            '  }',
            '}',
          ].join('\n')
        );
        expect(r.classes.map((c) => c.kind)).toEqual(['class']);
        expect(names(r)).toEqual(['constructor()', 'constructor > handle()']);
      });
    });
  });
});
