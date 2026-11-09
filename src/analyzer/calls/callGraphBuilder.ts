import type { ParsedFileInfo } from '../types';
import { FunctionIndex } from './functionIndex';
import { JsCallResolver } from './callResolver';
import {
  isLocationCaller,
  type CallCounts,
  type CallEdge,
  type CallEdgeSource,
  type CallGraph,
  type CallerRef,
  type FunctionId,
} from './types';

const callerKey = (from: CallerRef): string =>
  isLocationCaller(from) ? `loc:${from.file}:${from.line}` : `fn:${from}`;

/**
 * Merges edges by (caller, callee): one edge per pair, keeping the highest confidence.
 * If confidences are equal, the first source wins.
 */
export function mergeEdges(edges: CallEdge[]): CallEdge[] {
  const merged = new Map<string, CallEdge>();
  for (const edge of edges) {
    const key = `${callerKey(edge.from)}->${edge.to}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...edge });
    } else if (existing.confidence === 'inferred' && edge.confidence === 'certain') {
      merged.set(key, { ...edge });
    }
  }
  return [...merged.values()];
}

/** Number of distinct callers and callees per function. */
export function computeCounts(edges: CallEdge[]): Record<FunctionId, CallCounts> {
  const callers = new Map<FunctionId, Set<string>>();
  const callees = new Map<FunctionId, Set<string>>();
  const add = (map: Map<FunctionId, Set<string>>, key: FunctionId, value: string) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(value);
  };
  for (const e of edges) {
    add(callers, e.to, callerKey(e.from));
    if (!isLocationCaller(e.from)) add(callees, e.from, e.to);
  }
  const counts: Record<FunctionId, CallCounts> = {};
  for (const id of new Set([...callers.keys(), ...callees.keys()])) {
    counts[id] = { callers: callers.get(id)?.size ?? 0, callees: callees.get(id)?.size ?? 0 };
  }
  return counts;
}

/** Builds the call graph of a set of parsed files from registered edge sources. */
export class CallGraphBuilder {
  private readonly sources: CallEdgeSource[] = [];

  constructor(sources: CallEdgeSource[] = [new JsCallResolver()]) {
    sources.forEach((s) => this.register(s));
  }

  register(source: CallEdgeSource): void {
    this.sources.push(source);
  }

  build(files: ParsedFileInfo[]): CallGraph {
    const index = new FunctionIndex(files);
    const ctx = { files, index };
    const raw: CallEdge[] = [];
    for (const source of this.sources) {
      try {
        raw.push(...source.collect(ctx));
      } catch (err) {
        console.warn(`[Auspex] Call edge source '${source.kind}' failed:`, err);
      }
    }
    const known = new Set(index.all.map((f) => f.id));
    const edges = mergeEdges(raw).filter((e) => known.has(e.to) && (isLocationCaller(e.from) || known.has(e.from)));

    return {
      functions: index.all.map(({ id, file, qualifiedName, startLine, endLine }) => ({
        id,
        file,
        qualifiedName,
        startLine,
        endLine,
      })),
      edges,
      counts: computeCounts(edges),
    };
  }
}
