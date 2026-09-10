import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  return {
    Uri: {
      file: vi.fn((filePath: string) => ({ fsPath: filePath })),
    },
    ViewColumn: { One: 1 },
    window: {
      activeTextEditor: undefined,
      createWebviewPanel: vi.fn(),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defVal: any) => defVal),
      })),
    },
    env: {
      language: 'en-US',
    },
  };
});

import * as vscode from 'vscode';
import { HelpPanel } from '../src/panels/HelpPanel';

describe('HelpPanel', () => {
  let mockPanel: any;
  let messageCallback: ((msg: any) => Promise<void>) | null;
  let disposeCallback: (() => void) | null;
  const extensionUri = { fsPath: '/ext/root' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    if (HelpPanel.currentPanel) {
      HelpPanel.currentPanel.dispose();
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
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn((cb) => {
          messageCallback = cb;
        }),
      },
    };

    (vscode.window.createWebviewPanel as any).mockReturnValue(mockPanel);
  });

  it('creates and renders the guide webview panel', () => {
    const onOpenTreemap = vi.fn();
    const panel = HelpPanel.createOrShow(extensionUri, onOpenTreemap);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      HelpPanel.viewType,
      'Auspex: Guide & Documentation',
      vscode.ViewColumn.One,
      expect.objectContaining({
        enableScripts: true,
        retainContextWhenHidden: true,
      })
    );
    expect(HelpPanel.currentPanel).toBe(panel);
    expect(mockPanel.title).toBe('Auspex: Guide & Documentation');
    expect(mockPanel.webview.html).toContain('What is Code Churn?');
    expect(mockPanel.webview.html).toContain('What is a Hotspot?');
    expect(mockPanel.webview.html).toContain('Understanding the Treemap');
  });

  it('renders German guide when language is de', () => {
    (vscode.env as any).language = 'de-DE';
    HelpPanel.createOrShow(extensionUri);
    expect(mockPanel.title).toBe('Auspex: Dokumentation & Erklärung');
    expect(mockPanel.webview.html).toContain('Was ist Code Churn?');
    expect(mockPanel.webview.html).toContain('Was ist ein Hotspot?');
  });

  it('reveals existing panel if already created', () => {
    HelpPanel.createOrShow(extensionUri);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);

    HelpPanel.createOrShow(extensionUri);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalled();
  });

  it('handles openTreemap message from the guide', async () => {
    const onOpenTreemap = vi.fn();
    HelpPanel.createOrShow(extensionUri, onOpenTreemap);
    expect(messageCallback).not.toBeNull();

    await messageCallback!({ type: 'openTreemap' });
    expect(onOpenTreemap).toHaveBeenCalledTimes(1);
  });

  it('cleans up resources on dispose', () => {
    const panel = HelpPanel.createOrShow(extensionUri);
    expect(HelpPanel.currentPanel).toBe(panel);

    panel.dispose();
    expect(mockPanel.dispose).toHaveBeenCalled();
    expect(HelpPanel.currentPanel).toBeUndefined();
  });
});
