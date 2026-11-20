import { describe, it, expect } from 'vitest';
import { TreeAggregator } from '../src/analyzer/treeAggregator';
import { CallGraphBuilder } from '../src/analyzer/calls/callGraphBuilder';
import { buildCallDiagramData, type CallDiagramData } from '../src/analyzer/calls/diagramData';
import { buildDiagramModel, collapseModel, isBox, type DiagramNode } from '../webview/src/utils/callDiagram/model';
import { collectDiagramEdges } from '../webview/src/utils/callDiagram/layout';
import type { AnalysisSnapshot, ParsedFileInfo } from '../src/analyzer/types';
import { parseJsWithCalls } from './calls/helpers';

function snapshotOf(files: ParsedFileInfo[]): AnalysisSnapshot {
  const { tree, hotspots } = new TreeAggregator().buildTree(files, new Map());
  const callGraph = new CallGraphBuilder().build(files);
  return { id: '1', workspacePath: '/ws', headCommitSha: '', totalFiles: files.length, totalLoc: 0, durationMs: 0, scannedAt: '', tree, hotspots, callGraph };
}

function find(root: DiagramNode, pred: (n: DiagramNode) => boolean): DiagramNode | undefined {
  if (pred(root)) return root;
  for (const c of root.children) {
    const f = find(c, pred);
    if (f) return f;
  }
  return undefined;
}

const files = [
  parseJsWithCalls('src/cart/cart.js', [
    'function Cart() {',
    '  this.add = function () {',
    '    this.save();',
    '  };',
    '  this.save = function () {',
    '    persist();',
    '  };',
    '}',
    'function top1() {',
    '  persist();',
    '}',
  ]),
  parseJsWithCalls('src/store/store.js', ['function persist() {', '  return 1;', '}']),
];
const snapshot = snapshotOf(files);
const data = buildCallDiagramData(snapshot, '');
const model = buildDiagramModel(data)!;

describe('frame metrics', () => {
  it('copies LOC, Code Health and churn of the tree into file and class frames', () => {
    const fileTree = snapshot.tree.children![0].children![0].children![0];
    const file = find(model, (n) => n.key === 'file:src/cart/cart.js')!;
    expect(file).toMatchObject({ loc: fileTree.loc, codeHealth: fileTree.codeHealth, churnScore: fileTree.churnScore });
    const classTree = fileTree.children!.find((c) => c.type === 'class')!;
    const cls = find(model, (n) => n.key === 'class:src/cart/cart.js#Cart')!;
    expect(cls).toMatchObject({ loc: classTree.loc, codeHealth: classTree.codeHealth, startLine: 1 });
  });
});

describe('collapseModel', () => {
  it('returns the model unchanged at the function level', () => {
    expect(collapseModel(model, 'functions')).toBe(model);
  });

  it('turns every file frame into a box at the file level and keeps folder frames', () => {
    const files = collapseModel(model, 'files');
    const cart = find(files, (n) => n.key === 'file:src/cart/cart.js')!;
    expect(isBox(cart)).toBe(true);
    expect(cart.children).toEqual([]);
    expect(cart.members!.sort()).toEqual(['src/cart/cart.js#Cart', 'src/cart/cart.js#Cart.add', 'src/cart/cart.js#Cart.save', 'src/cart/cart.js#top1']);
    expect(find(files, (n) => n.kind === 'folder' && n.name === 'cart')!.children).toEqual([cart]);
    expect(find(files, (n) => n.kind === 'function' || n.kind === 'class')).toBeUndefined();
  });

  it('turns classes into boxes and groups loose functions per file at the class level', () => {
    const classes = collapseModel(model, 'classes');
    const file = find(classes, (n) => n.key === 'file:src/cart/cart.js')!;
    expect(isBox(file)).toBe(false);
    const cls = file.children.find((c) => c.kind === 'class')!;
    expect(cls.key).toBe('class:src/cart/cart.js#Cart');
    expect(cls.members!.sort()).toEqual(['src/cart/cart.js#Cart', 'src/cart/cart.js#Cart.add', 'src/cart/cart.js#Cart.save']);
    const loose = file.children.find((c) => c.kind === 'loose')!;
    expect(loose).toMatchObject({ key: 'loose:src/cart/cart.js', name: 'cart.js', members: ['src/cart/cart.js#top1'], loc: 3 });
  });

  it('merges nested containers into the outermost class and adds no loose box without loose functions', () => {
    const fn = (key: string): DiagramNode => ({ key, kind: 'function', name: key, children: [], loc: 2 });
    const hand: DiagramNode = {
      key: 'root:', kind: 'root', name: 'ws', children: [
        { key: 'file:a.js', kind: 'file', name: 'a.js', file: 'a.js', children: [
          { key: 'class:a.js#A', kind: 'class', name: 'A', children: [fn('a.js#A.m'), { key: 'class:a.js#A.Inner', kind: 'class', name: 'Inner', children: [fn('a.js#A.Inner.n')] }] },
        ] },
      ],
    };
    const file = collapseModel(hand, 'classes').children[0];
    expect(file.children.map((c) => c.key)).toEqual(['class:a.js#A']);
    expect(file.children[0].members).toEqual(['a.js#A.m', 'a.js#A.Inner.n']);
  });

  it('keeps declarative-only file frames as boxes without members at both levels', () => {
    const withRef = { ...model, children: [...model.children, { key: 'file:views/cart.xml', kind: 'file' as const, name: 'cart.xml', file: 'views/cart.xml', children: [] }] };
    for (const level of ['classes', 'files'] as const) {
      const box = find(collapseModel(withRef, level), (n) => n.key === 'file:views/cart.xml')!;
      expect(box.members).toEqual([]);
      expect(isBox(box)).toBe(true);
    }
  });
});

