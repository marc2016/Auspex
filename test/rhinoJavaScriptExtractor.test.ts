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
});
