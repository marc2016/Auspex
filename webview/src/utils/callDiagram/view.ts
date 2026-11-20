import type { DiagramLayout, LaidOutNode, RoutedEdge } from './layout';
import type { DiagramRequest, DiagramStage } from './protocol';
import type { DiagramLevel } from './model';
import type { CallDiagramData } from '../../../../src/analyzer/calls/diagramData';
import { getHeatColor } from '../../components/TreemapViewer';
import { getCodeHealthColor } from '../../components/SystemMapViewer';

export type ZoomBand = 'far' | 'middle' | 'near';
export type DiagramColorMode = 'churn' | 'health';

/** Zoom factor thresholds: frames only below FAR, unlabeled boxes below NEAR, labels above. */
export const ZOOM_FAR = 0.35;
export const ZOOM_NEAR = 0.5;

export function zoomBand(k: number): ZoomBand {
  if (k < ZOOM_FAR) return 'far';
  if (k < ZOOM_NEAR) return 'middle';
  return 'near';
}

/**
 * Depth up to which frames are shown individually in the far band: the deepest frame level whose
 * frames are on average at least `minScreenWidth` pixels wide at zoom `k` (at least 1).
 */
export function aggregationDepth(nodes: LaidOutNode[], k: number, minScreenWidth = 120): number {
  const widths = new Map<number, { sum: number; n: number }>();
  for (const n of nodes) {
    if (n.kind === 'function' || n.kind === 'root') continue;
    const w = widths.get(n.depth) ?? { sum: 0, n: 0 };
    w.sum += (n.x1 - n.x0) * k;
    w.n++;
    widths.set(n.depth, w);
  }
  let depth = 1;
  for (const [d, w] of [...widths.entries()].sort((a, b) => a[0] - b[0])) {
    if (w.sum / w.n >= minScreenWidth) depth = Math.max(depth, d);
    else break;
  }
  return depth;
}

export interface AggregatedEdge {
  key: string;
  fromKey: string;
  toKey: string;
  count: number;
  points: [number, number][];
}

/** Collapses edges onto their endpoints' frames at `maxDepth`; edges inside one frame are hidden. */
export function aggregateEdges(edges: RoutedEdge[], nodes: LaidOutNode[], maxDepth: number): AggregatedEdge[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const frameAt = (key: string): LaidOutNode | undefined => {
    let cur = byKey.get(key);
    while (cur && cur.depth > maxDepth && cur.parentKey) cur = byKey.get(cur.parentKey);
    return cur;
  };
  const groups = new Map<string, AggregatedEdge>();
  for (const e of edges) {
    const a = frameAt(e.fromKey);
    const b = frameAt(e.toKey);
    if (!a || !b || a.key === b.key) continue;
    const key = `${a.key}=>${b.key}`;
    const g = groups.get(key);
    if (g) g.count++;
    else {
      groups.set(key, {
        key,
        fromKey: a.key,
        toKey: b.key,
        count: 1,
        points: [
          [(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2],
          [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2],
        ],
      });
    }
  }
  return [...groups.values()];
}

/** Box color, using the same scales as the treemap. */
export function functionColor(node: Pick<LaidOutNode, 'data'>, mode: DiagramColorMode, isLight: boolean): string {
  return mode === 'health' ? getCodeHealthColor(node.data.codeHealth) : getHeatColor(node.data.churnScore ?? 0, isLight);
}

/** Callers and callees of a function and the connecting edges. */
export function neighborsOf(key: string, edges: RoutedEdge[]): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>([key]);
  const edgeKeys = new Set<string>();
  for (const e of edges) {
    if (e.fromKey === key || e.toKey === key) {
      nodes.add(e.fromKey);
      nodes.add(e.toKey);
      edgeKeys.add(e.key);
    }
  }
  return { nodes, edges: edgeKeys };
}

export interface DiagramFilters {
  hideInferred: boolean;
  hotspotsOnly: boolean;
}

export interface VisibleDiagram {
  nodes: LaidOutNode[];
  edges: RoutedEdge[];
}

/** True for leaves that carry calls: function boxes and the boxes of the class and file levels. */
export function isLeafBox(n: Pick<LaidOutNode, 'kind' | 'data'>): boolean {
  return n.kind === 'function' || n.data.members !== undefined;
}

