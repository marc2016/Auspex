import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TreeNode } from '../src/analyzer/types';

let mockCodeLensConfig = {
  enabled: true,
};

vi.mock('vscode', () => {
  let changeListener: (() => void) | null = null;
  return {
    EventEmitter: vi.fn().mockImplementation(() => {
      return {
        event: vi.fn((listener: any) => {
          changeListener = listener;
        }),
        fire: vi.fn(() => {
          if (changeListener) changeListener();
        }),
        dispose: vi.fn(),
      };
    }),
    Range: vi.fn().mockImplementation((startLine, startChar, endLine, endChar) => ({
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    })),
    CodeLens: vi.fn().mockImplementation((range, command) => ({
      range,
      command,
    })),
    workspace: {
      getConfiguration: vi.fn((section: string) => ({
        get: vi.fn((key: string, defVal: any) => {
          if (key === 'codeLens.enabled') return mockCodeLensConfig.enabled;
          return defVal;
        }),
      })),
    },
  };
});

import * as vscode from 'vscode';
import { HealthCodeLensProvider } from '../src/editor/HealthCodeLensProvider';
import { JavaScriptExtractor } from '../src/analyzer/extractors/JavaScriptExtractor';
import { CodeHealthAnalyzer } from '../src/analyzer/codeHealth';
import { TreeAggregator } from '../src/analyzer/treeAggregator';

