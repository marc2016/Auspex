import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { CallConfidence, CallSourceKind } from '../../../../src/analyzer/calls/types';
import type { CallDiagramData } from '../../../../src/analyzer/calls/diagramData';
import type { DiagramNode, DiagramNodeKind } from './model';

import { FRAME_LABEL_HEIGHT } from './constants';

export { FRAME_LABEL_HEIGHT };
const FRAME_PADDING = `[top=${FRAME_LABEL_HEIGHT + 4},left=10,bottom=10,right=10]`;
const NODE_BASE_HEIGHT = 24;
const NODE_MAX_EXTRA_HEIGHT = 16;
const CHAR_WIDTH = 7;

export interface LaidOutNode {
  key: string;
  kind: DiagramNodeKind;
  name: string;
  depth: number;
  parentKey?: string;
  /** Absolute coordinates. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Node data without children (hierarchy is given by parentKey). */
  data: DiagramNode;
}

export interface RoutedEdge {
  key: string;
  fromKey: string;
  toKey: string;
  /** Absolute points of the routed edge (start, bend points, end). */
  points: [number, number][];
  confidence: CallConfidence;
  source: CallSourceKind;
  self: boolean;
}

export interface DiagramLayout {
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: RoutedEdge[];
  /** Out-of-scope callees per function key. */
  stubs: Record<string, number>;
}

/** Size of a function node: wide enough for its name, height grows moderately with LOC. */
export function functionNodeSize(name: string, loc: number | undefined): { width: number; height: number } {
  return {
    width: Math.max(60, name.length * CHAR_WIDTH + 18),
    height: NODE_BASE_HEIGHT + Math.min(NODE_MAX_EXTRA_HEIGHT, Math.round(Math.sqrt(Math.max(loc ?? 1, 1)))),
  };
}

interface CallEdgeRef {
  key: string;
  fromKey: string;
  toKey: string;
  confidence: CallConfidence;
  source: CallSourceKind;
}

