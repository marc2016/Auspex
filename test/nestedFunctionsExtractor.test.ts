import { describe, it, expect } from 'vitest';
import { JavaScriptExtractor } from '../src/analyzer/extractors/JavaScriptExtractor';
import { CodeHealthAnalyzer } from '../src/analyzer/codeHealth';
import { TreeAggregator } from '../src/analyzer/treeAggregator';
import type { ParsedFileInfo, FileCommitStat } from '../src/analyzer/types';

describe('Nested Functions & Scopes in JavaScript/TypeScript', () => {
  const extractor = new JavaScriptExtractor();
  const healthAnalyzer = new CodeHealthAnalyzer();
  const treeAggregator = new TreeAggregator();

  describe('Scenario 1: React Functional Components', () => {
    it('extracts React components as containers and maps inner handlers as methods', () => {
      const lines = [
        'import React, { useState } from "react";',
        '',
        'export function UserProfile({ userId }: { userId: string }) {',
        '  const [user, setUser] = useState(null);',
        '  const [loading, setLoading] = useState(false);',
        '',
        '  const handleSave = async () => {',
        '    setLoading(true);',
        '    await fetch(`/api/users/${userId}`);',
        '    setLoading(false);',
        '  };',
        '',
        '  function renderBadge(role: string) {',
        '    if (role === "admin") {',
        '      return <span>Admin</span>;',
        '    }',
        '    return <span>User</span>;',
        '  }',
        '',
        '  return (',
        '    <div>',
        '      <h1>Profile</h1>',
        '      <button onClick={handleSave}>Save</button>',
        '    </div>',
        '  );',
        '}',
      ];

      const { classes, methods } = extractor.extractStructures(lines, 'typescript');

      // UserProfile is PascalCase -> extracted as component container
      expect(classes).toHaveLength(1);
      const comp = classes[0];
      expect(comp.name).toBe('UserProfile');
      expect(comp.kind).toBe('component');
      expect(comp.methods.map((m) => m.name)).toEqual([
        'UserProfile > handleSave()',
        'UserProfile > renderBadge()',
      ]);

      // Global methods list contains UserProfile() and its inner methods
      const methodNames = methods.map((m) => m.name);
      expect(methodNames).toContain('UserProfile()');
      expect(methodNames).toContain('UserProfile > handleSave()');
      expect(methodNames).toContain('UserProfile > renderBadge()');

      // Inner methods have parentMethod and isNested set
      const saveMethod = methods.find((m) => m.name.includes('handleSave'))!;
      expect(saveMethod.parentMethod).toBe('UserProfile');
      expect(saveMethod.isNested).toBe(true);
    });

    it('extracts React arrow function components with nested handlers', () => {
      const lines = [
        'export const NavigationBar = () => {',
        '  const [open, setOpen] = useState(false);',
        '  const toggle = () => {',
        '    setOpen(!open);',
        '  };',
        '  return <nav><button onClick={toggle}>Menu</button></nav>;',
        '};',
      ];

      const { classes, methods } = extractor.extractStructures(lines, 'typescript');

      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('NavigationBar');
      expect(classes[0].kind).toBe('component');
      expect(classes[0].methods.map((m) => m.name)).toContain('NavigationBar > toggle()');
      expect(methods.map((m) => m.name)).toEqual(['NavigationBar()', 'NavigationBar > toggle()']);
    });
  });

  describe('Scenario 2: Module & Factory Closures', () => {
    it('extracts inner functions from factory closures with qualified parent names', () => {
      const lines = [
        'export function createCounter(initialValue: number = 0) {',
        '  let current = initialValue;',
        '',
        '  function increment(step: number = 1) {',
        '    current += step;',
        '    return current;',
        '  }',
        '',
        '  const decrement = (step: number = 1) => {',
        '    current -= step;',
        '    return current;',
        '  };',
        '',
        '  return { increment, decrement };',
        '}',
      ];

      const { methods } = extractor.extractStructures(lines, 'typescript');

      expect(methods.map((m) => m.name)).toEqual([
        'createCounter()',
        'createCounter > increment()',
        'createCounter > decrement()',
      ]);

      const incMethod = methods.find((m) => m.name.includes('increment'))!;
      expect(incMethod.parentMethod).toBe('createCounter');
      expect(incMethod.isNested).toBe(true);
    });

    it('extracts nested methods inside IIFEs', () => {
      const lines = [
        'const ServiceLocator = (function() {',
        '  const services = new Map();',
        '  function register(name, service) {',
        '    services.set(name, service);',
        '  }',
        '  function resolve(name) {',
        '    return services.get(name);',
        '  }',
        '  return { register, resolve };',
        '})();',
      ];

      const { methods } = extractor.extractStructures(lines, 'javascript');
      const names = methods.map((m) => m.name);
      expect(names).toContain('ServiceLocator()');
      expect(names).toContain('ServiceLocator > register()');
      expect(names).toContain('ServiceLocator > resolve()');
    });
  });

  describe('Scenario 3: Utility Algorithms with Private Helper Functions', () => {
    it('extracts private sub-functions and builds hierarchical tree nodes', () => {
      const lines = [
        'export function processData(items: number[]) {',
        '  function sanitize(v: number) {',
        '    return Math.max(0, v);',
        '  }',
        '  function transform(v: number) {',
        '    return sanitize(v) * 2;',
        '  }',
        '  return items.map(transform);',
        '}',
      ];

      const { methods, classes } = extractor.extractStructures(lines, 'typescript');

      expect(methods).toHaveLength(3);
      expect(methods.map((m) => m.name)).toEqual([
        'processData()',
        'processData > sanitize()',
        'processData > transform()',
      ]);

      // Verify TreeAggregator nests child methods under parent method
      const fileInfo: ParsedFileInfo = {
        filePath: 'src/utils/process.ts',
        loc: lines.length,
        fileHash: 'test_hash',
        classes,
        methods,
      };

      const stats = new Map<string, FileCommitStat>();
      stats.set('src/utils/process.ts', {
        commitCount: 1,
        fixCount: 0,
        featCount: 1,
        refactorCount: 0,
        linesAdded: 10,
        linesDeleted: 0,
        lastModifiedAt: Date.now(),
      });

      const { tree } = treeAggregator.buildTree([fileInfo], stats);
      const fileNode = tree.children?.[0]?.children?.[0]?.children?.[0]; // src/utils/process.ts
      expect(fileNode).toBeDefined();

      // Top-level children of the file should only contain processData(), NOT the nested helpers directly
      const topLevelMethod = fileNode?.children?.find((c) => c.name === 'processData()');
      expect(topLevelMethod).toBeDefined();
      expect(topLevelMethod?.children).toHaveLength(2);
      expect(topLevelMethod?.children?.map((c) => c.name)).toEqual([
        'processData > sanitize()',
        'processData > transform()',
      ]);
    });
  });

  describe('Code Health: Scope Isolation & Net LOC', () => {
    it('does not falsely penalize an outer function with large_method when its net LOC is small', () => {
      // Outer function has 80 lines total, but 60 lines are in two inner helpers
      const lines: string[] = ['function outerBundle() {'];
      // Helper 1: 30 lines
      lines.push('  function helperOne() {');
      for (let i = 0; i < 28; i++) {
        lines.push(`    const x_${i} = ${i};`);
      }
      lines.push('  }');
      // Helper 2: 30 lines
      lines.push('  function helperTwo() {');
      for (let i = 0; i < 28; i++) {
        lines.push(`    const y_${i} = ${i};`);
      }
      lines.push('  }');
      // Outer glue code: only ~5 lines
      lines.push('  helperOne();');
      lines.push('  helperTwo();');
      lines.push('  return true;');
      lines.push('}');

      const { methods, classes } = extractor.extractStructures(lines, 'javascript');
      expect(methods).toHaveLength(3);

      const health = healthAnalyzer.analyzeFile(lines, methods, classes, 'javascript');
      const outerFindings = health.biomarkers.filter((b) => b.functionName === 'outerBundle()');

      // Net LOC of outerBundle() is ~20 lines, so large_method should NOT be triggered
      expect(outerFindings.some((b) => b.type === 'large_method')).toBe(false);
    });

    it('isolates nesting complexity so that deep nesting in a helper only penalizes the helper', () => {
      const lines = [
        'function cleanWorkflow() {',
        '  const val = 1;',
        '  // Deeply nested helper',
        '  function nastyHelper(x) {',
        '    if (x > 0) {',
        '      if (x > 1) {',
        '        if (x > 2) {',
        '          if (x > 3) {',
        '            if (x > 4) {',
        '              return x * 10;',
        '            }',
        '          }',
        '        }',
        '      }',
        '    }',
        '    return 0;',
        '  }',
        '  return nastyHelper(val);',
        '}',
      ];

      const { methods, classes } = extractor.extractStructures(lines, 'javascript');
      expect(methods).toHaveLength(2);

      const health = healthAnalyzer.analyzeFile(lines, methods, classes, 'javascript');

      // The helper should get deep_nesting / nested_complexity
      const helperFindings = health.biomarkers.filter((b) =>
        b.functionName?.includes('nastyHelper')
      );
      expect(helperFindings.some((b) => b.type === 'deep_nesting' || b.type === 'nested_complexity')).toBe(true);

      // The outer cleanWorkflow() should NOT get deep_nesting or nested_complexity
      const outerFindings = health.biomarkers.filter((b) =>
        b.functionName === 'cleanWorkflow()'
      );
      expect(outerFindings.some((b) => b.type === 'deep_nesting' || b.type === 'nested_complexity')).toBe(false);

      // Outer method individual score should remain high
      const outerMethod = methods.find((m) => m.name === 'cleanWorkflow()')!;
      expect(outerMethod.codeHealth).toBe(10.0);
    });

    it('does not confuse constants, hooks or object lookups with functions', () => {
      const lines = [
        'function ComponentWithConstants() {',
        '  const LIMIT = 100;',
        '  const [name, setName] = useState("init");',
        '  const LOOKUP = { a: 1, b: 2 };',
        '  const doActualWork = () => {',
        '    return LIMIT;',
        '  };',
        '  return doActualWork();',
        '}',
      ];

      const { methods } = extractor.extractStructures(lines, 'javascript');
      const methodNames = methods.map((m) => m.name);

      // Only ComponentWithConstants and doActualWork should be methods
      expect(methodNames).toContain('ComponentWithConstants()');
      expect(methodNames).toContain('ComponentWithConstants > doActualWork()');
      expect(methodNames.some((n) => n.includes('LIMIT'))).toBe(false);
      expect(methodNames.some((n) => n.includes('setName'))).toBe(false);
      expect(methodNames.some((n) => n.includes('LOOKUP'))).toBe(false);
    });
  });
});
