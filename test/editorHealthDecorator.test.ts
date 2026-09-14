import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TreeNode } from '../src/analyzer/types';

let mockConfigValues: Record<string, any> = {
  'editorGutter.enabled': true,
  'editorGutter.showHealthy': true,
};

vi.mock('vscode', () => {
  return {
    Uri: {
      file: vi.fn((filePath: string) => ({ fsPath: filePath, scheme: 'file' })),
      joinPath: vi.fn((base: any, ...segments: string[]) => ({
        fsPath: [base.fsPath, ...segments].join('/'),
      })),
    },
    Range: vi.fn().mockImplementation((startLine, startChar, endLine, endChar) => ({
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    })),
    MarkdownString: vi.fn().mockImplementation(function (this: any) {
      this.value = '';
      this.isTrusted = false;
      this.appendMarkdown = vi.fn((str: string) => {
        this.value += str;
      });
    }),
    workspace: {
      getConfiguration: vi.fn((section: string) => ({
        get: vi.fn((key: string, defVal: any) => {
          if (mockConfigValues[key] !== undefined) {
            return mockConfigValues[key];
          }
          return defVal;
        }),
      })),
    },
    window: {
      visibleTextEditors: [],
      createTextEditorDecorationType: vi.fn((options: any) => {
        const id = Symbol('DecorationType');
        return {
          id,
          options,
          dispose: vi.fn(),
        };
      }),
    },
    env: {
      language: 'de-DE',
    },
  };
});

import * as vscode from 'vscode';
import { EditorHealthDecorator } from '../src/editor/EditorHealthDecorator';

describe('EditorHealthDecorator', () => {
  let decorator: EditorHealthDecorator;
  let mockEditor: any;
  let mockTree: TreeNode;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigValues = {
      'editorGutter.enabled': true,
      'editorGutter.showHealthy': true,
    };

    decorator = new EditorHealthDecorator(
      { fsPath: '/extension' } as any,
      '/workspace'
    );

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
          name: 'service.ts',
          path: 'src/service.ts',
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
          codeHealth: 6.5,
          biomarkers: [
            {
              type: 'brain_class',
              severity: 'high',
              startLine: 1,
              details: 'God Object smell',
            },
          ],
          children: [
            {
              name: 'cleanMethod',
              path: 'src/service.ts#cleanMethod',
              type: 'method',
              value: 20,
              loc: 20,
              startLine: 10,
              endLine: 30,
              commitCount: 1,
              churnScore: 0,
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
              codeHealth: 9.8,
              biomarkers: [],
            },
            {
              name: 'warningMethod',
              path: 'src/service.ts#warningMethod',
              type: 'method',
              value: 30,
              loc: 30,
              startLine: 32,
              endLine: 50,
              commitCount: 1,
              churnScore: 0,
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
              codeHealth: 7.5,
              biomarkers: [
                {
                  type: 'bumpy_road',
                  severity: 'medium',
                  details: 'Multiple nested conditions',
                },
              ],
            },
            {
              name: 'criticalMethod',
              path: 'src/service.ts#criticalMethod',
              type: 'method',
              value: 50,
              loc: 50,
              startLine: 55,
              endLine: 95,
              commitCount: 1,
              churnScore: 0,
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
              codeHealth: 4.8,
              biomarkers: [
                {
                  type: 'brain_method',
                  severity: 'high',
                  details: 'Hohe Komplexität',
                },
              ],
            },
          ],
        },
      ],
    };

    mockEditor = {
      document: {
        uri: {
          scheme: 'file',
          fsPath: '/workspace/src/service.ts',
        },
        lineCount: 100,
      },
      setDecorations: vi.fn(),
    };
  });

  it('sets decorations for healthy, warning, and critical methods', () => {
    decorator.updateTree(mockTree);
    decorator.updateEditor(mockEditor);

    expect(mockEditor.setDecorations).toHaveBeenCalledTimes(3);

    // Healthy decoration (cleanMethod: 9.8)
    const healthyCall = mockEditor.setDecorations.mock.calls[0];
    expect(healthyCall[1].length).toBe(1);
    expect(healthyCall[1][0].range.start.line).toBe(9); // line 10 - 1
    expect(healthyCall[1][0].hoverMessage.value).toContain('cleanMethod');
    expect(healthyCall[1][0].hoverMessage.value).toContain('9.8 / 10.0');

    // Warning decoration (warningMethod: 7.5)
    const warningCall = mockEditor.setDecorations.mock.calls[1];
    expect(warningCall[1].length).toBe(1);
    expect(warningCall[1][0].range.start.line).toBe(31); // line 32 - 1
    expect(warningCall[1][0].hoverMessage.value).toContain('warningMethod');
    expect(warningCall[1][0].hoverMessage.value).toContain('7.5 / 10.0');
    expect(warningCall[1][0].hoverMessage.value).toContain('Bumpy Road');

    // Critical decoration (criticalMethod: 4.8 + file-level brain_class at line 1)
    const criticalCall = mockEditor.setDecorations.mock.calls[2];
    expect(criticalCall[1].length).toBe(2);
    expect(criticalCall[1].some((d: any) => d.range.start.line === 54)).toBe(true);
    expect(criticalCall[1].some((d: any) => d.range.start.line === 0)).toBe(true); // line 1 - 1
  });

  it('omits healthy decorations when showHealthy is false', () => {
    mockConfigValues['editorGutter.showHealthy'] = false;

    decorator.updateTree(mockTree);
    decorator.updateEditor(mockEditor);

    const healthyCall = mockEditor.setDecorations.mock.calls[0];
    expect(healthyCall[1]).toHaveLength(0); // healthy omitted

    const warningCall = mockEditor.setDecorations.mock.calls[1];
    expect(warningCall[1].length).toBeGreaterThan(0); // warning still shown
  });

  it('clears all decorations when editorGutter.enabled is false', () => {
    mockConfigValues['editorGutter.enabled'] = false;

    decorator.updateTree(mockTree);
    decorator.updateEditor(mockEditor);

    expect(mockEditor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('automatically updates all visible editors on updateTree()', () => {
    (vscode.window as any).visibleTextEditors = [mockEditor];

    decorator.updateTree(mockTree);

    expect(mockEditor.setDecorations).toHaveBeenCalled();
    (vscode.window as any).visibleTextEditors = [];
  });

  it('clears decorations when editor is not a file scheme or not in tree', () => {
    const unknownEditor = {
      document: {
        uri: { scheme: 'file', fsPath: '/workspace/unknown.ts' },
        lineCount: 50,
      },
      setDecorations: vi.fn(),
    };

    decorator.updateTree(mockTree);
    decorator.updateEditor(unknownEditor as any);

    expect(unknownEditor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('ignores non-file schemes like output or git', () => {
    const gitEditor = {
      document: {
        uri: { scheme: 'git', fsPath: '/workspace/src/service.ts' },
        lineCount: 100,
      },
      setDecorations: vi.fn(),
    };

    decorator.updateTree(mockTree);
    decorator.updateEditor(gitEditor as any);

    expect(gitEditor.setDecorations).not.toHaveBeenCalled();
  });

  it('disposes all decoration types on dispose()', () => {
    expect(() => decorator.dispose()).not.toThrow();
  });
});
