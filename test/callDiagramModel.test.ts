import { describe, it, expect } from 'vitest';
import { TreeAggregator } from '../src/analyzer/treeAggregator';
import { CallGraphBuilder } from '../src/analyzer/calls/callGraphBuilder';
import { buildCallDiagramData } from '../src/analyzer/calls/diagramData';
import { buildDiagramModel, functionNodes, type DiagramNode } from '../webview/src/utils/callDiagram/model';
import { computeDiagramLayout, functionNodeSize, type DiagramLayout } from '../webview/src/utils/callDiagram/layout';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();
import type { AnalysisSnapshot, ParsedFileInfo } from '../src/analyzer/types';
import { parseJsWithCalls } from './calls/helpers';

function snapshotOf(files: ParsedFileInfo[], extraEdges: any[] = []): AnalysisSnapshot {
  const { tree, hotspots } = new TreeAggregator().buildTree(files, new Map());
  const callGraph = new CallGraphBuilder().build(files);
  callGraph.edges.push(...extraEdges);
  return { id: '1', workspacePath: '/ws', headCommitSha: '', totalFiles: files.length, totalLoc: 0, durationMs: 0, scannedAt: '', tree, hotspots, callGraph };
}

const files = [
  parseJsWithCalls('src/cart/cart.js', [
    'function Cart() {',
    '  this.add = function () {',
    '    this.validate();',
    '    function helper() {',
    '      return 1;',
    '    }',
    '  };',
    '  this.validate = function () {',
    '    persist();',
    '  };',
    '}',
  ]),
  parseJsWithCalls('src/store/store.js', ['function persist() {', '  return 1;', '}']),
  { filePath: 'src/ui/order.form', classes: [], methods: [], loc: 3, fileHash: 'h' } as ParsedFileInfo,
  { filePath: 'docs/readme.md', classes: [], methods: [], loc: 3, fileHash: 'h' } as ParsedFileInfo,
];
const locationEdge = { from: { file: 'src/ui/order.form', line: 2 }, to: 'src/cart/cart.js#Cart.add', confidence: 'certain', source: 'declarative' };

function find(root: DiagramNode, pred: (n: DiagramNode) => boolean): DiagramNode | undefined {
  if (pred(root)) return root;
  for (const c of root.children) {
    const f = find(c, pred);
    if (f) return f;
  }
  return undefined;
}

describe('buildDiagramModel', () => {
  const data = buildCallDiagramData(snapshotOf(files, [locationEdge]), '');
  const model = buildDiagramModel(data)!;

  it('nests functions in class, file and folder frames', () => {
    const add = find(model, (n) => n.fnId === 'src/cart/cart.js#Cart.add')!;
    expect(add.kind).toBe('function');
    const cls = find(model, (n) => n.kind === 'class' && n.children.includes(add))!;
    expect(cls.name).toBe('Cart');
    const file = find(model, (n) => n.kind === 'file' && n.children.includes(cls))!;
    expect(file.file).toBe('src/cart/cart.js');
    const folder = find(model, (n) => n.kind === 'folder' && n.children.includes(file))!;
    expect(folder.name).toBe('cart');
  });

  it('flattens nested helpers into the frame of their method', () => {
    const cls = find(model, (n) => n.kind === 'class' && n.name === 'Cart')!;
    expect(cls.children.map((c) => c.name).sort()).toEqual(['Cart', 'add', 'helper', 'validate']);
    expect(cls.children.every((c) => c.kind === 'function')).toBe(true);
  });

  it('compacts single-child folder chains and drops frames without functions', () => {
    const single = buildDiagramModel(buildCallDiagramData(snapshotOf([files[1]]), ''))!;
    expect(single.children.map((c) => c.name)).toEqual(['src/store']);
    expect(find(model, (n) => n.file === 'docs/readme.md')).toBeUndefined();
  });

  it('keeps file frames that reference functions declaratively', () => {
    expect(find(model, (n) => n.kind === 'file' && n.file === 'src/ui/order.form')).toBeDefined();
  });
});