/** Number of calls an edge stands for (after filters). */
export function edgeCount(e: Pick<RoutedEdge, 'certainCount' | 'inferredCount'>): number {
  return e.certainCount + e.inferredCount;
}

/**
 * Applies filters to a laid-out diagram without re-running the layout. Hiding inferred edges removes
 * the inferred calls from every edge (combined edges keep their certain calls, edges left without
 * calls are hidden); "hotspots only" keeps hotspot boxes, their frames and the edges between them.
 */
export function applyFilters(layout: DiagramLayout, filters: DiagramFilters): VisibleDiagram {
  let edges = filters.hideInferred
    ? layout.edges.filter((e) => e.certainCount > 0).map((e) => (e.inferredCount > 0 ? { ...e, inferredCount: 0 } : e))
    : layout.edges;
  if (!filters.hotspotsOnly) return { nodes: layout.nodes, edges };

  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
  const keep = new Set<string>();
  for (const n of layout.nodes) {
    if (!isLeafBox(n) || !n.data.hotspot) continue;
    let cur: LaidOutNode | undefined = n;
    while (cur && !keep.has(cur.key)) {
      keep.add(cur.key);
      cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined;
    }
  }
  const isVisibleLeaf = (key: string) => {
    const n = byKey.get(key);
    return keep.has(key) && !!n && isLeafBox(n);
  };
  edges = edges.filter((e) => isVisibleLeaf(e.fromKey) && isVisibleLeaf(e.toKey));
  return { nodes: layout.nodes.filter((n) => keep.has(n.key)), edges };
}

export interface DependencyCycles {
  /** Box keys of each cycle, sorted by the top, then left edge of the cycle's bounding box. */
  cycles: string[][];
  /** Keys of boxes in any cycle. */
  nodes: Set<string>;
  /** Keys of visible edges between two boxes of the same cycle. */
  edges: Set<string>;
}

/**
 * Dependency cycles between boxes of the class and file levels: strongly connected components
 * (Tarjan) of two or more boxes over the visible edges. Function boxes form no cycles.
 */
export function findCycles(diagram: VisibleDiagram): DependencyCycles {
  const boxes = diagram.nodes.filter((n) => n.data.members !== undefined);
  const result: DependencyCycles = { cycles: [], nodes: new Set(), edges: new Set() };
  if (boxes.length === 0) return result;
  const boxKeys = new Set(boxes.map((b) => b.key));
  const out = new Map<string, string[]>();
  for (const e of diagram.edges) {
    if (!boxKeys.has(e.fromKey) || !boxKeys.has(e.toKey) || e.fromKey === e.toKey) continue;
    (out.get(e.fromKey) ?? out.set(e.fromKey, []).get(e.fromKey)!).push(e.toKey);
  }

  // Iterative Tarjan (no recursion limit on long dependency chains)
  let next = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  for (const start of boxes.map((b) => b.key)) {
    if (index.has(start)) continue;
    const work: { v: string; i: number }[] = [{ v: start, i: 0 }];
    index.set(start, next);
    low.set(start, next++);
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const succ = out.get(frame.v) ?? [];
      if (frame.i < succ.length) {
        const w = succ[frame.i++];
        if (!index.has(w)) {
          index.set(w, next);
          low.set(w, next++);
          stack.push(w);
          onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.v)!));
      }
      if (low.get(frame.v) === index.get(frame.v)) {
        const comp: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.push(w);
        } while (w !== frame.v);
        if (comp.length >= 2) components.push(comp);
      }
    }
  }

  const byKey = new Map(boxes.map((b) => [b.key, b]));
  const corner = (comp: string[]) => {
    const ns = comp.map((k) => byKey.get(k)!);
    return { y: Math.min(...ns.map((n) => n.y0)), x: Math.min(...ns.map((n) => n.x0)) };
  };
  const sorted = components
    .map((c) => ({ c: [...c].sort(), at: corner(c) }))
    .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
    .map((x) => x.c);
  const compOf = new Map<string, number>();
  sorted.forEach((c, i) => c.forEach((k) => compOf.set(k, i)));
  result.cycles = sorted;
  result.nodes = new Set(compOf.keys());
  for (const e of diagram.edges) {
    const a = compOf.get(e.fromKey);
    if (a !== undefined && a === compOf.get(e.toKey) && e.fromKey !== e.toKey) result.edges.add(e.key);
  }
  return result;
}

