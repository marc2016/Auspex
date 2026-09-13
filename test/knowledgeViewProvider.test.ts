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
      openExternal: vi.fn(),
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

import { AuspexKnowledgeViewProvider } from '../src/providers/KnowledgeViewProvider';
import { openFileInEditor } from '../src/utils/navigation';
import { openCommitDiffInEditor } from '../src/utils/gitDiff';

describe('AuspexKnowledgeViewProvider', () => {
  let extensionUri: any;
  let workspacePath: string;
  let provider: AuspexKnowledgeViewProvider;
  let mockWebviewView: any;
  let messageHandler: ((msg: any) => Promise<void>) | null;

  const mockNode: TreeNode = {
    name: 'AuthService.ts',
    path: 'src/services/AuthService.ts',
    type: 'file',
    value: 300,
    loc: 300,
    commitCount: 15,
    churnScore: 0.8,
    fixCount: 3,
    featCount: 5,
    refactorCount: 2,
    linesAdded: 400,
    linesDeleted: 100,
    primaryAuthor: 'Alice',
    primaryAuthorPercentage: 85,
    knowledgeRisk: 'high',
    contributors: [
      { name: 'Alice', commits: 13, linesAdded: 380, linesDeleted: 90, percentage: 86.7 },
      { name: 'Bob', commits: 2, linesAdded: 20, linesDeleted: 10, percentage: 13.3 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    extensionUri = { fsPath: '/ext/root' };
    workspacePath = '/test/workspace';
    provider = new AuspexKnowledgeViewProvider(extensionUri, workspacePath);
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

  it('resolves webview with scripts enabled and HTML containing knowledge marker', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(mockWebviewView.webview.options.enableScripts).toBe(true);
    expect(mockWebviewView.webview.html).toMatch(/Auspex (Monopolwissen|Knowledge Monopolies)/);
  });

  it('sends init message with view=knowledge and current node when webview posts ready', async () => {
    provider.setSelectedNode(mockNode, false);
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(messageHandler).toBeDefined();
    await messageHandler?.({ type: 'ready' });

    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        view: 'knowledge',
        node: mockNode,
      })
    );
  });

  it('updates selected node and notifies webview via node:set message', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    provider.setSelectedNode(mockNode, true);

    expect(provider.selectedNode).toBe(mockNode);
    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'node:set',
      payload: mockNode,
    });
    expect(mockWebviewView.show).toHaveBeenCalledWith(true);
  });

  it('updates snapshot and posts snapshot:update to webview', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const mockSnapshot: AnalysisSnapshot = {
      id: 'snap1',
      workspacePath: '/test/workspace',
      headCommitSha: 'sha123',
      totalFiles: 1,
      totalLoc: 300,
      durationMs: 50,
      scannedAt: '2026-09-13T10:00:00Z',
      tree: mockNode,
      hotspots: [],
      knowledgeSummary: {
        totalAuthors: 2,
        truckFactor: 1,
        monopolyFileCount: 1,
        monopolyPercentage: 100,
        topAuthors: [],
        highestRiskFiles: [],
      },
    };

    provider.updateSnapshot(mockSnapshot);

    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'snapshot:update',
      payload: mockSnapshot,
    });
  });

  it('handles openFile message by delegating to openFileInEditor', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler?.({
      type: 'openFile',
      filePath: 'src/services/AuthService.ts',
      startLine: 10,
      endLine: 50,
    });

    expect(openFileInEditor).toHaveBeenCalledWith(
      '/test/workspace',
      'src/services/AuthService.ts',
      10,
      50
    );
  });

  it('handles openCommitDiff message by delegating to openCommitDiffInEditor', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler?.({
      type: 'openCommitDiff',
      commitHash: 'sha-abc',
      filePath: 'src/services/AuthService.ts',
      baseCommitHash: 'sha-prev',
    });

    expect(openCommitDiffInEditor).toHaveBeenCalledWith(
      '/test/workspace',
      'sha-abc',
      'src/services/AuthService.ts',
      'sha-prev'
    );
  });

  it('handles clearSelection by resetting selectedNode and notifying webview', async () => {
    provider.setSelectedNode(mockNode, false);
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler?.({ type: 'clearSelection' });

    expect(provider.selectedNode).toBeNull();
    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'node:set',
      payload: null,
    });
  });
});