/** Call edges between diagram nodes; callees outside the diagram become stub counts. */
export function collectDiagramEdges(
  data: CallDiagramData,
  model: DiagramNode
): { edges: CallEdgeRef[]; stubs: Record<string, number> } {
  const keys = new Set<string>();
  const fileFrame = new Map<string, string>();
  const walk = (n: DiagramNode) => {
    keys.add(n.key);
    if (n.kind === 'file' && n.file) fileFrame.set(n.file, n.key);
    n.children.forEach(walk);
  };
  walk(model);

  const edges: CallEdgeRef[] = [];
  const stubs: Record<string, number> = {};
  const seen = new Set<string>();
  for (const e of data.callGraph.edges) {
    const fromKey = typeof e.from === 'string' ? (keys.has(e.from) ? e.from : undefined) : fileFrame.get(e.from.file.replace(/^\/+/, ''));
    const toKey = keys.has(e.to) ? e.to : undefined;
    if (fromKey && !toKey && typeof e.from === 'string') {
      stubs[fromKey] = (stubs[fromKey] ?? 0) + 1;
      continue;
    }
    if (!fromKey || !toKey) continue;
    const key = `${fromKey}->${toKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ key, fromKey, toKey, confidence: e.confidence, source: e.source });
  }
  return { edges, stubs };
}

/** ELK graph of the diagram: frames as compound nodes, functions as leaves, calls at the root. */
export function toElkGraph(model: DiagramNode, edges: CallEdgeRef[]): ElkNode {
  const convert = (n: DiagramNode): ElkNode => {
    if (n.kind === 'function') {
      return { id: n.key, ...functionNodeSize(n.name, n.loc) };
    }
    return {
      id: n.key,
      layoutOptions: { 'elk.padding': FRAME_PADDING },
      // a frame without functions (e.g. an XML file referencing functions) still needs a size
      ...(n.children.length === 0 ? { width: Math.max(80, n.name.length * CHAR_WIDTH + 20), height: FRAME_LABEL_HEIGHT + 14 } : {}),
      children: n.children.map(convert),
    };
  };
  return {
    id: '__root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'SPLINES',
      'elk.spacing.nodeNode': '18',
      'elk.layered.spacing.nodeNodeBetweenLayers': '34',
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
    },
    children: [convert(model)],
    edges: edges
      .filter((e) => !(e.fromKey === e.toKey))
      .map((e): ElkExtendedEdge => ({ id: e.key, sources: [e.fromKey], targets: [e.toKey] })),
  };
}

/** The part of the ELK API the layout needs (worker-backed in the webview, bundled in tests). */
export interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>;
}

/** Layered flow layout (ELK): calls run top to bottom inside and across nested frames. */
export async function computeDiagramLayout(data: CallDiagramData, model: DiagramNode, elk: ElkLike): Promise<DiagramLayout> {
  const { edges, stubs } = collectDiagramEdges(data, model);
  const result = await elk.layout(toElkGraph(model, edges));

  // ELK coordinates are relative to the parent node: make them absolute
  const modelByKey = new Map<string, DiagramNode>();
  const indexModel = (n: DiagramNode) => {
    modelByKey.set(n.key, n);
    n.children.forEach(indexModel);
  };
  indexModel(model);

  const nodes: LaidOutNode[] = [];
  const offset = new Map<string, { x: number; y: number }>([['__root__', { x: 0, y: 0 }]]);
  const parentOf = new Map<string, string>();
  const visit = (n: ElkNode, parentKey: string, ox: number, oy: number, depth: number) => {
    const x = ox + (n.x ?? 0);
    const y = oy + (n.y ?? 0);
    offset.set(n.id, { x, y });
    parentOf.set(n.id, parentKey);
    const d = modelByKey.get(n.id);
    if (d) {
      nodes.push({
        key: d.key,
        kind: d.kind,
        name: d.name,
        depth,
        parentKey: parentKey === '__root__' ? undefined : parentKey,
        x0: x,
        y0: y,
        x1: x + (n.width ?? 0),
        y1: y + (n.height ?? 0),
        data: { ...d, children: [] },
      });
    }
    (n.children ?? []).forEach((c) => visit(c, n.id, x, y, depth + 1));
  };
  (result.children ?? []).forEach((c) => visit(c, '__root__', 0, 0, 0));

  // Edge sections are relative to the lowest common ancestor of source and target
  const ancestors = (id: string): string[] => {
    const chain: string[] = [];
    let p = parentOf.get(id);
    while (p) {
      chain.push(p);
      p = parentOf.get(p);
    }
    return chain;
  };
  const lcaOffset = (a: string, b: string) => {
    const bs = new Set(ancestors(b));
    const lca = ancestors(a).find((x) => bs.has(x)) ?? '__root__';
    return offset.get(lca) ?? { x: 0, y: 0 };
  };

  const elkEdges = new Map((result.edges ?? []).map((e) => [e.id, e as ElkExtendedEdge]));
  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));
  const center = (key: string): [number, number] => {
    const n = nodeByKey.get(key);
    return n ? [(n.x0 + n.x1) / 2, (n.y0 + n.y1) / 2] : [0, 0];
  };

  const routed: RoutedEdge[] = edges.map((e) => {
    const self = e.fromKey === e.toKey;
    const section = elkEdges.get(e.key)?.sections?.[0];
    let points: [number, number][];
    if (section && !self) {
      const o = lcaOffset(e.fromKey, e.toKey);
      points = [
        [section.startPoint.x + o.x, section.startPoint.y + o.y],
        ...(section.bendPoints ?? []).map((p): [number, number] => [p.x + o.x, p.y + o.y]),
        [section.endPoint.x + o.x, section.endPoint.y + o.y],
      ];
    } else {
      points = [center(e.fromKey), center(e.toKey)];
    }
    return { ...e, points, self };
  });

  const root = nodes.find((n) => n.depth === 0);
  return {
    width: Math.max(result.width ?? 0, root?.x1 ?? 0) + 20,
    height: Math.max(result.height ?? 0, root?.y1 ?? 0) + 20,
    nodes,
    edges: routed,
    stubs,
  };
}
