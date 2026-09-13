import { describe, it, expect } from 'vitest';
import { CodeHealthAnalyzer } from '../src/analyzer/codeHealth';
import type { MethodInfo, ClassInfo } from '../src/analyzer/types';

describe('CodeHealthAnalyzer', () => {
  const analyzer = new CodeHealthAnalyzer();

  it('rates a simple, clean file with 10.0 and no biomarkers', () => {
    const lines = [
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
      '',
      'export function greet(name: string): string {',
      '  return `Hello, ${name}`;',
      '}',
    ];

    const methods: MethodInfo[] = [
      { name: 'add', startLine: 1, endLine: 3, loc: 3 },
      { name: 'greet', startLine: 5, endLine: 7, loc: 3 },
    ];

    const result = analyzer.analyzeFile(lines, methods, [], 'typescript');
    expect(result.score).toBe(10.0);
    expect(result.biomarkers.length).toBe(0);
  });

  it('detects Nested Complexity when nesting depth >= 4', () => {
    const lines = [
      'function deepFunction(items: any[]) {',
      '  if (items) {',
      '    for (const item of items) {',
      '      if (item.active) {',
      '        while (item.hasMore()) {',
      '          console.log(item.next());',
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
    ];

    const methods: MethodInfo[] = [
      { name: 'deepFunction', startLine: 1, endLine: 11, loc: 11 },
    ];

    const result = analyzer.analyzeFile(lines, methods, [], 'typescript');
    expect(result.score).toBeLessThan(10.0);
    const nestedFinding = result.biomarkers.find((b) => b.type === 'nested_complexity');
    expect(nestedFinding).toBeDefined();
    expect(nestedFinding?.functionName).toBe('deepFunction');
  });

  it('detects Complex Conditionals when multiple operators are chained', () => {
    const lines = [
      'function checkAccess(user: any, doc: any) {',
      '  if (user && user.isLoggedIn && (user.isAdmin || user.isOwner) && !doc.isLocked) {',
      '    if (doc.type === "A" || doc.type === "B" || doc.type === "C") {',
      '      return true;',
      '    }',
      '  }',
      '  return false;',
      '}',
    ];

    const methods: MethodInfo[] = [
      { name: 'checkAccess', startLine: 1, endLine: 8, loc: 8 },
    ];

    const result = analyzer.analyzeFile(lines, methods, [], 'typescript');
    const complexFinding = result.biomarkers.find((b) => b.type === 'complex_conditional');
    expect(complexFinding).toBeDefined();
  });

  it('detects Bumpy Road when multiple separate nested chunks exist', () => {
    const lines = [
      'function processPayment(req: any) {',
      '  // Bump 1',
      '  if (req.user) {',
      '    if (req.user.isValid) {',
      '      validateUser();',
      '    }',
      '  }',
      '  logStep1();',
      '  // Bump 2',
      '  if (req.account) {',
      '    for (const tx of req.account.txs) {',
      '      auditTx(tx);',
      '    }',
      '  }',
      '  logStep2();',
      '  // Bump 3',
      '  if (req.amount > 0) {',
      '    while (retries > 0) {',
      '      attemptCharge();',
      '    }',
      '  }',
      '  // Add filler lines to exceed 30 LOC',
      ...Array(15).fill('  step();'),
      '}',
    ];

    const methods: MethodInfo[] = [
      { name: 'processPayment', startLine: 1, endLine: lines.length, loc: lines.length },
    ];

    const result = analyzer.analyzeFile(lines, methods, [], 'typescript');
    const bumpy = result.biomarkers.find((b) => b.type === 'bumpy_road');
    expect(bumpy).toBeDefined();
    expect(bumpy?.functionName).toBe('processPayment');
  });

  it('detects Brain Method for large, highly branching, deeply nested functions', () => {
    const lines: string[] = [
      'function monolithicHandler(input: any) {',
    ];
    // Generate ~65 lines with high cyclomatic complexity and deep nesting
    for (let i = 0; i < 20; i++) {
      lines.push(`  if (input.code === ${i}) {`);
      lines.push(`    if (input.sub === ${i}) {`);
      lines.push(`      while (input.retry < 3) {`);
      lines.push(`        doWork(${i});`);
      lines.push(`      }`);
      lines.push(`    }`);
      lines.push(`  }`);
    }
    lines.push('}');

    const methods: MethodInfo[] = [
      { name: 'monolithicHandler', startLine: 1, endLine: lines.length, loc: lines.length },
    ];

    const result = analyzer.analyzeFile(lines, methods, [], 'typescript');
    const brain = result.biomarkers.find((b) => b.type === 'brain_method');
    expect(brain).toBeDefined();
    expect(brain?.severity).toBe('high');
    expect(result.score).toBeLessThan(7.0);
  });

  it('detects Brain Class for classes exceeding 500 LOC or 15 methods', () => {
    const lines = Array(550).fill('// code line');
    const dummyMethods: MethodInfo[] = Array(18)
      .fill(null)
      .map((_, i) => ({
        name: `method${i}`,
        startLine: i * 20 + 1,
        endLine: (i + 1) * 20,
        loc: 20,
      }));

    const classes: ClassInfo[] = [
      {
        name: 'HugeManager',
        startLine: 1,
        endLine: 540,
        loc: 540,
        methods: dummyMethods,
      },
    ];

    const result = analyzer.analyzeFile(lines, dummyMethods, classes, 'typescript');
    const brainCls = result.biomarkers.find((b) => b.type === 'brain_class');
    expect(brainCls).toBeDefined();
  });

  it('analyzes Python indentation correctly to detect deep nesting without curly braces', () => {
    const lines = [
      'def deep_python_fn(data):',
      '    if data:',
      '        for group in data.groups:',
      '            if group.is_active:',
      '                for item in group.items:',
      '                    if item.value > 100:',
      '                        print(item.value)',
    ];

    const methods: MethodInfo[] = [
      { name: 'deep_python_fn', startLine: 1, endLine: 7, loc: 7 },
    ];

    const result = analyzer.analyzeFile(lines, methods, [], 'python');
    const nested = result.biomarkers.find((b) => b.type === 'nested_complexity');
    expect(nested).toBeDefined();
    expect(nested?.functionName).toBe('deep_python_fn');
  });

  it('detects Excess Parameters when a method has 5 or more arguments', () => {
    const lines = [
      'function renderWidget(id: string, theme: string, width: number, height: number, animated: boolean, onClick: () => void) {',
      '  return null;',
      '}',
    ];

    const methods: MethodInfo[] = [
      { name: 'renderWidget', startLine: 1, endLine: 3, loc: 3 },
    ];

    const result = analyzer.analyzeFile(lines, methods, [], 'typescript');
    const excess = result.biomarkers.find((b) => b.type === 'excess_parameters');
    expect(excess).toBeDefined();
    expect(excess?.details).toContain('6 parameters');
  });

  it('analyzes top-level script logic when no functions are extracted in non-trivial files', () => {
    // Generate a 60-line script without functions but with deep nesting and branches
    const lines = [
      '// Top-level automation script',
      'if (process.env.RUN) {',
      '  for (let i = 0; i < 10; i++) {',
      '    if (i % 2 === 0) {',
      '      while (true) {',
      '        doSomething();',
      '        break;',
      '      }',
      '    }',
      '  }',
      '}',
      ...Array(50).fill('console.log("running");'),
    ];

    const result = analyzer.analyzeFile(lines, [], [], 'javascript');
    expect(result.score).toBeLessThan(10.0);
    const finding = result.biomarkers.find((b) => b.functionName === 'Top-Level Script');
    expect(finding).toBeDefined();
  });
});

