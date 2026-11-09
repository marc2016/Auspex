import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeCommand = vi.fn();

vi.mock('vscode', () => ({
  commands: { executeCommand: (...a: any[]) => executeCommand(...a) },
  Uri: {
    file: vi.fn((p: string) => ({ fsPath: p })),
    joinPath: vi.fn((base: any, ...segments: string[]) => ({ fsPath: [base.fsPath, ...segments].join('/') })),
  },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn((_k: string, d: any) => d) })) },
  env: { language: 'en-US' },
}));

vi.mock('../src/utils/navigation', () => ({ openFileInEditor: vi.fn() }));

import { AuspexCallsViewProvider } from '../src/providers/CallsViewProvider';
import { CallGraphService } from '../src/analyzer/calls/callGraphService';
import { CallGraphBuilder } from '../src/analyzer/calls/callGraphBuilder';
import { TreeAggregator } from '../src/analyzer/treeAggregator';
import { openFileInEditor } from '../src/utils/navigation';
import { parseJsWithCalls } from './calls/helpers';
import type { AnalysisSnapshot, TreeNode } from '../src/analyzer/types';

const files = [
  parseJsWithCalls('src/cart.js', [
    'function Cart() {',
    '  this.add = function () {',
    '    this.validate();',
    '  };',
    '  this.validate = function () {',
    '    return true;',
    '  };',
    '}',
  ]),
  parseJsWithCalls('src/order.js', ['function submit(cart) {', '  cart.add();', '}']),
];

function makeSnapshot(): AnalysisSnapshot {
  const { tree, hotspots } = new TreeAggregator().buildTree(files, new Map());
  return {
    id: '1', workspacePath: '/ws', headCommitSha: '', totalFiles: 2, totalLoc: 0, durationMs: 0, scannedAt: '',
    tree, hotspots, callGraph: new CallGraphBuilder().build(files),
  };
}

function findMethod(root: TreeNode, name: string): TreeNode {
  let found: TreeNode | null = null;
  const walk = (n: TreeNode) => {
    if (n.type === 'method' && n.name === name) found = n;
    n.children?.forEach(walk);
  };
  walk(root);
  if (!found) throw new Error(`method ${name} not found`);
  return found;
}

