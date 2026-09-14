import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TreeNode } from '../src/analyzer/types';

vi.mock('vscode', () => {
  return {
    EventEmitter: vi.fn().mockImplementation(() => {
      let listener: any = null;
      return {
        event: vi.fn((l: any) => {
          listener = l;
        }),
        fire: vi.fn(() => {
          if (listener) listener();
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
          if (key === 'codeLens.enabled') return true;
          return defVal;
        }),
      })),
    },
  };
});

import { HealthCodeLensProvider } from '../src/editor/HealthCodeLensProvider';

describe('HealthCodeLensProvider', () => {
  let provider: HealthCodeLensProvider;
  let mockTree: TreeNode;

  beforeEach(() => {
    vi.clearAllMocks();
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
              startLine: 25,
              endLine: 75,
              commitCount: 1,
              churnScore: 0,
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
              codeHealth: 6.8,
              biomarkers: [
                {
                  type: 'bumpy_road',
                  severity: 'medium',
                  details: 'Multiple bumps',
                },
              ],
            },
          ],
        },
      ],
    };
  });

  it('provides CodeLens items for methods with health scores', () => {
    provider.updateTree(mockTree);

    const doc = {
      uri: {
        scheme: 'file',
        fsPath: '/workspace/src/calc.ts',
      },
      lineCount: 100,
    };

    const lenses = provider.provideCodeLenses(doc as any, {} as any);
    expect(lenses.length).toBe(2);

    expect(lenses[0].range.start.line).toBe(4); // line 5 - 1
    expect(lenses[0].command?.title).toContain('9.5/10');
    expect(lenses[0].command?.title).toContain('$(heart)');

    expect(lenses[1].range.start.line).toBe(24); // line 25 - 1
    expect(lenses[1].command?.title).toContain('6.8/10');
    expect(lenses[1].command?.title).toContain('$(warning)');
    expect(lenses[1].command?.title).toContain('1 Biomarker');
  });

  it('returns empty array when file is not in tree', () => {
    provider.updateTree(mockTree);

    const doc = {
      uri: {
        scheme: 'file',
        fsPath: '/workspace/src/unknown.ts',
      },
      lineCount: 100,
    };

    const lenses = provider.provideCodeLenses(doc as any, {} as any);
    expect(lenses.length).toBe(0);
  });
});