/** Bounding box of a set of nodes (diagram coordinates), or null if none is found. */
export function boundsOf(nodes: LaidOutNode[], keys: Iterable<string>): { x0: number; y0: number; x1: number; y1: number } | null {
  const set = new Set(keys);
  const ns = nodes.filter((n) => set.has(n.key));
  if (ns.length === 0) return null;
  return {
    x0: Math.min(...ns.map((n) => n.x0)),
    y0: Math.min(...ns.map((n) => n.y0)),
    x1: Math.max(...ns.map((n) => n.x1)),
    y1: Math.max(...ns.map((n) => n.y1)),
  };
}

/**
 * Maps function keys to the key of the box that contains them (class and file levels). At the
 * function level every function maps to itself.
 */
export function boxOf(layout: DiagramLayout | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of layout?.nodes ?? []) {
    if (n.kind === 'function') map.set(n.key, n.key);
    for (const m of n.data.members ?? []) map.set(m, n.key);
  }
  return map;
}

/** Focus boundary markers per box: hidden callers and callees of its members, summed. */
export function boundaryByBox(
  boundary: DiagramLayout['boundary'],
  boxes: Map<string, string>
): Record<string, { hiddenCallers: number; hiddenCallees: number }> {
  const out: Record<string, { hiddenCallers: number; hiddenCallees: number }> = {};
  for (const [fnKey, b] of Object.entries(boundary ?? {})) {
    const key = boxes.get(fnKey) ?? fnKey;
    const cur = (out[key] ??= { hiddenCallers: 0, hiddenCallees: 0 });
    cur.hiddenCallers += b.hiddenCallers;
    cur.hiddenCallees += b.hiddenCallees;
  }
  return out;
}

/** Keeps the selection after an update if the selected function still exists. */
export function restoreSelection(selectedKey: string | null, layout: DiagramLayout | null): string | null {
  if (!selectedKey || !layout) return null;
  return layout.nodes.some((n) => n.key === selectedKey) ? selectedKey : null;
}

/** Nodes intersecting the viewport rectangle (diagram coordinates). */
export function cullToViewport(
  nodes: LaidOutNode[],
  view: { x0: number; y0: number; x1: number; y1: number }
): LaidOutNode[] {
  return nodes.filter((n) => n.x1 >= view.x0 && n.x0 <= view.x1 && n.y1 >= view.y0 && n.y0 <= view.y1);
}

/**
 * Edges with at least one end among the shown nodes; highlighted edges (of the selection) are always
 * kept so that the selection stays visible when its partners are off-screen.
 */
export function cullEdges(edges: RoutedEdge[], shownKeys: Set<string>, keep?: Set<string>): RoutedEdge[] {
  return edges.filter((e) => shownKeys.has(e.fromKey) || shownKeys.has(e.toKey) || (keep?.has(e.key) ?? false));
}

