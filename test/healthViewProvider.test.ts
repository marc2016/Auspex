import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TreeNode, AnalysisSnapshot } from '../src/analyzer/types';

vi.mock('vscode', () => {
  return {
    Uri: {
      file: vi.fn((filePath: string) => ({ fsPath: filePath })),
      joinPath: vi.fn((base: any, ...segments: string[]) => ({
        fsPath: [base.fsPath, ...segments].join('/'),
      })),
    },
    workspace: {
      openTextDocument: vi.fn(),
      getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, defVal: any) => defVal),
      })),
    },
    env: {
      language: 'en-US',
    },
    window: {
      showTextDocument: vi.fn(),
      showErrorMessage: vi.fn(),
    },
  };
});

vi.mock('../src/utils/navigation', () => ({
  openFileInEditor: vi.fn(),
}));

vi.mock('../src/utils/gitDiff', () => ({
  openCommitDiffInEditor: vi.fn(),
}));

import { AuspexHealthViewProvider } from '../src/providers/HealthViewProvider';
import { openFileInEditor } from '../src/utils/navigation';

describe('AuspexHealthViewProvider', () => {
  let extensionUri: any;
  let workspacePath: string;
  let provider: AuspexHealthViewProvider;
  let mockWebviewView: any;
  let messageHandler: ((msg: any) => Promise<void>) | null;

  const mockNode: TreeNode = {
    name: 'ComplexityManager.ts',
    path: 'src/managers/ComplexityManager.ts',
    type: 'file',
    value: 200,
    loc: 200,
    codeHealth: 5.5,
    biomarkers: [
      {
        type: 'brain_method',
        severity: 'high',
        functionName: 'handleLargeOperation',
        startLine: 25,
        endLine: 95,
        details: 'Brain method with high cyclomatic complexity and nesting',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    extensionUri = { fsPath: '/ext/root' };
    workspacePath = '/test/workspace';
    provider = new AuspexHealthViewProvider(extensionUri, workspacePath);
    messageHandler = null;

    mockWebviewView = {
      show: vi.fn(),
      webview: {
        options: {},
        html: '',
        asWebviewUri: vi.fn((uri: any) => `vscode-webview://${uri.fsPath}`),
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn((handler: any) => {
          messageHandler = handler;
        }),
      },
    };
  });

  it('resolves webview with scripts enabled and initial options', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(mockWebviewView.webview.options.enableScripts).toBe(true);
    expect(mockWebviewView.webview.html).toBeDefined();
  });

  it('updates selected node with code health and notifies webview', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    provider.setSelectedNode(mockNode, true);

    expect(provider.selectedNode).toBe(mockNode);
    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'node:set',
      payload: mockNode,
    });
    expect(mockWebviewView.show).toHaveBeenCalledWith(true);
  });

  it('handles ready message from webview with health view type', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    provider.setSelectedNode(mockNode, false);

    expect(messageHandler).toBeDefined();
    await messageHandler!({ type: 'ready' });

    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        view: 'health',
        node: mockNode,
      })
    );
  });

  it('delegates openFile message with startLine/endLine to openFileInEditor', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler!({
      type: 'openFile',
      filePath: 'src/managers/ComplexityManager.ts',
      startLine: 25,
      endLine: 95,
    });

    expect(openFileInEditor).toHaveBeenCalledWith(
      workspacePath,
      'src/managers/ComplexityManager.ts',
      25,
      95
    );
  });

  it('updates snapshot and sends message to webview', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const snapshot: AnalysisSnapshot = {
      timestamp: Date.now(),
      durationMs: 100,
      totalFiles: 1,
      totalLoc: 200,
      tree: mockNode,
      hotspots: [],
    };

    provider.updateSnapshot(snapshot);

    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'snapshot:update',
      payload: snapshot,
    });
  });
});
