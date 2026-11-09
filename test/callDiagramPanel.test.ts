import { describe, it, expect, vi, beforeEach } from 'vitest';

const panels: any[] = [];
const executeCommand = vi.fn();

vi.mock('vscode', () => ({
  Uri: {
    file: vi.fn((p: string) => ({ fsPath: p })),
    joinPath: vi.fn((base: any, ...s: string[]) => ({ fsPath: [base.fsPath, ...s].join('/') })),
  },
  ViewColumn: { One: 1 },
  window: {
    activeTextEditor: undefined,
    createWebviewPanel: vi.fn((_type: string, title: string) => {
      const panel: any = {
        title,
        disposed: false,
        dispose: vi.fn(() => {
          panel.disposed = true;
          panel.onDisposeCb?.();
        }),
        onDidDispose: vi.fn((cb: () => void) => {
          panel.onDisposeCb = cb;
          return { dispose: vi.fn() };
        }),
        webview: {
          html: '',
          asWebviewUri: vi.fn((u: any) => u.fsPath),
          postMessage: vi.fn(),
          onDidReceiveMessage: vi.fn((cb: any) => {
            panel.onMessage = cb;
            return { dispose: vi.fn() };
          }),
        },
      };
      panels.push(panel);
      return panel;
    }),
  },
  commands: { executeCommand: (...a: any[]) => executeCommand(...a) },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn((_k: string, d: any) => d) })) },
  env: { language: 'en-US' },
}));

vi.mock('../src/utils/navigation', () => ({ openFileInEditor: vi.fn() }));

import { CallDiagramPanel } from '../src/panels/CallDiagramPanel';
import { buildCallDiagramData } from '../src/analyzer/calls/diagramData';
import { openFileInEditor } from '../src/utils/navigation';
import type { AnalysisSnapshot } from '../src/analyzer/types';

const node = (name: string, path: string, type: any, children: any[] = []): any => ({
  name, path, type, value: 1, loc: 1, commitCount: 0, churnScore: 0, fixCount: 0, featCount: 0,
  refactorCount: 0, linesAdded: 0, linesDeleted: 0, children,
});

const snapshot: AnalysisSnapshot = {
  id: '1', workspacePath: '/ws/shop', headCommitSha: '', totalFiles: 2, totalLoc: 2, durationMs: 0, scannedAt: '',
  tree: node('root', '/', 'folder', [
    node('cart', '/src/cart', 'folder', [node('cart.js', 'src/cart/cart.js', 'file')]),
    node('store', '/src/store', 'folder', [node('store.js', 'src/store/store.js', 'file')]),
  ]),
  hotspots: [{ filePath: 'src/cart/cart.js', name: 'cart.js', loc: 1, commitCount: 9, fixCount: 0, churnScore: 1, defectRatio: 0 }],
  callGraph: {
    functions: [
      { id: 'src/cart/cart.js#save', file: 'src/cart/cart.js', qualifiedName: 'save', startLine: 1, endLine: 3 },
      { id: 'src/store/store.js#persist', file: 'src/store/store.js', qualifiedName: 'persist', startLine: 1, endLine: 3 },
      { id: 'src/other/x.js#x', file: 'src/other/x.js', qualifiedName: 'x', startLine: 1, endLine: 2 },
    ],
    edges: [{ from: 'src/cart/cart.js#save', to: 'src/store/store.js#persist', confidence: 'certain', source: 'js' }],
    counts: {},
  },
};

describe('CallDiagramPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const p of [...CallDiagramPanel.instances]) p.dispose();
    panels.length = 0;
  });

  it('opens a separate tab per request, titled with its scope', () => {
    const a = CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', snapshot);
    const b = CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', 'src/cart/', snapshot);
    expect(CallDiagramPanel.instances.size).toBe(2);
    expect(a.title).toBe('Call Diagram: shop');
    expect(b.title).toBe('Call Diagram: src/cart');
    expect(panels[1].webview.html).toContain('__AUSPEX_SCOPE__ = "src/cart"');
  });

  it('keeps the other tab when one is closed and broadcasts snapshots to the rest', () => {
    const a = CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', snapshot);
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', 'src/cart', snapshot);
    panels[0].dispose();
    expect(CallDiagramPanel.instances.has(a)).toBe(false);
    expect(CallDiagramPanel.instances.size).toBe(1);

    CallDiagramPanel.broadcastSnapshot(snapshot);
    expect(panels[0].webview.postMessage).not.toHaveBeenCalled();
    expect(panels[1].webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'diagram:data' }));
  });

  it('sends data on ready, or requests a scan when there is no analysis', async () => {
    const onScanRequested = vi.fn();
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', null, { onScanRequested });
    await panels[0].onMessage({ type: 'ready' });
    expect(onScanRequested).toHaveBeenCalled();

    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', snapshot);
    await panels[1].onMessage({ type: 'ready' });
    expect(panels[1].webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'diagram:data' }));
  });

  it('forwards selection, opens files and opens nested diagrams', async () => {
    const onFunctionSelected = vi.fn();
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', snapshot, { onFunctionSelected });
    await panels[0].onMessage({ type: 'functionSelected', filePath: 'src/cart/cart.js', startLine: 1 });
    expect(onFunctionSelected).toHaveBeenCalledWith('src/cart/cart.js', 1);
    await panels[0].onMessage({ type: 'openFile', filePath: 'src/cart/cart.js', startLine: 1, endLine: 3 });
    expect(openFileInEditor).toHaveBeenCalledWith('/ws/shop', 'src/cart/cart.js', 1, 3);
    await panels[0].onMessage({ type: 'openCallDiagram', scopePath: 'src/store' });
    expect(executeCommand).toHaveBeenCalledWith('auspex.openCallDiagram', 'src/store');
  });
});

describe('buildCallDiagramData', () => {
  it('scopes the tree to the folder and keeps edges touching the scope', () => {
    const data = buildCallDiagramData(snapshot, 'src/cart');
    expect(data.tree?.name).toBe('cart');
    expect(data.callGraph.edges).toHaveLength(1);
    expect(data.callGraph.functions.map((f) => f.id).sort()).toEqual(['src/cart/cart.js#save', 'src/store/store.js#persist']);
    expect(data.hotspotFiles).toEqual(['src/cart/cart.js']);
  });

  it('returns the whole tree for the workspace scope and empty data without snapshot', () => {
    expect(buildCallDiagramData(snapshot, '').tree?.name).toBe('root');
    expect(buildCallDiagramData(null, '').tree).toBeNull();
  });
});