describe('ELK flow layout', () => {
  const data = buildCallDiagramData(snapshotOf(files, [locationEdge]), '');
  const model = buildDiagramModel(data)!;

  it('places every node inside all of its ancestor frames', async () => {
    const { nodes } = await computeDiagramLayout(data, model, elk);
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    for (const n of nodes) {
      let p = n.parentKey ? byKey.get(n.parentKey) : undefined;
      while (p) {
        expect(n.x0).toBeGreaterThanOrEqual(p.x0 - 0.5);
        expect(n.y0).toBeGreaterThanOrEqual(p.y0 - 0.5);
        expect(n.x1).toBeLessThanOrEqual(p.x1 + 0.5);
        expect(n.y1).toBeLessThanOrEqual(p.y1 + 0.5);
        p = p.parentKey ? byKey.get(p.parentKey) : undefined;
      }
    }
    expect(functionNodes(model)).toHaveLength(nodes.filter((n) => n.kind === 'function').length);
  });

  it('places callers above their callees in a call chain', async () => {
    const chain = [
      parseJsWithCalls('src/r/resolver.js', [
        'function Resolver() {',
        '  this.collect = function () {',
        '    this.resolveSite();',
        '  };',
        '  this.resolveSite = function () {',
        '    this.resolveBare();',
        '  };',
        '  this.resolveBare = function () {',
        '    return 1;',
        '  };',
        '}',
      ]),
    ];
    const d = buildCallDiagramData(snapshotOf(chain), '');
    const { nodes } = await computeDiagramLayout(d, buildDiagramModel(d)!, elk);
    const y = (id: string) => nodes.find((n) => n.key === id)!.y0;
    expect(y('src/r/resolver.js#Resolver.collect')).toBeLessThan(y('src/r/resolver.js#Resolver.resolveSite'));
    expect(y('src/r/resolver.js#Resolver.resolveSite')).toBeLessThan(y('src/r/resolver.js#Resolver.resolveBare'));
  });

  it('lays out call cycles', async () => {
    const cyc = [parseJsWithCalls('c.js', ['function a() {', '  b();', '}', 'function b() {', '  a();', '}'])];
    const d = buildCallDiagramData(snapshotOf(cyc), '');
    const layout = await computeDiagramLayout(d, buildDiagramModel(d)!, elk);
    expect(layout.edges.map((e) => e.key).sort()).toEqual(['c.js#a->c.js#b', 'c.js#b->c.js#a']);
  });

  it('is deterministic for identical input', async () => {
    const pos = (l: DiagramLayout) => l.nodes.map((n) => [n.key, n.x0, n.y0, n.x1, n.y1]);
    expect(pos(await computeDiagramLayout(data, buildDiagramModel(data)!, elk))).toEqual(pos(await computeDiagramLayout(data, model, elk)));
  });

  it('sizes function nodes by name and bounded LOC', () => {
    expect(functionNodeSize('add', 1)).toEqual({ width: 60, height: 25 });
    expect(functionNodeSize('resolveAmdFiles', 10000).height).toBe(40);
  });
});

describe('edge routing', () => {
  it('routes intra-class and cross-folder edges with absolute points near their nodes', async () => {
    const data = buildCallDiagramData(snapshotOf(files, [locationEdge]), '');
    const layout = await computeDiagramLayout(data, buildDiagramModel(data)!, elk);
    const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
    const near = (p: [number, number], key: string) => {
      const n = byKey.get(key)!;
      return p[0] >= n.x0 - 2 && p[0] <= n.x1 + 2 && p[1] >= n.y0 - 2 && p[1] <= n.y1 + 2;
    };
    for (const key of ['src/cart/cart.js#Cart.add->src/cart/cart.js#Cart.validate', 'src/cart/cart.js#Cart.validate->src/store/store.js#persist']) {
      const e = layout.edges.find((x) => x.key === key)!;
      expect(e.points.length).toBeGreaterThanOrEqual(2);
      expect(near(e.points[0], e.fromKey)).toBe(true);
      expect(near(e.points[e.points.length - 1], e.toKey)).toBe(true);
    }
  });

  it('starts declarative edges at the file frame of the referencing file', async () => {
    const data = buildCallDiagramData(snapshotOf(files, [locationEdge]), '');
    const layout = await computeDiagramLayout(data, buildDiagramModel(data)!, elk);
    expect(layout.edges.find((e) => e.source === 'declarative')!.fromKey).toBe('file:src/ui/order.form');
  });

  it('turns callees outside the scope into stubs on the caller', async () => {
    const data = buildCallDiagramData(snapshotOf(files), 'src/cart');
    const layout = await computeDiagramLayout(data, buildDiagramModel(data)!, elk);
    expect(layout.stubs['src/cart/cart.js#Cart.validate']).toBe(1);
    expect(layout.edges.some((e) => e.toKey.includes('store'))).toBe(false);
  });

  it('marks self-calls', async () => {
    const rec = [parseJsWithCalls('w.js', ['function walk(n) {', '  return walk(n - 1);', '}'])];
    const d = buildCallDiagramData(snapshotOf(rec), '');
    const layout = await computeDiagramLayout(d, buildDiagramModel(d)!, elk);
    expect(layout.edges).toEqual([expect.objectContaining({ key: 'w.js#walk->w.js#walk', self: true })]);
  });
});
