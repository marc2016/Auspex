import { isLocationCaller, type CallEdge, type CallGraph, type CallLocation, type FunctionId } from './types';

export interface FocusOptions {
  /** Caller depth (levels upwards); `Infinity` for all. */
  up: number;
  /** Callee depth (levels downwards); `Infinity` for all. */
  down: number;
  /** Whether `inferred` edges are traversed. */
  includeInferred: boolean;
}

export interface FocusBoundary {
  /** Callers that exist but are not shown (beyond the caller depth). */
  hiddenCallers: number;
  /** Callees that exist but are not shown (beyond the callee depth). */
  hiddenCallees: number;
}

export interface FocusResult {
  start: FunctionId;
  functions: Set<FunctionId>;
  locations: CallLocation[];
  /** Edges between included nodes. */
  edges: CallEdge[];
  /** Hidden caller/callee counts for functions at the depth limit. */
  boundary: Record<FunctionId, FocusBoundary>;
}

export const FOCUS_DEPTH_ALL = Infinity;
export const FOCUS_WARNING_THRESHOLD = 300;

const locationKey = (l: CallLocation) => `${l.file}:${l.line}`;

/**
 * The neighborhood of a function in the call graph: callers up to `up` levels (backwards) and
 * callees up to `down` levels (forwards). Each function is visited once, so cycles terminate.
 * Location callers (references from non-code files) are collected as leaves on the caller side.
 */
export function computeFocus(graph: CallGraph, start: FunctionId, options: FocusOptions): FocusResult {
  const usable = graph.edges.filter((e) => options.includeInferred || e.confidence !== 'inferred');
  const incoming = new Map<FunctionId, CallEdge[]>();
  const outgoing = new Map<FunctionId, CallEdge[]>();
  for (const e of usable) {
    (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)!).push(e);
    if (!isLocationCaller(e.from)) (outgoing.get(e.from) ?? outgoing.set(e.from, []).get(e.from)!).push(e);
  }

  const functions = new Set<FunctionId>([start]);
  const locations = new Map<string, CallLocation>();
  const upDepth = new Map<FunctionId, number>([[start, 0]]);
  const downDepth = new Map<FunctionId, number>([[start, 0]]);

  // callers (backwards)
  let frontier: FunctionId[] = [start];
  for (let level = 1; level <= options.up && frontier.length > 0; level++) {
    const next: FunctionId[] = [];
    for (const id of frontier) {
      for (const e of incoming.get(id) ?? []) {
        if (isLocationCaller(e.from)) {
          locations.set(locationKey(e.from), e.from);
          continue;
        }
        if (upDepth.has(e.from)) continue;
        upDepth.set(e.from, level);
        functions.add(e.from);
        next.push(e.from);
      }
    }
    frontier = next;
  }

  // callees (forwards)
  frontier = [start];
  for (let level = 1; level <= options.down && frontier.length > 0; level++) {
    const next: FunctionId[] = [];
    for (const id of frontier) {
      for (const e of outgoing.get(id) ?? []) {
        if (downDepth.has(e.to)) continue;
        downDepth.set(e.to, level);
        functions.add(e.to);
        next.push(e.to);
      }
    }
    frontier = next;
  }

  const included = (from: CallEdge['from']) =>
    isLocationCaller(from) ? locations.has(locationKey(from)) : functions.has(from);
  const edges = usable.filter((e) => included(e.from) && functions.has(e.to));

  // boundary: functions at the limit with callers/callees that are not shown
  const boundary: Record<FunctionId, FocusBoundary> = {};
  for (const id of functions) {
    const hiddenCallers = (incoming.get(id) ?? []).filter((e) => !included(e.from)).length;
    const hiddenCallees = (outgoing.get(id) ?? []).filter((e) => !functions.has(e.to)).length;
    const atCallerLimit = upDepth.has(id) && upDepth.get(id)! >= options.up;
    const atCalleeLimit = downDepth.has(id) && downDepth.get(id)! >= options.down;
    const b: FocusBoundary = {
      hiddenCallers: atCallerLimit ? hiddenCallers : 0,
      hiddenCallees: atCalleeLimit ? hiddenCallees : 0,
    };
    if (b.hiddenCallers > 0 || b.hiddenCallees > 0) boundary[id] = b;
  }

  return { start, functions, locations: [...locations.values()], edges, boundary };
}

/** Focus target (function id and label) for a file and 1-based line, if a known function contains it. */
export function focusTargetAt(
  service: { findFunctionAt(file: string, line: number): { id: FunctionId; qualifiedName: string } | undefined },
  file: string,
  line: number
): { fnId: FunctionId; label: string } | undefined {
  const fn = service.findFunctionAt(file.replace(/\\/g, '/').replace(/^\/+/, ''), line);
  return fn ? { fnId: fn.id, label: fn.qualifiedName } : undefined;
}

/** Arguments of `auspex.openCallDiagram`: a scope path, or `{ scopePath?, focus?: { file, startLine } }`. */
export function parseOpenCallDiagramArg(arg: unknown): { scopePath: string; focus?: { file: string; startLine: number } } {
  if (typeof arg === 'string') return { scopePath: arg };
  if (arg && typeof arg === 'object') {
    const a = arg as { scopePath?: unknown; focus?: { file?: unknown; startLine?: unknown } };
    const scopePath = typeof a.scopePath === 'string' ? a.scopePath : '';
    if (a.focus && typeof a.focus.file === 'string' && typeof a.focus.startLine === 'number') {
      return { scopePath, focus: { file: a.focus.file, startLine: a.focus.startLine } };
    }
    return { scopePath };
  }
  return { scopePath: '' };
}
