import { describe, it, expect } from 'vitest';
import {
  zoomBand, aggregationDepth, aggregateEdges, functionColor, neighborsOf, applyFilters, restoreSelection, cullToViewport,
  panIntoView, isCursorOutside,
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

import { FOCUS_DEPTH_OPTIONS, depthToNumber, isLargeFocus, layoutRequestFor, functionLabel } from '../webview/src/utils/callDiagram/view';

describe('focus helpers', () => {
  const data: any = { scopePath: '', tree: {}, callGraph: { functions: [{ id: 'a.js#Cart.add', qualifiedName: 'Cart.add' }], edges: [], counts: {} }, hotspotFiles: [] };
  const focusData: any = { ...data, scopePath: '' };

  it('offers depths 0-10 and all', () => {
    expect(FOCUS_DEPTH_OPTIONS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'all']);
    expect(depthToNumber('all')).toBe(Infinity);
    expect(depthToNumber(3)).toBe(3);
  });

  it('warns above 300 functions', () => {
    expect(isLargeFocus(300)).toBe(false);
    expect(isLargeFocus(301)).toBe(true);
    expect(isLargeFocus(undefined)).toBe(false);
  });

  it('requests the focus on workspace data and restores the scope request when leaving focus', () => {
    const focus = { fnId: 'a.js#Cart.add', label: 'Cart.add', up: 3 as const, down: 'all' as const };
    expect(layoutRequestFor({ data, focusData: null, folderPath: 'src', focus, hideInferred: false })).toBeUndefined();
    expect(layoutRequestFor({ data, focusData, folderPath: 'src', focus, hideInferred: true })).toEqual({
      data: focusData,
      focus: { fnId: 'a.js#Cart.add', up: 3, down: Infinity, includeInferred: false },
    });
    expect(layoutRequestFor({ data, focusData, folderPath: 'src', focus: null, hideInferred: true })).toEqual({ data, folderPath: 'src' });
  });

  it('labels functions with their qualified name', () => {
    expect(functionLabel(data, 'a.js#Cart.add')).toBe('Cart.add');
    expect(functionLabel(null, 'b.js#x')).toBe('x');
  });
});

describe('cursor marker', () => {
  const view = { x0: 0, y0: 0, x1: 100, y1: 100 };

  it('does not pan when the box is visible', () => {
    expect(panIntoView({ x0: 10, y0: 10, x1: 50, y1: 50 }, view, 5)).toBeNull();
  });

  it('pans by the minimal delta when the box is outside', () => {
    expect(panIntoView({ x0: 150, y0: 10, x1: 180, y1: 40 }, view, 5)).toEqual({ dx: 85, dy: 0 });
    expect(panIntoView({ x0: -40, y0: 120, x1: -10, y1: 140 }, view, 5)).toEqual({ dx: -45, dy: 45 });
  });

  it('aligns a box larger than the viewport to its top-left corner', () => {
    expect(panIntoView({ x0: 50, y0: 0, x1: 300, y1: 50 }, view, 5)).toEqual({ dx: 45, dy: 0 });
  });

  it('detects a cursor function outside the diagram', () => {
    expect(isCursorOutside(layout, 'a1')).toBe(false);
    expect(isCursorOutside(layout, 'zz')).toBe(true);
    expect(isCursorOutside(layout, null)).toBe(false);
    expect(isCursorOutside(null, 'zz')).toBe(false);
  });
});