describe('HealthCodeLensProvider', () => {
  let provider: HealthCodeLensProvider;
  let mockTree: TreeNode;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCodeLensConfig.enabled = true;
    provider = new HealthCodeLensProvider('/workspace');

    mockTree = {
      name: 'root',
      path: '/',
      type: 'folder',
      value: 100,
      loc: 100,
      commitCount: 1,
      churnScore: 0,
      fixCount: 0,
      featCount: 0,
      refactorCount: 0,
      linesAdded: 0,
      linesDeleted: 0,
      defectRatio: 0,
      children: [
        {
          name: 'calc.ts',
          path: 'src/calc.ts',
          type: 'file',
          value: 100,
          loc: 100,
          commitCount: 1,
          churnScore: 0,
          fixCount: 0,
          featCount: 0,
          refactorCount: 0,
          linesAdded: 0,
          linesDeleted: 0,
          defectRatio: 0,
          children: [
            {
              name: 'add',
              path: 'src/calc.ts#add',
              type: 'method',
              value: 10,
              loc: 10,
              startLine: 5,
              endLine: 15,
              commitCount: 1,
              churnScore: 0,
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
              codeHealth: 9.5,
              biomarkers: [],
            },
            {
              name: 'calculateComplex',
              path: 'src/calc.ts#calculateComplex',
              type: 'method',
              value: 50,
              loc: 50,
              startLine: 20,
              endLine: 70,
              commitCount: 1,
              churnScore: 0,
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
              codeHealth: 5.4,
              biomarkers: [
                {
                  type: 'brain_method',
                  severity: 'high',
                  details: 'Complex calculation',
                },
                {
                  type: 'bumpy_road',
                  severity: 'medium',
                  details: 'Multiple bumps',
                },
              ],
            },
            {
              name: 'warningMethod',
              path: 'src/calc.ts#warningMethod',
              type: 'method',
              value: 20,
              loc: 20,
              startLine: 75,
              endLine: 95,
              commitCount: 1,
              churnScore: 0,
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
              codeHealth: 7.2,
              biomarkers: [
                {
                  type: 'complex_conditional',
                  severity: 'low',
                  details: 'Slightly complex condition',
                },
              ],
            },
          ],
        },
      ],
    };
  });

  it('provides CodeLens items for methods with health scores, icons, and biomarker counts', () => {
    provider.updateTree(mockTree);

    const doc: any = {
      uri: { scheme: 'file', fsPath: '/workspace/src/calc.ts' },
      lineCount: 100,
    };

    const lenses = provider.provideCodeLenses(doc, {} as any);
    expect(lenses).toHaveLength(3);

    // 1. Healthy method (add: 9.5)
    expect(lenses[0].range.start.line).toBe(4); // line 5 - 1
    expect(lenses[0].command?.title).toContain('$(heart)');
    expect(lenses[0].command?.title).toContain('Health:\u00A09.5/10');
    expect(lenses[0].command?.title).not.toContain('Biomarker');

    // 2. Critical method (calculateComplex: 5.4)
    expect(lenses[1].range.start.line).toBe(19); // line 20 - 1
    expect(lenses[1].command?.title).toContain('$(error)');
    expect(lenses[1].command?.title).toContain('Health:\u00A05.4/10');
    expect(lenses[1].command?.title).toContain('(2 Biomarker)');

    // 3. Warning method (warningMethod: 7.2)
    expect(lenses[2].range.start.line).toBe(74); // line 75 - 1
    expect(lenses[2].command?.title).toContain('$(warning)');
    expect(lenses[2].command?.title).toContain('Health:\u00A07.2/10');
    expect(lenses[2].command?.title).toContain('(1 Biomarker)');
  });

  it('returns empty array when codeLens.enabled is false', () => {
    mockCodeLensConfig.enabled = false;
    provider.updateTree(mockTree);

    const doc: any = {
      uri: { scheme: 'file', fsPath: '/workspace/src/calc.ts' },
      lineCount: 100,
    };

    const lenses = provider.provideCodeLenses(doc, {} as any);
    expect(lenses).toEqual([]);
  });

  it('returns empty array for non-file schemes or documents outside workspace', () => {
    provider.updateTree(mockTree);

    const gitDoc: any = {
      uri: { scheme: 'git', fsPath: '/workspace/src/calc.ts' },
      lineCount: 100,
    };
    expect(provider.provideCodeLenses(gitDoc, {} as any)).toEqual([]);

    const outsideDoc: any = {
      uri: { scheme: 'file', fsPath: '/other/path/calc.ts' },
      lineCount: 100,
    };
    expect(provider.provideCodeLenses(outsideDoc, {} as any)).toEqual([]);
  });

  it('returns empty array when tree is not set or file is not found', () => {
    provider.updateTree(null);

    const doc: any = {
      uri: { scheme: 'file', fsPath: '/workspace/src/calc.ts' },
      lineCount: 100,
    };
    expect(provider.provideCodeLenses(doc, {} as any)).toEqual([]);

    provider.updateTree(mockTree);
    const unknownDoc: any = {
      uri: { scheme: 'file', fsPath: '/workspace/src/unknown.ts' },
      lineCount: 100,
    };
    expect(provider.provideCodeLenses(unknownDoc, {} as any)).toEqual([]);
  });

  it('fires refresh and disposes without error', () => {
    expect(() => provider.refresh()).not.toThrow();
    expect(() => provider.dispose()).not.toThrow();
  });

  it('updates CodeLens positions dynamically when setFileNode is provided', () => {
    provider.updateTree(mockTree);

    const doc: any = {
      uri: { scheme: 'file', fsPath: '/workspace/src/calc.ts' },
      lineCount: 100,
    };

    // Initially add is at line 5 (range.start.line = 4)
    let lenses = provider.provideCodeLenses(doc, {} as any);
    expect(lenses[0].range.start.line).toBe(4);

    // Dynamic update moves add to line 12 (e.g. after user inserted lines above)
    const updatedNode: TreeNode = {
      name: 'calc.ts',
      path: 'src/calc.ts',
      type: 'file',
      value: 100,
      loc: 100,
      codeHealth: 9.5,
      children: [
        {
          name: 'add',
          path: 'src/calc.ts#add',
          type: 'method',
          value: 10,
          loc: 10,
          startLine: 12,
          endLine: 22,
          codeHealth: 9.5,
        },
      ],
    };

    provider.setFileNode('src/calc.ts', updatedNode);
    lenses = provider.provideCodeLenses(doc, {} as any);
    expect(lenses).toHaveLength(1);
    expect(lenses[0].range.start.line).toBe(11);
  });

  it('shows a CodeLens on the line where a constructor method is assigned to this', () => {
    const lines = [
      'function Cart() {',
      '  this.items = [];',
      '  this.add = function (item) {',
      '    this.items.push(item);',
      '  };',
      '}',
    ];
    const { classes, methods } = new JavaScriptExtractor().extractStructures(lines, 'javascript');
    const health = new CodeHealthAnalyzer().analyzeFile(lines, methods, classes, 'javascript');
    const { tree } = new TreeAggregator().buildTree(
      [
        {
          filePath: 'src/cart.js',
          classes,
          methods,
          loc: lines.length,
          fileHash: 'h',
          codeHealth: health.score,
          biomarkers: health.biomarkers,
        },
      ],
      new Map()
    );
    provider.updateTree(tree);

    const doc = {
      uri: { scheme: 'file', fsPath: '/workspace/src/cart.js' },
      lineCount: lines.length,
    } as any;
    const lenses = provider.provideCodeLenses(doc, {} as any);
    const lensLines = lenses.map((l: any) => l.range.start.line);

    // 0-based line 2 is "this.add = function"
    expect(lensLines).toContain(2);
  });

  describe('call count lens', () => {
    const lines = [
      'function Cart() {',
      '  this.add = function (item) {',
      '    return item;',
      '  };',
      '}',
    ];
    const buildTree = () => {
      const { classes, methods } = new JavaScriptExtractor().extractStructures(lines, 'javascript');
      return new TreeAggregator().buildTree(
        [{ filePath: 'src/cart.js', classes, methods, loc: lines.length, fileHash: 'h' }],
        new Map()
      ).tree;
    };
    const doc = { uri: { scheme: 'file', fsPath: '/workspace/src/cart.js' }, lineCount: lines.length } as any;

    it('shows caller and callee counts above known functions and opens the Calls view', () => {
      const lookup = vi.fn((file: string, start: number) =>
        file === 'src/cart.js' && start === 2 ? { callers: 5, callees: 3 } : undefined
      );
      const callProvider = new HealthCodeLensProvider('/workspace', lookup);
      callProvider.updateTree(buildTree());
      const lenses = callProvider.provideCodeLenses(doc, {} as any) as any[];
      const callLens = lenses.find((l) => l.command.command === 'auspex.showCalls');
      expect(callLens.command.title).toBe('5 callers | 3 calls');
      expect(callLens.command.arguments).toEqual(['src/cart.js', 2]);
      expect(callLens.range.start.line).toBe(1);
      expect(lookup).toHaveBeenCalledWith('src/cart.js', 2, 4);
    });

    it('adds an "In diagram" lens that opens a focused call diagram', () => {
      const callProvider = new HealthCodeLensProvider('/workspace', () => ({ callers: 1, callees: 0 }));
      callProvider.updateTree(buildTree());
      const lenses = callProvider.provideCodeLenses(doc, {} as any) as any[];
      const diagramLens = lenses.find((l) => l.command.command === 'auspex.openCallDiagram');
      expect(diagramLens.command.title).toBe('In diagram');
      expect(diagramLens.command.arguments).toEqual([{ focus: { file: 'src/cart.js', startLine: 2 } }]);
    });

    it('shows no call count lens when CodeLens is disabled', () => {
      mockCodeLensConfig.enabled = false;
      const callProvider = new HealthCodeLensProvider('/workspace', () => ({ callers: 1, callees: 1 }));
      callProvider.updateTree(buildTree());
      expect(callProvider.provideCodeLenses(doc, {} as any)).toEqual([]);
    });

    it('shows no call count lens for functions without call data', () => {
      const callProvider = new HealthCodeLensProvider('/workspace', () => undefined);
      callProvider.updateTree(buildTree());
      const lenses = callProvider.provideCodeLenses(doc, {} as any) as any[];
      expect(lenses.some((l) => l.command.command === 'auspex.showCalls')).toBe(false);
    });
  });
});
