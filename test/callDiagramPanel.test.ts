import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('CallDiagramPanel focus', () => {
  beforeEach(() => {
    for (const p of [...CallDiagramPanel.instances]) p.dispose();
    panels.length = 0;
  });

  it('opens a focused tab titled with the function and sends focus and workspace data on ready', async () => {
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', 'src/cart', snapshot, {}, { fnId: 'src/cart/cart.js#save', label: 'save' });
    expect(panels[0].title).toBe('Call Diagram: save');
    await panels[0].onMessage({ type: 'ready' });
    const types = panels[0].webview.postMessage.mock.calls.map((c: any[]) => c[0].type);
    expect(types).toEqual(['language:set', 'diagram:data', 'diagram:focusData', 'diagram:focus']);
    const focusData = panels[0].webview.postMessage.mock.calls.find((c: any[]) => c[0].type === 'diagram:focusData')[0].payload;
    // workspace-wide: contains functions outside the tab's folder scope
    expect(focusData.callGraph.functions.map((f: any) => f.id)).toContain('src/other/x.js#x');
  });

  it('sends workspace data only for focused tabs, also on snapshot updates', async () => {
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', 'src/cart', snapshot);
    await panels[0].onMessage({ type: 'ready' });
    CallDiagramPanel.broadcastSnapshot(snapshot);
    let types = panels[0].webview.postMessage.mock.calls.map((c: any[]) => c[0].type);
    expect(types).not.toContain('diagram:focusData');

    await panels[0].onMessage({ type: 'requestFocusData' });
    CallDiagramPanel.broadcastSnapshot(snapshot);
    types = panels[0].webview.postMessage.mock.calls.map((c: any[]) => c[0].type);
    expect(types.filter((t: string) => t === 'diagram:focusData')).toHaveLength(2);

    await panels[0].onMessage({ type: 'focusClosed' });
    panels[0].webview.postMessage.mockClear();
    CallDiagramPanel.broadcastSnapshot(snapshot);
    expect(panels[0].webview.postMessage.mock.calls.map((c: any[]) => c[0].type)).toEqual(['diagram:data']);
  });

  it('opens a focused diagram for a focus request from the webview', async () => {
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', snapshot);
    await panels[0].onMessage({ type: 'openCallDiagram', focus: { file: 'src/cart/cart.js', startLine: 1 } });
    expect(executeCommand).toHaveBeenCalledWith('auspex.openCallDiagram', { focus: { file: 'src/cart/cart.js', startLine: 1 } });
  });
});

describe('CallDiagramPanel live mode and pin', () => {
  const cf = (fnId: string | undefined, qualifiedName = 'persist') => ({ file: 'src/store/store.js', qualifiedName, fnId, startLine: 1, endLine: 3 });
  const sent = (i: number) => panels[i].webview.postMessage.mock.calls.map((c: any[]) => c[0]);

  beforeEach(() => {
    vi.useFakeTimers();
    CallDiagramPanel.broadcastLive(false);
    for (const p of [...CallDiagramPanel.instances]) p.dispose();
    panels.length = 0;
  });

  afterEach(() => vi.useRealTimers());

  async function openFocused() {
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', snapshot, {}, { fnId: 'src/cart/cart.js#save', label: 'save' });
    const i = panels.length - 1;
    await panels[i].onMessage({ type: 'ready' });
    panels[i].webview.postMessage.mockClear();
    return i;
  }

  it('re-focuses an unpinned focus tab after the debounce, keeping depths', async () => {
    const i = await openFocused();
    CallDiagramPanel.broadcastCurrentFunction(cf('src/cart/cart.js#save', 'save'));
    CallDiagramPanel.broadcastCurrentFunction(cf('src/store/store.js#persist'));
    expect(sent(i).map((m: any) => m.type)).toEqual(['diagram:cursor', 'diagram:cursor']);
    vi.advanceTimersByTime(400);
    expect(sent(i).filter((m: any) => m.type === 'diagram:focus')).toEqual([
      { type: 'diagram:focus', payload: { fnId: 'src/store/store.js#persist', label: 'persist', keepDepths: true } },
    ]);
  });

  it('only marks the function in scope tabs and pinned focus tabs', async () => {
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', snapshot);
    await panels[0].onMessage({ type: 'ready' });
    panels[0].webview.postMessage.mockClear();
    const i = await openFocused();
    await panels[i].onMessage({ type: 'setPinned', pinned: true });

    CallDiagramPanel.broadcastCurrentFunction(cf('src/store/store.js#persist'));
    vi.advanceTimersByTime(1000);
    for (const p of [0, i]) {
      expect(sent(p)).toEqual([{ type: 'diagram:cursor', payload: { fnId: 'src/store/store.js#persist', label: 'persist' } }]);
    }
  });

  it('does not re-focus on a function without call data', async () => {
    const i = await openFocused();
    CallDiagramPanel.broadcastCurrentFunction(cf(undefined, 'clear'));
    vi.advanceTimersByTime(1000);
    expect(sent(i)).toEqual([{ type: 'diagram:cursor', payload: { fnId: null, label: 'clear' } }]);
  });

  it('re-focuses on unpin while live, and "Focus here" keeps the pin', async () => {
    const i = await openFocused();
    await panels[i].onMessage({ type: 'setPinned', pinned: true });
    CallDiagramPanel.broadcastCurrentFunction(cf('src/store/store.js#persist'));
    await panels[i].onMessage({ type: 'focusHere' });
    const inst = [...CallDiagramPanel.instances].pop()!;
    expect(inst.pinned).toBe(true);
    expect(sent(i).filter((m: any) => m.type === 'diagram:focus')).toHaveLength(1);

    await panels[i].onMessage({ type: 'setPinned', pinned: false });
    expect(inst.pinned).toBe(false);
    expect(sent(i).filter((m: any) => m.type === 'diagram:focus')).toHaveLength(2);
  });

  it('sends the marker to new tabs and clears markers when live mode is switched off', async () => {
    CallDiagramPanel.broadcastCurrentFunction(cf('src/store/store.js#persist'));
    CallDiagramPanel.open({ fsPath: '/ext' } as any, '/ws/shop', '', snapshot);
    await panels[0].onMessage({ type: 'ready' });
    expect(sent(0)).toContainEqual({ type: 'diagram:cursor', payload: { fnId: 'src/store/store.js#persist', label: 'persist' } });
    CallDiagramPanel.broadcastLive(false);
    expect(sent(0).pop()).toEqual({ type: 'diagram:cursor', payload: { fnId: null, label: null } });
  });
});
