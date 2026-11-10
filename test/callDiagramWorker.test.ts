import { describe, it, expect, vi } from 'vitest';
import { TreeAggregator } from '../src/analyzer/treeAggregator';
import { CallGraphBuilder } from '../src/analyzer/calls/callGraphBuilder';
import { buildCallDiagramData } from '../src/analyzer/calls/diagramData';
import { handleDiagramRequest, type DiagramResponse } from '../webview/src/utils/callDiagram/protocol';
import { createLayoutRunner } from '../webview/src/utils/callDiagram/client';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();
import type { AnalysisSnapshot } from '../src/analyzer/types';
import { parseJsWithCalls } from './calls/helpers';

const files = [
  parseJsWithCalls('src/a/a.js', ['function a() {', '  b();', '}']),
  parseJsWithCalls('src/b/b.js', ['function b() {', '  return 1;', '}']),
];
const { tree, hotspots } = new TreeAggregator().buildTree(files, new Map());
const snapshot: AnalysisSnapshot = {
  id: '1', workspacePath: '/ws', headCommitSha: '', totalFiles: 2, totalLoc: 0, durationMs: 0, scannedAt: '',
  tree, hotspots, callGraph: new CallGraphBuilder().build(files),
};
const data = buildCallDiagramData(snapshot, '');

describe('diagram worker protocol', () => {
  it('reports progress stages and then the layout', async () => {
    const messages: DiagramResponse[] = [];
    await handleDiagramRequest({ requestId: 3, data }, (m) => messages.push(m), elk);
    expect(messages.map((m) => (m.type === 'progress' ? m.stage : m.type))).toEqual(['model', 'layout', 'result']);
    const result = messages[2];
    expect(result.type === 'result' && result.layout?.edges.map((e) => e.key)).toEqual(['src/a/a.js#a->src/b/b.js#b']);
    expect(messages.every((m) => m.requestId === 3)).toBe(true);
  });

  it('re-lays out a folder restriction with edges leaving it as stubs', async () => {
    const messages: DiagramResponse[] = [];
    await handleDiagramRequest({ requestId: 1, data, folderPath: 'src/a' }, (m) => messages.push(m), elk);
    const result = messages.find((m) => m.type === 'result');
    expect(result?.type === 'result' && result.layout?.stubs).toEqual({ 'src/a/a.js#a': 1 });
  });

  it('sends the number of laid-out functions with the layout progress', async () => {
    const countFor = async (req: Partial<Parameters<typeof handleDiagramRequest>[0]>) => {
      const messages: DiagramResponse[] = [];
      await handleDiagramRequest({ requestId: 1, data, ...req }, (m) => messages.push(m), elk);
      const progress = messages.find((m) => m.type === 'progress' && m.stage === 'layout');
      return progress?.type === 'progress' ? progress.functionCount : undefined;
    };
    expect(await countFor({})).toBe(2);
    expect(await countFor({ folderPath: 'src/a' })).toBe(1);
  });

  it('returns no layout when the request contains no functions', async () => {
    const messages: DiagramResponse[] = [];
    const withEmpty = [...files, parseJsWithCalls('src/c/c.js', ['var x = 1;'])];
    const built = new TreeAggregator().buildTree(withEmpty, new Map());
    const emptyFolder = buildCallDiagramData(
      { ...snapshot, tree: built.tree, hotspots: built.hotspots, callGraph: new CallGraphBuilder().build(withEmpty) },
      ''
    );
    await handleDiagramRequest({ requestId: 4, data: emptyFolder, folderPath: 'src/c' }, (m) => messages.push(m), elk);
    expect(messages).toEqual([
      { requestId: 4, type: 'progress', stage: 'model' },
      { requestId: 4, type: 'result', layout: null },
    ]);
  });

  it('returns null without a tree and reports errors', async () => {
    const messages: DiagramResponse[] = [];
    await handleDiagramRequest({ requestId: 1, data: { ...data, tree: null } }, (m) => messages.push(m), elk);
    expect(messages.at(-1)).toEqual({ requestId: 1, type: 'result', layout: null });
    const errors: DiagramResponse[] = [];
    await handleDiagramRequest({ requestId: 2, data: { ...data, callGraph: null as any } }, (m) => errors.push(m), elk);
    expect(errors.at(-1)?.type).toBe('error');
  });
});

