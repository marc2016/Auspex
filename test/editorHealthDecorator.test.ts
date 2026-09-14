import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TreeNode } from '../src/analyzer/types';

vi.mock('vscode', () => {
  const decorations = new Map<any, any[]>();
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
          if (key === 'editorGutter.enabled') return true;
          if (key === 'editorGutter.showHealthy') return true;
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
              name: 'complexMethod',
              path: 'src/service.ts#complexMethod',
              type: 'method',
              value: 50,
              loc: 50,
              startLine: 35,
              endLine: 85,
              commitCount: 1,
              churnScore: 0,
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
              codeHealth: 5.2,
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

  it('sets decorations for healthy and critical methods', () => {
    decorator.updateTree(mockTree);
    decorator.updateEditor(mockEditor);

    expect(mockEditor.setDecorations).toHaveBeenCalledTimes(3);

    // Call 1: healthy decorations
    const healthyCall = mockEditor.setDecorations.mock.calls[0];
    expect(healthyCall[1].length).toBe(1);
    expect(healthyCall[1][0].range.start.line).toBe(9); // line 10 - 1

    // Call 2: warning decorations (empty in this case)
    const warningCall = mockEditor.setDecorations.mock.calls[1];
    expect(warningCall[1].length).toBe(0);

    // Call 3: critical decorations (complexMethod < 6.0)
    const criticalCall = mockEditor.setDecorations.mock.calls[2];
    expect(criticalCall[1].length).toBe(1);
    expect(criticalCall[1][0].range.start.line).toBe(34); // line 35 - 1
    expect(criticalCall[1][0].hoverMessage.value).toContain('complexMethod');
    expect(criticalCall[1][0].hoverMessage.value).toContain('5.2 / 10.0');
    expect(criticalCall[1][0].hoverMessage.value).toContain('Brain Method');
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

  it('disposes all decoration types on dispose()', () => {
    expect(() => decorator.dispose()).not.toThrow();
  });
});
