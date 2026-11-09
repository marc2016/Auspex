import { computeCounts, mergeEdges } from './callGraphBuilder';
import { isLocationCaller, type CallEdge, type CallFunctionRef, type CallGraph, type FunctionId } from './types';
import type { LspCallCacheEntry } from '../../storage/cache';

/** Setting `auspex.calls.languageServer`. */
export type LanguageServerMode = 'onDemand' | 'background' | 'off';

/** Minimal interface of the language server source (implemented by LspCallSource). */
export interface LspQuery {
  query(fn: CallFunctionRef, options?: { direction?: 'incoming' | 'outgoing' | 'both'; timeoutMs?: number }): Promise<CallEdge[]>;
}

export interface CrawlOptions {
  lsp: LspQuery;
  /** File hash per workspace-relative path (from the parse cache). */
  fileHashes: Record<string, string>;
  /** Previously cached language server edges per file. */
  cache: Record<string, LspCallCacheEntry>;
  concurrency?: number;
  isCancelled?: () => boolean;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Holds the call graph of the current snapshot plus language server edges found on demand or in
 * the background, and exposes the merged ("effective") graph to the views.
 */
export class CallGraphService {
  private base: CallGraph | undefined;
  private overlay: CallEdge[] = [];
  private effective: CallGraph | undefined;
  private readonly listeners = new Set<() => void>();

  setBaseGraph(graph: CallGraph | undefined): void {
    this.base = graph;
    this.effective = undefined;
    this.emit();
  }

  /** Adds language server edges (merged with existing ones, highest confidence wins). */
  addEdges(edges: CallEdge[]): void {
    if (edges.length === 0) return;
    this.overlay = mergeEdges([...this.overlay, ...edges]);
    this.effective = undefined;
    this.emit();
  }

  /** Drops language server edges whose caller lies in `file` (e.g. after the file was saved). */
  invalidateFile(file: string): void {
    const before = this.overlay.length;
    this.overlay = this.overlay.filter((e) => isLocationCaller(e.from) || !e.from.startsWith(`${file}#`));
    if (this.overlay.length !== before) {
      this.effective = undefined;
      this.emit();
    }
  }

  get graph(): CallGraph | undefined {
    if (!this.base) return undefined;
    if (!this.effective) {
      const known = new Set(this.base.functions.map((f) => f.id));
      const extra = this.overlay.filter(
        (e) => known.has(e.to) && (isLocationCaller(e.from) || known.has(e.from))
      );
      const edges = extra.length > 0 ? mergeEdges([...this.base.edges, ...extra]) : this.base.edges;
      this.effective = { functions: this.base.functions, edges, counts: extra.length > 0 ? computeCounts(edges) : this.base.counts };
    }
    return this.effective;
  }

  getFunction(id: FunctionId): CallFunctionRef | undefined {
    return this.base?.functions.find((f) => f.id === id);
  }

  /** Innermost known function of a file containing a 1-based line. */
  findFunctionAt(file: string, line: number): CallFunctionRef | undefined {
    let best: CallFunctionRef | undefined;
    for (const fn of this.base?.functions ?? []) {
      if (fn.file !== file || line < fn.startLine || line > fn.endLine) continue;
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
    return best;
  }

  incoming(id: FunctionId): CallEdge[] {
    return (this.graph?.edges ?? []).filter((e) => e.to === id);
  }

  outgoing(id: FunctionId): CallEdge[] {
    return (this.graph?.edges ?? []).filter((e) => e.from === id);
  }

  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Queries the language server for one function and merges the result. */
  async queryOnDemand(id: FunctionId, lsp: LspQuery, timeoutMs = 5000): Promise<CallEdge[]> {
    const fn = this.getFunction(id);
    if (!fn) return [];
    const edges = await lsp.query(fn, { direction: 'both', timeoutMs });
    this.addEdges(edges);
    return edges;
  }

  /**
   * Queries outgoing calls of all known functions, file by file, reusing cached results of
   * unchanged files. Returns the updated cache.
   */
  async crawl(options: CrawlOptions): Promise<Record<string, LspCallCacheEntry>> {
    const { lsp, fileHashes, concurrency = 4, isCancelled = () => false, onProgress } = options;
    const cache = { ...options.cache };
    const byFile = new Map<string, CallFunctionRef[]>();
    for (const fn of this.base?.functions ?? []) {
      const list = byFile.get(fn.file);
      if (list) list.push(fn);
      else byFile.set(fn.file, [fn]);
    }

    const files = [...byFile.keys()];
    let done = 0;
    for (const file of files) {
      if (isCancelled()) break;
      const hash = fileHashes[file];
      const cached = cache[file];
      if (hash && cached && cached.fileHash === hash) {
        this.addEdges(cached.edges);
      } else {
        const edges = await mapWithConcurrency(byFile.get(file) ?? [], concurrency, async (fn) =>
          isCancelled() ? [] : lsp.query(fn, { direction: 'outgoing' })
        );
        const flat = edges.flat();
        if (isCancelled()) break;
        if (hash) cache[file] = { fileHash: hash, edges: flat };
        this.addEdges(flat);
      }
      done++;
      onProgress?.(done, files.length);
    }
    // forget files that no longer exist
    for (const file of Object.keys(cache)) if (!byFile.has(file)) delete cache[file];
    return cache;
  }

  private emit(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        /* ignore listener errors */
      }
    }
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
