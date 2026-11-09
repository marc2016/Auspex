import { describe, it, expect, vi } from 'vitest';
import { CallGraphService, type LspQuery } from '../../src/analyzer/calls/callGraphService';
import type { CallGraph } from '../../src/analyzer/calls/types';

const base = (): CallGraph => ({
  functions: [
    { id: 'a.ts#save', file: 'a.ts', qualifiedName: 'save', startLine: 1, endLine: 5 },
    { id: 'a.ts#helper', file: 'a.ts', qualifiedName: 'helper', startLine: 7, endLine: 9 },
    { id: 'b.ts#persist', file: 'b.ts', qualifiedName: 'persist', startLine: 1, endLine: 3 },
  ],
  edges: [{ from: 'a.ts#save', to: 'a.ts#helper', confidence: 'inferred', source: 'js' }],
  counts: { 'a.ts#save': { callers: 0, callees: 1 }, 'a.ts#helper': { callers: 1, callees: 0 } },
});

describe('CallGraphService', () => {
  it('merges language server edges into the base graph and notifies listeners', () => {
    const svc = new CallGraphService();
    const listener = vi.fn();
    svc.onDidChange(listener);
    svc.setBaseGraph(base());
    svc.addEdges([
      { from: 'a.ts#save', to: 'a.ts#helper', confidence: 'certain', source: 'js' },
      { from: 'a.ts#save', to: 'b.ts#persist', confidence: 'certain', source: 'js' },
      { from: 'a.ts#save', to: 'gone.ts#x', confidence: 'certain', source: 'js' },
    ]);
    expect(svc.outgoing('a.ts#save')).toEqual([
      { from: 'a.ts#save', to: 'a.ts#helper', confidence: 'certain', source: 'js' },
      { from: 'a.ts#save', to: 'b.ts#persist', confidence: 'certain', source: 'js' },
    ]);
    expect(svc.graph?.counts['a.ts#save']).toEqual({ callers: 0, callees: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('drops language server edges of a saved file', () => {
    const svc = new CallGraphService();
    svc.setBaseGraph(base());
    svc.addEdges([{ from: 'a.ts#save', to: 'b.ts#persist', confidence: 'certain', source: 'js' }]);
    svc.invalidateFile('a.ts');
    expect(svc.outgoing('a.ts#save').map((e) => e.to)).toEqual(['a.ts#helper']);
  });

  it('finds the innermost function at a line', () => {
    const svc = new CallGraphService();
    svc.setBaseGraph(base());
    expect(svc.findFunctionAt('a.ts', 8)?.id).toBe('a.ts#helper');
    expect(svc.findFunctionAt('a.ts', 6)).toBeUndefined();
  });

  it('keeps base edges when an on-demand query fails or returns nothing', async () => {
    const svc = new CallGraphService();
    svc.setBaseGraph(base());
    const lsp: LspQuery = { query: vi.fn().mockResolvedValue([]) };
    await svc.queryOnDemand('a.ts#save', lsp);
    expect(svc.outgoing('a.ts#save')).toHaveLength(1);
    expect(lsp.query).toHaveBeenCalledWith(expect.objectContaining({ id: 'a.ts#save' }), expect.objectContaining({ direction: 'both' }));
  });

  describe('crawl', () => {
    it('queries outgoing calls per function and caches results by file hash', async () => {
      const svc = new CallGraphService();
      svc.setBaseGraph(base());
      const query = vi.fn(async (fn: any, _opts?: { direction?: string }) =>
        fn.id === 'a.ts#save' ? [{ from: 'a.ts#save', to: 'b.ts#persist', confidence: 'certain' as const, source: 'js' as const }] : []
      );
      const progress = vi.fn();
      const cache = await svc.crawl({ lsp: { query }, fileHashes: { 'a.ts': 'h1', 'b.ts': 'h2' }, cache: {}, onProgress: progress });

      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls.every((c) => c[1]?.direction === 'outgoing')).toBe(true);
      expect(cache['a.ts']).toEqual({ fileHash: 'h1', edges: [{ from: 'a.ts#save', to: 'b.ts#persist', confidence: 'certain', source: 'js' }] });
      expect(svc.outgoing('a.ts#save').map((e) => e.to)).toContain('b.ts#persist');
      expect(progress).toHaveBeenLastCalledWith(2, 2);
    });

    it('reuses cached edges of unchanged files and re-queries changed files', async () => {
      const svc = new CallGraphService();
      svc.setBaseGraph(base());
      const query = vi.fn().mockResolvedValue([]);
      const cached = { from: 'a.ts#save', to: 'b.ts#persist', confidence: 'certain' as const, source: 'js' as const };
      const cache = await svc.crawl({
        lsp: { query },
        fileHashes: { 'a.ts': 'same', 'b.ts': 'new' },
        cache: { 'a.ts': { fileHash: 'same', edges: [cached] }, 'b.ts': { fileHash: 'old', edges: [] }, 'deleted.ts': { fileHash: 'x', edges: [] } },
      });
      expect(query.mock.calls.map((c) => c[0].id)).toEqual(['b.ts#persist']);
      expect(svc.outgoing('a.ts#save')).toContainEqual(cached);
      expect(cache['b.ts'].fileHash).toBe('new');
      expect(cache['deleted.ts']).toBeUndefined();
    });

    it('serves the scan result while the crawl is still running and adds edges as files finish', async () => {
      const svc = new CallGraphService();
      svc.setBaseGraph(base());
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => (release = r));
      const query = vi.fn(async (fn: any) => {
        await gate;
        return fn.id === 'a.ts#save'
          ? [{ from: 'a.ts#save', to: 'b.ts#persist', confidence: 'certain' as const, source: 'js' as const }]
          : [];
      });
      const running = svc.crawl({ lsp: { query }, fileHashes: { 'a.ts': 'h' }, cache: {} });

      // scan result available immediately
      expect(svc.outgoing('a.ts#save').map((e) => e.to)).toEqual(['a.ts#helper']);

      release();
      await running;
      expect(svc.outgoing('a.ts#save').map((e) => e.to)).toEqual(['a.ts#helper', 'b.ts#persist']);
    });

    it('stops when cancelled', async () => {
      const svc = new CallGraphService();
      svc.setBaseGraph(base());
      const query = vi.fn().mockResolvedValue([]);
      await svc.crawl({ lsp: { query }, fileHashes: {}, cache: {}, isCancelled: () => true });
      expect(query).not.toHaveBeenCalled();
    });
  });
});
