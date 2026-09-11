import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalysisSnapshot } from '../src/analyzer/types';

vi.mock('vscode', () => {
  return {
    Uri: {
      file: vi.fn((filePath: string) => ({ fsPath: filePath })),
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
    Range: vi.fn().mockImplementation((start, end) => ({ start, end })),
    Position: vi.fn().mockImplementation((line, character) => ({ line, character })),
  };
});

vi.mock('../src/utils/navigation', () => ({
  openFileInEditor: vi.fn(),
}));

import * as vscode from 'vscode';
import { AuspexSidebarProvider } from '../src/providers/SidebarProvider';
import { openFileInEditor } from '../src/utils/navigation';

describe('AuspexSidebarProvider', () => {
  let workspacePath: string;
  let onOpenTreemap: ReturnType<typeof vi.fn>;
  let onRescan: ReturnType<typeof vi.fn>;
  let onOpenHelp: ReturnType<typeof vi.fn>;
  let provider: AuspexSidebarProvider;
  let mockWebviewView: any;
  let messageHandler: ((msg: any) => Promise<void>) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    workspacePath = '/test/workspace';
    onOpenTreemap = vi.fn();
    onRescan = vi.fn().mockResolvedValue(undefined);
    onOpenHelp = vi.fn();
    provider = new AuspexSidebarProvider(workspacePath, onOpenTreemap, onRescan, onOpenHelp);
    messageHandler = null;

    mockWebviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: vi.fn((handler: any) => {
          messageHandler = handler;
        }),
      },
    };
  });

  it('renders initial HTML with empty placeholder when no snapshot exists', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(mockWebviewView.webview.options.enableScripts).toBe(true);
    expect(mockWebviewView.webview.html).toContain('No analysis data yet');
    expect(mockWebviewView.webview.html).toContain('Open Hotspot Treemap');
    expect(mockWebviewView.webview.html).toContain('Rescan');
    expect(mockWebviewView.webview.html).toContain('Help & Documentation');
  });

  it('renders German labels when VS Code language is de', () => {
    (vscode.env as any).language = 'de-DE';
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    expect(mockWebviewView.webview.html).toContain('Hotspot-Treemap öffnen');
    expect(mockWebviewView.webview.html).toContain('Neu scannen');
    expect(mockWebviewView.webview.html).toContain('Hilfe & Dokumentation');
    (vscode.env as any).language = 'en-US';
  });

  it('renders hotspots list when updated with a snapshot', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const snapshot: AnalysisSnapshot = {
      timestamp: Date.now(),
      workspacePath: '/test/workspace',
      totalFiles: 42,
      totalLoc: 15420,
      hotspots: [
        {
          filePath: 'src/core.ts',
          name: 'core.ts',
          loc: 1200,
          complexity: 85,
          churnScore: 0.95,
          commitCount: 25,
          hotspotScore: 1140,
        },
      ],
      tree: {
        name: 'root',
        path: '',
        type: 'directory',
        value: 15420,
        children: [],
      },
    };

    provider.updateSnapshot(snapshot);

    expect(mockWebviewView.webview.html).toContain('Hotspots (1)');
    expect(mockWebviewView.webview.html).toContain('core.ts');
    expect(mockWebviewView.webview.html).toContain('95% churn');
    expect(mockWebviewView.webview.html).toContain('25 commits');
  });

  it('renders compact unified header when a node is selected', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    provider.setSelectedNode({
      name: 'core.ts',
      path: 'src/core.ts',
      type: 'file',
      loc: 1200,
      commitCount: 25,
      churnScore: 0.95,
      fixCount: 3,
      linesAdded: 50,
      linesDeleted: 10,
    });

    expect(mockWebviewView.webview.html).toContain('core.ts');
    expect(mockWebviewView.webview.html).toContain('src/core.ts');
    expect(mockWebviewView.webview.html).toContain('file-indicator');
    expect(mockWebviewView.webview.html).toContain('3 Bugfixes');
  });

  it('renders all hotspots without truncating to 5', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const hotspots = Array.from({ length: 8 }, (_, i) => ({
      filePath: `src/file${i}.ts`,
      name: `file${i}.ts`,
      loc: 100 * (i + 1),
      complexity: 10 * (i + 1),
      churnScore: 0.5,
      commitCount: i + 1,
      hotspotScore: 50 * (i + 1),
    }));

    provider.updateSnapshot({
      timestamp: Date.now(),
      workspacePath: '/test/workspace',
      totalFiles: 8,
      totalLoc: 3600,
      hotspots,
      tree: { name: 'root', path: '', type: 'directory', value: 3600, children: [] },
    });

    expect(mockWebviewView.webview.html).toContain('Hotspots (8)');
    for (let i = 0; i < 8; i++) {
      expect(mockWebviewView.webview.html).toContain(`file${i}.ts`);
    }
  });

  it('handles openTreemap message from webview', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    expect(messageHandler).not.toBeNull();

    await messageHandler!({ type: 'openTreemap' });
    expect(onOpenTreemap).toHaveBeenCalledTimes(1);
  });

  it('handles rescan message from webview', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    expect(messageHandler).not.toBeNull();

    await messageHandler!({ type: 'rescan' });
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it('handles openHelp message from webview', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    expect(messageHandler).not.toBeNull();

    await messageHandler!({ type: 'openHelp' });
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('handles openFile message and calls openFileInEditor', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    expect(messageHandler).not.toBeNull();

    await messageHandler!({ type: 'openFile', filePath: 'src/main.ts' });
    expect(openFileInEditor).toHaveBeenCalledWith(workspacePath, 'src/main.ts');
  });
});