describe('AuspexCallsViewProvider', () => {
  let service: CallGraphService;
  let snapshot: AnalysisSnapshot;
  let posted: any[];
  let queryDetailed: ReturnType<typeof vi.fn>;
  let mode: 'onDemand' | 'background' | 'off';
  let provider: AuspexCallsViewProvider;
  const startScan = vi.fn();

  const lastState = () => [...posted].reverse().find((m) => m.type === 'calls:update')?.payload;

  beforeEach(() => {
    vi.clearAllMocks();
    snapshot = makeSnapshot();
    service = new CallGraphService();
    service.setBaseGraph(snapshot.callGraph);
    posted = [];
    mode = 'onDemand';
    queryDetailed = vi.fn().mockResolvedValue({ available: true, edges: [] });
    provider = new AuspexCallsViewProvider({ fsPath: '/ext' } as any, '/ws', {
      service,
      getMode: () => mode,
      createLsp: () => ({ queryDetailed }),
      startScan,
    });
    const view: any = {
      webview: { options: {}, html: '', postMessage: (m: any) => posted.push(m), onDidReceiveMessage: vi.fn(), asWebviewUri: (u: any) => u },
      show: vi.fn(),
    };
    provider.resolveWebviewView(view, {} as any, {} as any);
  });

  it('sends init with the calls view on ready', async () => {
    await provider.handleMessage({ type: 'ready' });
    expect(posted[0]).toMatchObject({ type: 'init', view: 'calls' });
    expect(lastState().status).toBe('noScan');
  });

  it('shows callers and callees of a selected function with metrics', async () => {
    provider.updateSnapshot(snapshot);
    provider.setSelectedNode(findMethod(snapshot.tree, 'add()'));
    await Promise.resolve();
    const state = lastState();
    expect(state.status).toBe('ready');
    expect(state.subject).toMatchObject({ id: 'src/cart.js#Cart.add', label: 'Cart.add' });
    expect(state.outgoing.map((e: any) => [e.id, e.confidence])).toEqual([['src/cart.js#Cart.validate', 'certain']]);
    expect(state.incoming.map((e: any) => [e.id, e.confidence])).toEqual([['src/order.js#submit', 'inferred']]);
    expect(state.incoming[0].codeHealth).toBeDefined();
  });

  it('asks for a function when a non-function is selected', () => {
    provider.updateSnapshot(snapshot);
    provider.setSelectedNode({ ...snapshot.tree, type: 'folder' } as TreeNode);
    expect(lastState().status).toBe('notFunction');
  });

  it('answers expand requests with children of an entry', async () => {
    provider.updateSnapshot(snapshot);
    await provider.handleMessage({ type: 'calls:expand', requestId: 7, id: 'src/cart.js#Cart.validate', direction: 'incoming' });
    const reply = posted.find((m) => m.type === 'calls:children');
    expect(reply.payload).toMatchObject({ requestId: 7, direction: 'incoming' });
    expect(reply.payload.items.map((e: any) => e.id)).toEqual(['src/cart.js#Cart.add']);
  });

  it('opens files and starts scans', async () => {
    await provider.handleMessage({ type: 'openFile', filePath: 'src/order.js', startLine: 1, endLine: 3 });
    expect(openFileInEditor).toHaveBeenCalledWith('/ws', 'src/order.js', 1, 3);
    await provider.handleMessage({ type: 'startScan' });
    expect(startScan).toHaveBeenCalled();
  });

  it('merges language server results for the subject', async () => {
    queryDetailed.mockResolvedValue({
      available: true,
      edges: [{ from: 'src/order.js#submit', to: 'src/cart.js#Cart.add', confidence: 'certain', source: 'js' }],
    });
    provider.updateSnapshot(snapshot);
    provider.setSelectedNode(findMethod(snapshot.tree, 'add()'));
    expect(lastState().lspLoading).toBe(true);
    await vi.waitFor(() => expect(lastState().lspLoading).toBe(false));
    expect(lastState().incoming[0]).toMatchObject({ id: 'src/order.js#submit', confidence: 'certain' });
    expect(lastState().nameOnly).toBe(false);
  });

  it('keeps Auspex edges visible and marks name-only when the language server fails', async () => {
    queryDetailed.mockRejectedValue(new Error('down'));
    provider.updateSnapshot(snapshot);
    provider.setSelectedNode(findMethod(snapshot.tree, 'add()'));
    await vi.waitFor(() => expect(lastState().lspLoading).toBe(false));
    expect(lastState().outgoing).toHaveLength(1);
    expect(lastState().nameOnly).toBe(true);
  });

  it('opens a focused call diagram for the subject', async () => {
    await provider.handleMessage({ type: 'openCallDiagram', focus: { file: 'src/cart.js', startLine: 2 } });
    expect(executeCommand).toHaveBeenCalledWith('auspex.openCallDiagram', { focus: { file: 'src/cart.js', startLine: 2 } });
  });

  it('does not query the language server when it is turned off', () => {
    mode = 'off';
    provider.updateSnapshot(snapshot);
    provider.setSelectedNode(findMethod(snapshot.tree, 'add()'));
    expect(queryDetailed).not.toHaveBeenCalled();
    expect(lastState().nameOnly).toBe(true);
  });
  describe('live mode and pin', () => {
    const cf = (qualifiedName: string, fnId?: string) => ({ file: 'src/cart.js', qualifiedName, fnId, startLine: 2, endLine: 4 });

    it('follows the function at the cursor', () => {
      provider.updateSnapshot(snapshot);
      provider.setCurrentFunction(cf('Cart.add', 'src/cart.js#Cart.add'));
      expect(lastState()).toMatchObject({ status: 'ready', live: true, currentFnId: 'src/cart.js#Cart.add' });
      expect(lastState().subject.id).toBe('src/cart.js#Cart.add');
      expect(queryDetailed).toHaveBeenCalledTimes(1);
    });

    it('shows a not-analyzed state for a function without call data', () => {
      provider.updateSnapshot(snapshot);
      provider.setCurrentFunction(cf('Cart.clear'));
      expect(lastState()).toMatchObject({ status: 'notAnalyzed', pendingLabel: 'Cart.clear' });
    });

    it('lets the latest of cursor and explicit selection win', () => {
      provider.updateSnapshot(snapshot);
      provider.setCurrentFunction(cf('Cart.add', 'src/cart.js#Cart.add'));
      provider.setSelectedNode(findMethod(snapshot.tree, 'validate()'), false);
      expect(lastState().subject.id).toBe('src/cart.js#Cart.validate');
      provider.setCurrentFunction(cf('submit', 'src/order.js#submit'));
      expect(lastState().subject.id).toBe('src/order.js#submit');
    });

    it('keeps the pinned subject and marks the current function', async () => {
      provider.updateSnapshot(snapshot);
      provider.setSelectedNode(findMethod(snapshot.tree, 'add()'), false);
      provider.setPinned(true);
      expect(executeCommand).toHaveBeenCalledWith('setContext', 'auspex.callsPinned', true);
      provider.setCurrentFunction(cf('Cart.validate', 'src/cart.js#Cart.validate'));
      provider.setSelectedNode(findMethod(snapshot.tree, 'submit()'), false);
      expect(lastState()).toMatchObject({ pinned: true, currentFnId: 'src/cart.js#Cart.validate' });
      expect(lastState().subject.id).toBe('src/cart.js#Cart.add');
    });

    it('stays pinned when an entry in the view is clicked (file opens, cursor moves)', async () => {
      provider.updateSnapshot(snapshot);
      provider.setSelectedNode(findMethod(snapshot.tree, 'add()'), false);
      provider.setPinned(true);
      // click on the caller "submit": opens the file, the editor switch and the cursor follow
      await provider.handleMessage({ type: 'openFile', filePath: 'src/order.js', startLine: 1, endLine: 3 });
      provider.applySelection({ ...snapshot.tree, type: 'file', path: 'src/order.js' } as TreeNode, 'editor');
      provider.setCurrentFunction(cf('submit', 'src/order.js#submit'));
      expect(provider.pinned).toBe(true);
      expect(lastState()).toMatchObject({ pinned: true, currentFnId: 'src/order.js#submit' });
      expect(lastState().subject.id).toBe('src/cart.js#Cart.add');
    });

    it('jumps to the current function when unpinned while live', () => {
      provider.updateSnapshot(snapshot);
      provider.setSelectedNode(findMethod(snapshot.tree, 'add()'), false);
      provider.setPinned(true);
      provider.setCurrentFunction(cf('submit', 'src/order.js#submit'));
      provider.setPinned(false);
      expect(lastState()).toMatchObject({ pinned: false });
      expect(lastState().subject.id).toBe('src/order.js#submit');
    });

    it('keeps the subject when unpinned without live mode and clears the marker when live is off', () => {
      provider.updateSnapshot(snapshot);
      provider.setSelectedNode(findMethod(snapshot.tree, 'add()'), false);
      provider.setCurrentFunction(cf('Cart.add', 'src/cart.js#Cart.add'));
      provider.setLive(false);
      expect(lastState().currentFnId).toBeUndefined();
      provider.setPinned(true);
      provider.setPinned(false);
      expect(lastState().subject.id).toBe('src/cart.js#Cart.add');
    });

    it('keeps the subject on editor switches but shows the hint for an explicit file selection', () => {
      provider.updateSnapshot(snapshot);
      provider.setSelectedNode(findMethod(snapshot.tree, 'add()'), false);
      const fileNode = { ...snapshot.tree, type: 'file', path: 'src/order.js' } as TreeNode;
      provider.applySelection(fileNode, 'editor');
      expect(lastState().subject.id).toBe('src/cart.js#Cart.add');
      provider.applySelection(fileNode, 'explicit');
      expect(lastState().status).toBe('notFunction');
    });

    it('keeps the last subject when no further event arrives', () => {
      provider.updateSnapshot(snapshot);
      provider.setCurrentFunction(cf('Cart.add', 'src/cart.js#Cart.add'));
      provider.updateSnapshot(snapshot);
      expect(lastState().subject.id).toBe('src/cart.js#Cart.add');
    });
  });
});
