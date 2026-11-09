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