describe('createLayoutRunner', () => {
  it('creates ELK lazily once and delivers results asynchronously', async () => {
    const onMessage = vi.fn();
    const createElk = vi.fn(async () => ({ elk, usesWorker: true }));
    const runner = createLayoutRunner(onMessage, createElk);
    expect(createElk).not.toHaveBeenCalled();
    runner.request({ requestId: 1, data });
    runner.request({ requestId: 2, data });
    expect(onMessage).not.toHaveBeenCalled(); // deferred
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ requestId: 2, type: 'result' })));
    expect(createElk).toHaveBeenCalledTimes(1);
  });

  it('reports an error if ELK cannot be created and stops after dispose', async () => {
    const onMessage = vi.fn();
    const runner = createLayoutRunner(onMessage, async () => {
      throw new Error('no elk');
    });
    runner.request({ requestId: 5, data });
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith({ requestId: 5, type: 'error', message: 'no elk' }));

    const quiet = vi.fn();
    const r2 = createLayoutRunner(quiet, async () => ({ elk, usesWorker: false }));
    r2.request({ requestId: 1, data });
    r2.dispose();
    await new Promise((r) => setTimeout(r, 50));
    expect(quiet).not.toHaveBeenCalled();
  });
});

describe('focus requests', () => {
  const chainFiles = [
    parseJsWithCalls('src/ui/ui.js', ['function onSubmit() {', '  saveOrder();', '}', 'function saveOrder() {', '  add();', '}']),
    parseJsWithCalls('src/cart/cart.js', ['function add() {', '  persist();', '}', 'function unrelated() {', '  return 0;', '}']),
    parseJsWithCalls('src/store/store.js', ['function persist() {', '  writeFile();', '}', 'function writeFile() {', '  return 1;', '}']),
  ];
  const t = new TreeAggregator().buildTree(chainFiles, new Map());
  const snap: AnalysisSnapshot = {
    id: '1', workspacePath: '/ws', headCommitSha: '', totalFiles: 3, totalLoc: 0, durationMs: 0, scannedAt: '',
    tree: t.tree, hotspots: t.hotspots, callGraph: new CallGraphBuilder().build(chainFiles),
  };
  const wsData = buildCallDiagramData(snap, '');

  it('lays out only the focus, callers above callees, with boundary counts', async () => {
    const messages: DiagramResponse[] = [];
    await handleDiagramRequest(
      { requestId: 1, data: wsData, focus: { fnId: 'src/cart/cart.js#add', up: 1, down: 1, includeInferred: true } },
      (m) => messages.push(m),
      elk
    );
    const result = messages.at(-1);
    if (result?.type !== 'result' || !result.layout) throw new Error('no layout');
    const fns = result.layout.nodes.filter((n) => n.kind === 'function');
    expect(fns.map((n) => n.key).sort()).toEqual(['src/cart/cart.js#add', 'src/store/store.js#persist', 'src/ui/ui.js#saveOrder']);
    const y = (k: string) => fns.find((n) => n.key === k)!.y0;
    expect(y('src/ui/ui.js#saveOrder')).toBeLessThan(y('src/cart/cart.js#add'));
    expect(y('src/cart/cart.js#add')).toBeLessThan(y('src/store/store.js#persist'));
    expect(result.layout.boundary).toEqual({
      'src/ui/ui.js#saveOrder': { hiddenCallers: 1, hiddenCallees: 0 },
      'src/store/store.js#persist': { hiddenCallers: 0, hiddenCallees: 1 },
    });
    expect(result.layout.focusSize).toBe(3);
  });

  it('counts only the functions of the focus in the layout progress', async () => {
    const messages: DiagramResponse[] = [];
    await handleDiagramRequest(
      { requestId: 1, data: wsData, focus: { fnId: 'src/cart/cart.js#add', up: 1, down: 1, includeInferred: true } },
      (m) => messages.push(m),
      elk
    );
    expect(messages[1]).toEqual({ requestId: 1, type: 'progress', stage: 'layout', functionCount: 3 });
  });

  it('returns no layout for a focus on an unknown function', async () => {
    const messages: DiagramResponse[] = [];
    await handleDiagramRequest(
      { requestId: 1, data: wsData, focus: { fnId: 'src/nope.js#missing', up: 1, down: 1, includeInferred: true } },
      (m) => messages.push(m),
      elk
    );
    expect(messages.at(-1)).toEqual({ requestId: 1, type: 'result', layout: null });
  });

  it('treats a null depth (Infinity after JSON transport) as all', async () => {
    const messages: DiagramResponse[] = [];
    await handleDiagramRequest(
      { requestId: 2, data: wsData, focus: { fnId: 'src/cart/cart.js#add', up: null as any, down: 0, includeInferred: true } },
      (m) => messages.push(m),
      elk
    );
    const result = messages.at(-1);
    expect(result?.type === 'result' && result.layout?.focusSize).toBe(3);
  });
});
