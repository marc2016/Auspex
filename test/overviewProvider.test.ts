import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalysisSnapshot } from '../src/analyzer/types';

vi.mock('vscode', () => {
  return {
    Uri: {
      file: vi.fn((filePath: string) => ({ fsPath: filePath })),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defVal: any) => defVal),
      })),
    },
    env: {
      language: 'en-US',
    },
    window: {},
  };
});

import * as vscode from 'vscode';
import { AuspexOverviewProvider } from '../src/providers/OverviewProvider';

describe('AuspexOverviewProvider', () => {
  let onOpenTreemap: ReturnType<typeof vi.fn>;
  let onRescan: ReturnType<typeof vi.fn>;
  let onOpenHelp: ReturnType<typeof vi.fn>;
  let provider: AuspexOverviewProvider;
  let mockWebviewView: any;
  let messageHandler: ((msg: any) => Promise<void>) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    onOpenTreemap = vi.fn();
    onRescan = vi.fn().mockResolvedValue(undefined);
    onOpenHelp = vi.fn();
    provider = new AuspexOverviewProvider(onOpenTreemap, onRescan, onOpenHelp);
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
    expect(mockWebviewView.webview.html).toContain('Rescan');
  });

  it('renders German labels when VS Code language is de', () => {
    (vscode.env as any).language = 'de-DE';
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    expect(mockWebviewView.webview.html).toContain('Neu scannen');
    (vscode.env as any).language = 'en-US';
  });

  it('renders stats grid (LOC, files, commits, contributors, total health, hotspots) when updated with a snapshot', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const snapshot: AnalysisSnapshot = {
      id: 'test-snap',
      scannedAt: '2026-09-11',
      durationMs: 120,
      headCommitSha: 'abc1234',
      workspacePath: '/test/workspace',
      totalFiles: 42,
      totalLoc: 15420,
      hotspots: [
        {
          filePath: 'src/core.ts',
          name: 'core.ts',
          loc: 1200,
          defectRatio: 0.1,
          churnScore: 0.95,
          commitCount: 25,
          fixCount: 2,
        },
      ],
      tree: {
        name: 'root',
        path: '',
        type: 'folder',
        value: 15420,
        loc: 15420,
        commitCount: 88,
        churnScore: 0.4,
        fixCount: 5,
        featCount: 10,
        refactorCount: 3,
        linesAdded: 5000,
        linesDeleted: 1200,
        codeHealth: 9.4,
        contributors: [
          { name: 'Alice', commits: 50, linesAdded: 3000, linesDeleted: 800 },
          { name: 'Bob', commits: 38, linesAdded: 2000, linesDeleted: 400 },
        ],
        children: [],
      },
    };

    provider.updateSnapshot(snapshot);

    expect(mockWebviewView.webview.html).toContain('15,420'); // Total LOC
    expect(mockWebviewView.webview.html).toContain('42'); // Total Files
    expect(mockWebviewView.webview.html).toContain('88'); // Total Commits
    expect(mockWebviewView.webview.html).toContain('2'); // Contributors count
    expect(mockWebviewView.webview.html).toContain('9.4'); // Overall Health
    expect(mockWebviewView.webview.html).toContain('Healthy'); // Health status label
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

  it('renders scope selection controls when snapshot is present', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    const snapshot: AnalysisSnapshot = {
      id: 'test-snap',
      scannedAt: '2026-09-11',
      durationMs: 120,
      headCommitSha: 'abc1234',
      workspacePath: '/test/workspace',
      totalFiles: 10,
      totalLoc: 500,
      hotspots: [],
      tree: {
        name: 'root',
        path: '',
        type: 'folder',
        value: 500,
        loc: 500,
        commitCount: 10,
        churnScore: 0.2,
        fixCount: 1,
        codeHealth: 9.5,
        children: [],
      },
    };

    provider.updateSnapshot(snapshot);

    expect(mockWebviewView.webview.html).toContain('Analysis Scope');
    expect(mockWebviewView.webview.html).toContain('All');
    expect(mockWebviewView.webview.html).toContain('Worktree');
    expect(mockWebviewView.webview.html).toContain('Timeframe');
  });

  it('handles setScope message and calls onScopeChange', async () => {
    const onScopeChange = vi.fn().mockResolvedValue(undefined);
    const scopeProvider = new AuspexOverviewProvider(
      onOpenTreemap,
      onRescan,
      onOpenHelp,
      onScopeChange
    );
    scopeProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await messageHandler!({
      type: 'setScope',
      scope: { mode: 'worktree' },
    });

    expect(onScopeChange).toHaveBeenCalledWith({ mode: 'worktree' });
    expect(scopeProvider.currentScope.mode).toBe('worktree');
  });

  it('renders empty worktree state when in worktree mode with 0 files', () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    const snapshot: AnalysisSnapshot = {
      id: 'test-snap',
      scannedAt: '2026-09-11',
      durationMs: 120,
      headCommitSha: 'abc1234',
      workspacePath: '/test/workspace',
      totalFiles: 0,
      totalLoc: 0,
      hotspots: [],
      tree: {
        name: 'root',
        path: '',
        type: 'folder',
        value: 0,
        loc: 0,
        commitCount: 0,
        churnScore: 0,
        fixCount: 0,
        codeHealth: 10.0,
        children: [],
      },
    };

    provider.setScope({ mode: 'worktree' });
    provider.updateSnapshot(snapshot);

    expect(mockWebviewView.webview.html).toContain('No uncommitted worktree changes');
  });
});

