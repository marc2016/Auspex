import { describe, it, expect } from 'vitest';
import {
  zoomBand, aggregationDepth, aggregateEdges, functionColor, neighborsOf, applyFilters, restoreSelection, cullToViewport,
} from '../webview/src/utils/callDiagram/view';
import { getHeatColor } from '../webview/src/components/TreemapViewer';
import { getCodeHealthColor } from '../webview/src/components/SystemMapViewer';
import type { DiagramLayout, LaidOutNode, RoutedEdge } from '../webview/src/utils/callDiagram/layout';

const n = (key: string, kind: any, depth: number, parentKey: string | undefined, rect: number[], data: any = {}): LaidOutNode => ({
  key, kind, name: key, depth, parentKey, x0: rect[0], y0: rect[1], x1: rect[2], y1: rect[3], data: { key, kind, name: key, children: [], ...data },
});
const nodes: LaidOutNode[] = [
  n('root', 'root', 0, undefined, [0, 0, 1000, 1000]),
  n('A', 'folder', 1, 'root', [0, 0, 500, 1000]),
  n('B', 'folder', 1, 'root', [500, 0, 1000, 1000]),
  n('a1', 'function', 2, 'A', [10, 20, 100, 60], { hotspot: true, churnScore: 0.9, codeHealth: 4 }),
  n('a2', 'function', 2, 'A', [10, 80, 100, 120]),
  n('b1', 'function', 2, 'B', [510, 20, 600, 60], { hotspot: true }),
];
const e = (from: string, to: string, confidence: 'certain' | 'inferred' = 'certain'): RoutedEdge => ({
  key: `${from}->${to}`, fromKey: from, toKey: to, points: [[0, 0], [1, 1]], confidence, source: 'js', self: from === to,
});
const edges = [e('a1', 'b1'), e('a2', 'b1', 'inferred'), e('a1', 'a2')];
const layout: DiagramLayout = { width: 1000, height: 1000, nodes, edges, stubs: {} };

describe('zoom levels', () => {
  it('selects bands by zoom factor', () => {
    expect(zoomBand(0.1)).toBe('far');
    expect(zoomBand(0.4)).toBe('middle');
    expect(zoomBand(1)).toBe('near');
  });

  it('chooses the aggregation depth from on-screen frame width', () => {
    expect(aggregationDepth(nodes, 0.1)).toBe(1);
    expect(aggregationDepth(nodes, 2)).toBe(1);
  });

  it('aggregates edges per frame pair with counts and hides intra-frame edges', () => {
    const agg = aggregateEdges(edges, nodes, 1);
    expect(agg).toEqual([expect.objectContaining({ fromKey: 'A', toKey: 'B', count: 2 })]);
  });
});

describe('colors', () => {
  it('uses the treemap color scales', () => {
    expect(functionColor(nodes[3], 'churn', false)).toBe(getHeatColor(0.9, false));
    expect(functionColor(nodes[3], 'health', true)).toBe(getCodeHealthColor(4));
  });
});

describe('interaction helpers', () => {
  it('computes neighbors and connecting edges', () => {
    const nb = neighborsOf('a1', edges);
    expect([...nb.nodes].sort()).toEqual(['a1', 'a2', 'b1']);
    expect([...nb.edges].sort()).toEqual(['a1->a2', 'a1->b1']);
  });

  it('hides inferred edges', () => {
    expect(applyFilters(layout, { hideInferred: true, hotspotsOnly: false }).edges.map((x) => x.key)).toEqual(['a1->b1', 'a1->a2']);
  });

  it('shows only hotspot functions, their frames and edges between them', () => {
    const v = applyFilters(layout, { hideInferred: false, hotspotsOnly: true });
    expect(v.nodes.map((x) => x.key).sort()).toEqual(['A', 'B', 'a1', 'b1', 'root']);
    expect(v.edges.map((x) => x.key)).toEqual(['a1->b1']);
  });

  it('keeps the selection only if the function still exists', () => {
    expect(restoreSelection('a1', layout)).toBe('a1');
    expect(restoreSelection('gone', layout)).toBeNull();
  });

  it('culls nodes outside the viewport', () => {
    expect(cullToViewport(nodes, { x0: 0, y0: 0, x1: 200, y1: 200 }).map((x) => x.key)).toEqual(['root', 'A', 'a1', 'a2']);
  });
});
