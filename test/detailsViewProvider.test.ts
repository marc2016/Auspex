import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TreeNode } from '../src/analyzer/types';

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
        get: vi.fn((key: string, defVal: any) => defVal),
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

import * as vscode from 'vscode';
import { AuspexDetailsViewProvider } from '../src/providers/DetailsViewProvider';
import { openFileInEditor } from '../src/utils/navigation';
import { openCommitDiffInEditor } from '../src/utils/gitDiff';

describe('AuspexDetailsViewProvider', () => {
  let extensionUri: any;
  let workspacePath: string;
  let provider: AuspexDetailsViewProvider;
  let mockWebviewView: any;
  let messageHandler: ((msg: any) => Promise<void>) | null;

  const mockNode: TreeNode = {
    name: 'UserService.ts',
    path: 'src/services/UserService.ts',
    type: 'file',
    value: 120,
    loc: 120,
    commitCount: 5,
    commits: [
      {
        hash: 'abc1234567890',
        message: 'fix: auth check',
        author: 'Alice',
        timestamp: 1600000000000,
        linesAdded: 10,
        linesDeleted: 2,
        isFix: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    extensionUri = { fsPath: '/ext/root' };
    workspacePath = '/test/workspace';
    provider = new AuspexDetailsViewProvider(extensionUri, workspacePath);
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

  it('updates selected node and notifies webview', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    provider.setSelectedNode(mockNode, true);

    expect(provider.selectedNode).toBe(mockNode);
    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'node:set',
      payload: mockNode,
    });
    expect(mockWebviewView.show).toHaveBeenCalledWith(true);
  });

  it('responds to ready message with details initialization', async () => {
    provider.setSelectedNode(mockNode, false);
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(messageHandler).not.toBeNull();
    await messageHandler!({ type: 'ready' });

    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'init',
      view: 'details',
      language: 'en',
      node: mockNode,
    });
  });

  it('handles openFile message', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler!({
      type: 'openFile',
      filePath: 'src/services/UserService.ts',
      startLine: 10,
      endLine: 25,
    });

    expect(openFileInEditor).toHaveBeenCalledWith(
      workspacePath,
      'src/services/UserService.ts',
      10,
      25
    );
  });

  it('handles openCommitDiff message', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler!({
      type: 'openCommitDiff',
      commitHash: 'targetHash123',
      filePath: 'src/services/UserService.ts',
      baseCommitHash: 'baseHash456',
    });

    expect(openCommitDiffInEditor).toHaveBeenCalledWith(
      workspacePath,
      'targetHash123',
      'src/services/UserService.ts',
      'baseHash456'
    );
  });

  it('handles clearSelection message', async () => {
    provider.setSelectedNode(mockNode, false);
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler!({ type: 'clearSelection' });

    expect(provider.selectedNode).toBeNull();
    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'node:set',
      payload: null,
    });
  });
});
