import { describe, it, expect } from 'vitest';
import { computeFocus, FOCUS_DEPTH_ALL } from '../../src/analyzer/calls/focus';
import type { CallEdge, CallGraph } from '../../src/analyzer/calls/types';

const fn = (id: string) => ({ id, file: id.split('#')[0], qualifiedName: id.split('#')[1], startLine: 1, endLine: 2 });
const e = (from: string, to: string, confidence: 'certain' | 'inferred' = 'certain'): CallEdge => ({ from, to, confidence, source: 'js' });
const graph = (edges: CallEdge[]): CallGraph => {
  const ids = new Set<string>();
  for (const x of edges) {
    if (typeof x.from === 'string') ids.add(x.from);
    ids.add(x.to);
  }
  return { functions: [...ids].map(fn), edges, counts: {} };
};
const opts = (up: number, down: number, includeInferred = true) => ({ up, down, includeInferred });

const chain = graph([
  e('ui.js#onSubmit', 'ui.js#saveOrder'),
  e('ui.js#onClick', 'ui.js#saveOrder'),
  e('ui.js#onKey', 'ui.js#saveOrder'),
  e('ui.js#saveOrder', 'cart.js#Cart.add'),
  e('cart.js#Cart.add', 'store.js#Store.persist'),
  e('store.js#Store.persist', 'fs.js#writeFile'),
]);

describe('computeFocus', () => {
  it('collects the caller chain and callees up to the depths', () => {
    const r = computeFocus(chain, 'cart.js#Cart.add', opts(2, 1));
    expect([...r.functions].sort()).toEqual(
      ['cart.js#Cart.add', 'store.js#Store.persist', 'ui.js#onClick', 'ui.js#onKey', 'ui.js#onSubmit', 'ui.js#saveOrder'].sort()
    );
    expect(r.functions.has('fs.js#writeFile')).toBe(false);
    expect(r.edges).toHaveLength(5);
  });

  it('shows only the start function with depth 0', () => {
    expect([...computeFocus(chain, 'cart.js#Cart.add', opts(0, 0)).functions]).toEqual(['cart.js#Cart.add']);
  });

  it('follows all levels with "all"', () => {
    const long = graph(Array.from({ length: 15 }, (_, i) => e(`a.js#f${i + 1}`, i === 0 ? 'a.js#target' : `a.js#f${i}`)));
    expect(computeFocus(long, 'a.js#target', opts(FOCUS_DEPTH_ALL, 0)).functions.size).toBe(16);
  });

  it('visits each function once in cycles and keeps both edges', () => {
    const r = computeFocus(graph([e('c.js#a', 'c.js#b'), e('c.js#b', 'c.js#a')]), 'c.js#a', opts(0, FOCUS_DEPTH_ALL));
    expect([...r.functions].sort()).toEqual(['c.js#a', 'c.js#b']);
    expect(r.edges).toHaveLength(2);
  });

  it('does not traverse inferred edges when they are hidden', () => {
    const g = graph([e('x.js#x', 'cart.js#Cart.add', 'inferred'), e('y.js#y', 'cart.js#Cart.add')]);
    expect([...computeFocus(g, 'cart.js#Cart.add', opts(1, 0, false)).functions].sort()).toEqual(['cart.js#Cart.add', 'y.js#y']);
    expect(computeFocus(g, 'cart.js#Cart.add', opts(1, 0, true)).functions.has('x.js#x')).toBe(true);
  });

  it('includes location callers on the caller side', () => {
    const g = graph([e('a.js#a', 'cart.js#Cart.add')]);
    g.edges.push({ from: { file: 'order.form', line: 12 }, to: 'cart.js#Cart.add', confidence: 'certain', source: 'declarative' });
    const r = computeFocus(g, 'cart.js#Cart.add', opts(1, 0));
    expect(r.locations).toEqual([{ file: 'order.form', line: 12 }]);
    expect(r.edges.some((x) => typeof x.from !== 'string')).toBe(true);
  });

  it('reports hidden callers and callees at the depth limit', () => {
    const r = computeFocus(chain, 'cart.js#Cart.add', opts(1, 1));
    expect(r.boundary['ui.js#saveOrder']).toEqual({ hiddenCallers: 3, hiddenCallees: 0 });
    expect(r.boundary['store.js#Store.persist']).toEqual({ hiddenCallers: 0, hiddenCallees: 1 });
    expect(r.boundary['cart.js#Cart.add']).toBeUndefined();
  });
});

import { focusTargetAt, parseOpenCallDiagramArg } from '../../src/analyzer/calls/focus';

describe('focus entry point helpers', () => {
  it('parses scope strings and focus arguments of auspex.openCallDiagram', () => {
    expect(parseOpenCallDiagramArg('src/cart')).toEqual({ scopePath: 'src/cart' });
    expect(parseOpenCallDiagramArg({ focus: { file: 'a.js', startLine: 3 } })).toEqual({ scopePath: '', focus: { file: 'a.js', startLine: 3 } });
    expect(parseOpenCallDiagramArg(undefined)).toEqual({ scopePath: '' });
    expect(parseOpenCallDiagramArg({ focus: { file: 'a.js' } })).toEqual({ scopePath: '' });
  });

  it('finds the function at a line or nothing', () => {
    const service = {
      findFunctionAt: (file: string, line: number) =>
        file === 'src/cart.js' && line >= 2 && line <= 5 ? { id: 'src/cart.js#Cart.add', qualifiedName: 'Cart.add' } : undefined,
    };
    expect(focusTargetAt(service, '/src/cart.js', 3)).toEqual({ fnId: 'src/cart.js#Cart.add', label: 'Cart.add' });
    expect(focusTargetAt(service, 'src/cart.js', 9)).toBeUndefined();
  });
});