describe('combined edges', () => {
  // cart.js -> store.js: 3 certain + 2 inferred; cart.js -> log.js: 1 inferred
  const fn = (key: string, file: string): DiagramNode => ({ key, kind: 'function', name: key, children: [], file });
  const fileNode = (file: string, fns: string[]): DiagramNode => ({ key: `file:${file}`, kind: 'file', name: file, file, children: fns.map((f) => fn(f, file)) });
  const hand: DiagramNode = {
    key: 'root:', kind: 'root', name: 'ws', children: [
      { key: 'class:cart.js#Cart', kind: 'class', name: 'Cart', children: [] },
      fileNode('cart.js', ['c1', 'c2', 'c3', 'c4', 'c5']),
      fileNode('store.js', ['s1', 's2', 's3', 's4', 's5']),
      fileNode('log.js', ['l1']),
      { key: 'file:cart.xml', kind: 'file', name: 'cart.xml', file: 'cart.xml', children: [] },
    ],
  };
  const edge = (from: any, to: string, confidence: 'certain' | 'inferred', source: 'js' | 'declarative' = 'js') => ({ from, to, confidence, source });
  const graph = {
    functions: [],
    edges: [
      edge('c1', 's1', 'certain'), edge('c2', 's2', 'certain'), edge('c3', 's3', 'certain'),
      edge('c4', 's4', 'inferred'), edge('c5', 's5', 'inferred'),
      edge('c1', 'l1', 'inferred'),
      edge('c1', 'c2', 'certain'),
      edge('c1', 'outside', 'certain'),
      edge({ file: 'cart.xml', line: 2 }, 'c1', 'certain', 'declarative'),
    ],
  };
  const d = { ...data, callGraph: graph } as unknown as CallDiagramData;
  const collapsed = collapseModel(hand, 'files');
  const { edges, stubs } = collectDiagramEdges(d, collapsed);
  const byKey = new Map(edges.map((e) => [e.key, e]));

  it('combines calls between two files into one certain edge with counts', () => {
    expect(byKey.get('file:cart.js->file:store.js')).toMatchObject({ confidence: 'certain', certainCount: 3, inferredCount: 2 });
  });

  it('uses the inferred style when all calls are inferred', () => {
    expect(byKey.get('file:cart.js->file:log.js')).toMatchObject({ confidence: 'inferred', certainCount: 0, inferredCount: 1 });
  });

  it('drops calls within one box', () => {
    expect(byKey.has('file:cart.js->file:cart.js')).toBe(false);
  });

  it('counts out-of-scope callees as stubs on the box', () => {
    expect(stubs).toEqual({ 'file:cart.js': 1 });
  });

  it('keeps declarative edges from a referencing file to the box', () => {
    expect(byKey.get('file:cart.xml->file:cart.js')).toMatchObject({ source: 'declarative', certainCount: 1 });
  });

  it('keeps one edge per caller/callee pair at the function level', () => {
    const fnEdges = collectDiagramEdges(d, hand).edges;
    expect(fnEdges.find((e) => e.key === 'c1->c2')).toMatchObject({ certainCount: 1, inferredCount: 0 });
    expect(fnEdges.find((e) => e.key === 'c4->s4')).toMatchObject({ confidence: 'inferred', certainCount: 0, inferredCount: 1 });
    expect(fnEdges).toHaveLength(8);
  });
});

