import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalysisSnapshot, PipelineProgress } from '../src/analyzer/types';

vi.mock('vscode', () => {
  const dummyDisposable = { dispose: vi.fn() };
  return {
    Uri: {
      file: vi.fn((filePath: string) => ({ fsPath: filePath })),
      joinPath: vi.fn((base: any, ...segments: string[]) => ({
        fsPath: [base.fsPath, ...segments].join('/'),
      })),
    },
    ViewColumn: { One: 1 },
    window: {
      activeTextEditor: undefined,
      createWebviewPanel: vi.fn(),
      showErrorMessage: vi.fn(),
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
  };
});

vi.mock('../src/utils/navigation', () => ({
  openFileInEditor: vi.fn(),
}));

import * as vscode from 'vscode';
import { TreemapPanel } from '../src/panels/TreemapPanel';
import { openFileInEditor } from '../src/utils/navigation';

describe('TreemapPanel', () => {
  let mockPanel: any;
  let messageCallback: ((msg: any) => Promise<void>) | null;
  let disposeCallback: (() => void) | null;
  const extensionUri = { fsPath: '/ext/root' } as any;
  const workspacePath = '/workspace';

  const mockSnapshot: AnalysisSnapshot = {
    timestamp: 12345678,
    workspacePath,
    totalFiles: 10,
    totalLoc: 500,
    hotspots: [],
    tree: { name: 'root', path: '', type: 'directory', value: 500, children: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    if (TreemapPanel.currentPanel) {
      TreemapPanel.currentPanel.dispose();
    }

    messageCallback = null;
    disposeCallback = null;

    mockPanel = {
      title: '',
      reveal: vi.fn(),
      dispose: vi.fn(),
      onDidDispose: vi.fn((cb) => {
        disposeCallback = cb;
      }),
      webview: {
        html: '',
        asWebviewUri: vi.fn((uri) => `vscode-webview://${uri.fsPath}`),
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn((cb) => {
          messageCallback = cb;
        }),
      },
    };

    (vscode.window.createWebviewPanel as any).mockReturnValue(mockPanel);
  });

  it('creates and initializes a new webview panel', () => {
    const panel = TreemapPanel.createOrShow(extensionUri, workspacePath, mockSnapshot);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      TreemapPanel.viewType,
      'Auspex Treemap',
      vscode.ViewColumn.One,
      expect.objectContaining({
        enableScripts: true,
        retainContextWhenHidden: true,
      })
    );
    expect(TreemapPanel.currentPanel).toBe(panel);
    expect(mockPanel.title).toBe('Auspex Treemap');
    expect(mockPanel.webview.html).toBeTruthy();
  });

  it('reveals existing panel and updates snapshot if already created', () => {
    TreemapPanel.createOrShow(extensionUri, workspacePath, null);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);

    TreemapPanel.createOrShow(extensionUri, workspacePath, mockSnapshot);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalled();
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      type: 'snapshot:update',
      payload: mockSnapshot,
    });
  });

  it('responds to ready message by sending current snapshot', async () => {
    TreemapPanel.createOrShow(extensionUri, workspacePath, mockSnapshot);
    expect(messageCallback).not.toBeNull();

    await messageCallback!({ type: 'ready' });
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      type: 'snapshot:update',
      payload: mockSnapshot,
    });
  });

  it('handles openFile message by calling openFileInEditor', async () => {
    TreemapPanel.createOrShow(extensionUri, workspacePath, mockSnapshot);
    expect(messageCallback).not.toBeNull();

    await messageCallback!({
      type: 'openFile',
      filePath: 'src/app.ts',
      startLine: 10,
      endLine: 20,
    });

    expect(openFileInEditor).toHaveBeenCalledWith(workspacePath, 'src/app.ts', 10, 20);
  });

  it('handles rescan message by invoking onRescanRequested callback', async () => {
    const onRescanRequested = vi.fn().mockResolvedValue(undefined);
    TreemapPanel.createOrShow(extensionUri, workspacePath, mockSnapshot, onRescanRequested);
    expect(messageCallback).not.toBeNull();

    await messageCallback!({ type: 'rescan' });
    expect(onRescanRequested).toHaveBeenCalledTimes(1);
  });

  it('handles nodeSelected message by invoking onNodeSelected callback', async () => {
    const onNodeSelected = vi.fn();
    const testNode = { name: 'file.ts', path: 'src/file.ts', type: 'file' as const, value: 10, loc: 10 };
    TreemapPanel.createOrShow(extensionUri, workspacePath, mockSnapshot, undefined, onNodeSelected);
    expect(messageCallback).not.toBeNull();

    await messageCallback!({ type: 'nodeSelected', node: testNode });
    expect(onNodeSelected).toHaveBeenCalledWith(testNode);
  });

  it('sends progress updates to webview', () => {
    const panel = TreemapPanel.createOrShow(extensionUri, workspacePath, mockSnapshot);
    const progress: PipelineProgress = {
      stage: 'ast',
      percentage: 50,
      message: 'Parsing AST...',
    };

    panel.sendProgress(progress);
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      type: 'progress:update',
      payload: progress,
    });
  });

  it('cleans up resources on dispose', () => {
    const panel = TreemapPanel.createOrShow(extensionUri, workspacePath, mockSnapshot);
    expect(TreemapPanel.currentPanel).toBe(panel);

    panel.dispose();
    expect(mockPanel.dispose).toHaveBeenCalled();
    expect(TreemapPanel.currentPanel).toBeUndefined();
  });
});
