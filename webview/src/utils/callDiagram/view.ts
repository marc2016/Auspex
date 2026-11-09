import type { DiagramLayout, LaidOutNode, RoutedEdge } from './layout';
import type { DiagramRequest } from './protocol';
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

/** Applies filters to a laid-out diagram without re-running the layout. */
export function applyFilters(layout: DiagramLayout, filters: DiagramFilters): VisibleDiagram {
  let edges = filters.hideInferred ? layout.edges.filter((e) => e.confidence !== 'inferred') : layout.edges;
  if (!filters.hotspotsOnly) return { nodes: layout.nodes, edges };

  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
  const keep = new Set<string>();
  for (const n of layout.nodes) {
    if (n.kind !== 'function' || !n.data.hotspot) continue;
    let cur: LaidOutNode | undefined = n;
    while (cur && !keep.has(cur.key)) {
      keep.add(cur.key);
      cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined;
    }
  }
  const isVisibleFunction = (key: string) => keep.has(key) && byKey.get(key)?.kind === 'function';
  edges = edges.filter((e) => isVisibleFunction(e.fromKey) && isVisibleFunction(e.toKey));
  return { nodes: layout.nodes.filter((n) => keep.has(n.key)), edges };
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
}): Omit<DiagramRequest, 'requestId'> | undefined {
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
    };
  }
  if (!state.data) return undefined;
  return { data: state.data, folderPath: state.folderPath || undefined };
}