/** Folder frames available for the folder restriction filter. */
export function folderOptions(layout: DiagramLayout | null): { path: string; name: string }[] {
  if (!layout) return [];
  return layout.nodes
    .filter((n) => n.kind === 'folder' && n.data.folderPath)
    .map((n) => ({ path: n.data.folderPath!, name: n.data.folderPath! }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// ---- focus mode -------------------------------------------------------------------------------

export type FocusDepthOption = number | 'all';
/** Depth choices of the focus bar: 0-10 or all. */
export const FOCUS_DEPTH_OPTIONS: FocusDepthOption[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'all'];
export const FOCUS_DEFAULT_DEPTH: FocusDepthOption = 2;
export const FOCUS_LARGE_THRESHOLD = 300;

export const depthToNumber = (d: FocusDepthOption): number => (d === 'all' ? Infinity : d);

export interface DiagramFocus {
  fnId: string;
  label: string;
  up: FocusDepthOption;
  down: FocusDepthOption;
}

/** True if a focus contains so many functions that a lower depth should be suggested. */
export function isLargeFocus(size: number | undefined): boolean {
  return (size ?? 0) > FOCUS_LARGE_THRESHOLD;
}

/** Display label of a function: its qualified name if known. */
export function functionLabel(data: CallDiagramData | null, fnId: string): string {
  return data?.callGraph.functions.find((f) => f.id === fnId)?.qualifiedName ?? fnId.split('#').pop() ?? fnId;
}

/**
 * Layout request for the current view state: the focus (on workspace-wide data) or the scope view
 * (with optional folder restriction). Undefined while required data is missing.
 */
export function layoutRequestFor(state: {
  data: CallDiagramData | null;
  focusData: CallDiagramData | null;
  folderPath: string;
  focus: DiagramFocus | null;
  hideInferred: boolean;
  level?: DiagramLevel;
}): Omit<DiagramRequest, 'requestId'> | undefined {
  const level = state.level && state.level !== 'functions' ? { level: state.level } : {};
  if (state.focus) {
    if (!state.focusData) return undefined;
    return {
      data: state.focusData,
      focus: {
        fnId: state.focus.fnId,
        up: depthToNumber(state.focus.up),
        down: depthToNumber(state.focus.down),
        includeInferred: !state.hideInferred,
      },
      ...level,
    };
  }
  if (!state.data) return undefined;
  return { data: state.data, folderPath: state.folderPath || undefined, ...level };
}

// ---- live mode: cursor marker -----------------------------------------------------------------

type Rect = { x0: number; y0: number; x1: number; y1: number };

/**
 * Minimal pan (diagram units) that brings a box fully into the viewport, with a margin; null when
 * the box is already completely visible. Positive dx/dy means the view has to move right/down.
 * A box larger than the viewport is aligned to its top-left corner.
 */
export function panIntoView(box: Rect, view: Rect, margin = 0): { dx: number; dy: number } | null {
  const axis = (b0: number, b1: number, v0: number, v1: number): number => {
    if (b0 >= v0 && b1 <= v1) return 0;
    if (b1 - b0 + 2 * margin > v1 - v0 || b0 < v0) return b0 - margin - v0;
    return b1 + margin - v1;
  };
  const dx = axis(box.x0, box.x1, view.x0, view.x1);
  const dy = axis(box.y0, box.y1, view.y0, view.y1);
  return dx === 0 && dy === 0 ? null : { dx, dy };
}

/** True if the function at the cursor has call data but is not part of the laid-out diagram. */
export function isCursorOutside(layout: DiagramLayout | null, fnId: string | null | undefined): boolean {
  if (!layout || !fnId) return false;
  return !boxOf(layout).has(fnId);
}

// ---- load state and fit -----------------------------------------------------------------------

export type DiagramLoadState =
  | { kind: 'loading'; step: 1 | 2 | 3; functionCount?: number }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'ready' };

/**
 * What the canvas shows. A running load wins over an old error or layout; "empty" only after a
 * result said so. Steps: 1 waiting for analysis or focus data, 2 building the structure, 3 layout.
 */
export function loadState(s: {
  hasData: boolean;
  /** Focus mode without workspace-wide data yet. */
  focusPending: boolean;
  stage: DiagramStage | null;
  error: string | null;
  hasLayout: boolean;
  /** The last result carried no layout (no functions). */
  settledEmpty: boolean;
  functionCount?: number | null;
}): DiagramLoadState {
  if (s.stage === 'model') return { kind: 'loading', step: 2 };
  if (s.stage) return { kind: 'loading', step: 3, ...(s.functionCount != null ? { functionCount: s.functionCount } : {}) };
  if (!s.hasData || s.focusPending) return { kind: 'loading', step: 1 };
  if (s.error) return { kind: 'error', message: s.error };
  if (s.hasLayout) return { kind: 'ready' };
  if (s.settledEmpty) return { kind: 'empty' };
  return { kind: 'loading', step: 2 }; // request about to start
}

/** Elapsed time for the loading indicator: "4 s" below one minute, "1:05 min" above. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total} s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} min`;
}

/**
 * Transform that centers a layout in the canvas with a margin; null while the canvas or the layout
 * has no size (a fit would give zoom 0).
 */
export function fitTransform(
  layoutWidth: number,
  layoutHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding = 0.95
): { k: number; x: number; y: number } | null {
  if (!(layoutWidth > 0 && layoutHeight > 0 && canvasWidth > 0 && canvasHeight > 0)) return null;
  const k = Math.min(canvasWidth / layoutWidth, canvasHeight / layoutHeight) * padding;
  return { k, x: (canvasWidth - layoutWidth * k) / 2, y: (canvasHeight - layoutHeight * k) / 2 };
}
