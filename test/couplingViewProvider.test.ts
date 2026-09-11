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

import { AuspexCouplingViewProvider } from '../src/providers/CouplingViewProvider';
import { openFileInEditor } from '../src/utils/navigation';
import { openCommitDiffInEditor } from '../src/utils/gitDiff';

describe('AuspexCouplingViewProvider', () => {
  let extensionUri: any;
  let workspacePath: string;
  let provider: AuspexCouplingViewProvider;
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
    temporalCoupling: [
      {
        filePath: 'src/services/BillingService.ts',
        coChanges: 12,
        couplingDegree: 0.8,
        totalCommits: 14,
      },
      {
        filePath: 'src/models/User.ts',
        coChanges: 6,
        couplingDegree: 0.4,
        totalCommits: 10,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    extensionUri = { fsPath: '/ext/root' };
    workspacePath = '/test/workspace';
    provider = new AuspexCouplingViewProvider(extensionUri, workspacePath);
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

  it('handles ready message from webview with coupling view type', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    provider.setSelectedNode(mockNode, false);

    expect(messageHandler).toBeDefined();
    await messageHandler!({ type: 'ready' });

    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        view: 'coupling',
        node: mockNode,
      })
    );
  });

  it('delegates openFile message with startLine/endLine to openFileInEditor', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler!({
      type: 'openFile',
      filePath: 'src/services/BillingService.ts',
      startLine: 1,
      endLine: 50,
    });

    expect(openFileInEditor).toHaveBeenCalledWith(
      workspacePath,
      'src/services/BillingService.ts',
      1,
      50
    );
  });

  it('delegates openCommitDiff message to openCommitDiffInEditor', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler!({
      type: 'openCommitDiff',
      commitHash: 'commit123',
      filePath: 'src/services/BillingService.ts',
      baseCommitHash: 'commit000',
    });

    expect(openCommitDiffInEditor).toHaveBeenCalledWith(
      workspacePath,
      'commit123',
      'src/services/BillingService.ts',
      'commit000'
    );
  });

  it('handles clearSelection message from webview', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    provider.setSelectedNode(mockNode, false);

    await messageHandler!({ type: 'clearSelection' });

    expect(provider.selectedNode).toBeNull();
    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'node:set',
      payload: null,
    });
  });

  it('updates snapshot and sends message to webview', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const snapshot: AnalysisSnapshot = {
      id: 'snap1',
      workspacePath,
      headCommitSha: 'sha',
      durationMs: 100,
      scannedAt: '2026-09-11',
      totalFiles: 1,
      totalLoc: 300,
      tree: mockNode,
      hotspots: [],
      projectCouplings: [
        {
          fileA: 'src/services/AuthService.ts',
          fileB: 'src/services/BillingService.ts',
          coChanges: 12,
          degreeA: 0.8,
          degreeB: 0.85,
          symmetricDegree: 0.7,
        },
      ],
    };

    provider.updateSnapshot(snapshot);

    expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
      type: 'snapshot:update',
      payload: snapshot,
    });
  });
});