// ---- client-side logic on laid-out diagrams ---------------------------------------------------

import { applyFilters, findCycles, boxOf, boundaryByBox, isCursorOutside, layoutRequestFor, edgeCount } from '../webview/src/utils/callDiagram/view';
import type { DiagramLayout, LaidOutNode, RoutedEdge } from '../webview/src/utils/callDiagram/layout';

const box = (key: string, at: [number, number], extra: Partial<DiagramNode> = {}): LaidOutNode => ({
  key, kind: 'file', name: key, depth: 1, parentKey: 'root', x0: at[0], y0: at[1], x1: at[0] + 50, y1: at[1] + 20,
  data: { key, kind: 'file', name: key, children: [], members: [`${key}#fn`], ...extra },
});
const rootNode: LaidOutNode = { key: 'root', kind: 'root', name: 'ws', depth: 0, x0: 0, y0: 0, x1: 1000, y1: 1000, data: { key: 'root', kind: 'root', name: 'ws', children: [] } };
const ce = (from: string, to: string, certain: number, inferred = 0): RoutedEdge => ({
  key: `${from}->${to}`, fromKey: from, toKey: to, points: [[0, 0], [1, 1]],
  confidence: certain > 0 ? 'certain' : 'inferred', source: 'js', self: false, certainCount: certain, inferredCount: inferred,
});
const fileLayout = (nodes: LaidOutNode[], edges: RoutedEdge[]): DiagramLayout => ({ width: 1000, height: 1000, nodes: [rootNode, ...nodes], edges, stubs: {} });

describe('filters on combined edges', () => {
  const layout = fileLayout(
    [box('cart.js', [0, 0], { hotspot: true }), box('store.js', [0, 100], { hotspot: true }), box('log.js', [100, 100])],
    [ce('cart.js', 'store.js', 3, 2), ce('cart.js', 'log.js', 0, 1)]
  );

  it('removes inferred calls from combined edges and hides edges left without calls', () => {
    const v = applyFilters(layout, { hideInferred: true, hotspotsOnly: false });
    expect(v.edges.map((e) => [e.key, edgeCount(e)])).toEqual([['cart.js->store.js', 3]]);
    const all = applyFilters(layout, { hideInferred: false, hotspotsOnly: false });
    expect(all.edges.map((e) => edgeCount(e))).toEqual([5, 1]);
  });

  it('keeps hotspot boxes, their frames and the edges between them', () => {
    const v = applyFilters(layout, { hideInferred: false, hotspotsOnly: true });
    expect(v.nodes.map((n) => n.key)).toEqual(['root', 'cart.js', 'store.js']);
    expect(v.edges.map((e) => e.key)).toEqual(['cart.js->store.js']);
  });
});

describe('findCycles', () => {
  const show = (nodes: LaidOutNode[], edges: RoutedEdge[], hideInferred = false) =>
    findCycles(applyFilters(fileLayout(nodes, edges), { hideInferred, hotspotsOnly: false }));

  it('marks two files calling each other', () => {
    const c = show([box('cart.js', [0, 0]), box('store.js', [0, 100])], [ce('cart.js', 'store.js', 1), ce('store.js', 'cart.js', 1)]);
    expect(c.cycles).toEqual([['cart.js', 'store.js']]);
    expect([...c.edges].sort()).toEqual(['cart.js->store.js', 'store.js->cart.js']);
  });

  it('drops a cycle that exists only through inferred calls when they are hidden', () => {
    const nodes = [box('cart.js', [0, 0]), box('store.js', [0, 100])];
    const edges = [ce('cart.js', 'store.js', 1), ce('store.js', 'cart.js', 0, 1)];
    expect(show(nodes, edges).cycles).toHaveLength(1);
    const hidden = show(nodes, edges, true);
    expect(hidden.cycles).toEqual([]);
    expect(hidden.nodes.size + hidden.edges.size).toBe(0);
  });

  it('marks a longer cycle without the file that only calls into it', () => {
    const c = show(
      [box('a.js', [0, 0]), box('b.js', [0, 100]), box('c.js', [0, 200]), box('d.js', [100, 0])],
      [ce('a.js', 'b.js', 1), ce('b.js', 'c.js', 1), ce('c.js', 'a.js', 1), ce('d.js', 'a.js', 1)]
    );
    expect(c.cycles).toEqual([['a.js', 'b.js', 'c.js']]);
    expect(c.nodes.has('d.js')).toBe(false);
    expect([...c.edges].sort()).toEqual(['a.js->b.js', 'b.js->c.js', 'c.js->a.js']);
  });

  it('marks no cycles between function boxes', () => {
    const fn = (key: string, y: number): LaidOutNode => ({ ...box(key, [0, y]), kind: 'function', data: { key, kind: 'function', name: key, children: [] } });
    expect(show([fn('a', 0), fn('b', 100)], [ce('a', 'b', 1), ce('b', 'a', 1)]).cycles).toEqual([]);
  });

  it('orders cycles from top to bottom, then left to right', () => {
    const c = show(
      [box('x1', [300, 500]), box('x2', [300, 600]), box('y1', [500, 10]), box('y2', [500, 50]), box('z1', [0, 10]), box('z2', [0, 900])],
      [ce('x1', 'x2', 1), ce('x2', 'x1', 1), ce('y1', 'y2', 1), ce('y2', 'y1', 1), ce('z1', 'z2', 1), ce('z2', 'z1', 1)]
    );
    expect(c.cycles).toEqual([['z1', 'z2'], ['y1', 'y2'], ['x1', 'x2']]);
  });
});

describe('boxes of functions', () => {
  it('maps functions to their file box or loose box and sums focus boundaries per box', async () => {
    const elkMod = (await import('elkjs/lib/elk.bundled.js')).default;
    const { computeDiagramLayout } = await import('../webview/src/utils/callDiagram/layout');
    const files = await computeDiagramLayout(data, collapseModel(model, 'files'), new elkMod());
    expect(boxOf(files).get('src/cart/cart.js#Cart.add')).toBe('file:src/cart/cart.js');
    expect(isCursorOutside(files, 'src/cart/cart.js#Cart.add')).toBe(false);
    const classes = await computeDiagramLayout(data, collapseModel(model, 'classes'), new elkMod());
    expect(boxOf(classes).get('src/cart/cart.js#top1')).toBe('loose:src/cart/cart.js');
    expect(
      boundaryByBox(
        { 'src/cart/cart.js#Cart.add': { hiddenCallers: 1, hiddenCallees: 2 }, 'src/cart/cart.js#Cart.save': { hiddenCallers: 0, hiddenCallees: 3 } },
        boxOf(files)
      )
    ).toEqual({ 'file:src/cart/cart.js': { hiddenCallers: 1, hiddenCallees: 5 } });
  });

  it('adds the level to layout requests except at the function level', () => {
    expect(layoutRequestFor({ data, focusData: null, folderPath: '', focus: null, hideInferred: false, level: 'files' })).toEqual({ data, folderPath: undefined, level: 'files' });
    expect(layoutRequestFor({ data, focusData: null, folderPath: '', focus: null, hideInferred: false, level: 'functions' })).toEqual({ data, folderPath: undefined });
  });
});

describe('box sizes', () => {
  it('sizes loose-functions boxes for their longer label', async () => {
    const { toElkGraph, functionNodeSize } = await import('../webview/src/utils/callDiagram/layout');
    const graph = toElkGraph(collapseModel(model, 'classes'), []);
    const find = (n: any, id: string): any => (n.id === id ? n : (n.children ?? []).map((c: any) => find(c, id)).find(Boolean));
    expect(find(graph, 'loose:src/cart/cart.js').width).toBe(functionNodeSize('cart.js (Funktionen)', 3).width);
    expect(find(graph, 'class:src/cart/cart.js#Cart').width).toBe(functionNodeSize('Cart', 8).width);
  });
});
