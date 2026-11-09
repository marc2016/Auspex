import { describe, it, expect } from 'vitest';
import { buildCallTreeRows, pathKey, type ChildrenState } from '../webview/src/utils/callTree';
import type { CallEntry } from '../src/analyzer/calls/viewModel';

const fn = (id: string, expandable = true, extra: Partial<CallEntry> = {}): CallEntry => ({
  key: id, id, label: id, file: 'a.js', line: 1, location: false, expandable, ...extra,
});

describe('buildCallTreeRows', () => {
  it('lists roots and only shows children of expanded, loaded entries', () => {
    const roots = [fn('b'), fn('c', false)];
    const keyB = pathKey('outgoing', ['a', 'b']);
    const children = new Map<string, ChildrenState>([[keyB, { loading: false, items: [fn('d')] }]]);

    expect(buildCallTreeRows('outgoing', 'a', roots, new Set(), children).map((r) => r.entry.id)).toEqual(['b', 'c']);

    const rows = buildCallTreeRows('outgoing', 'a', roots, new Set([keyB]), children);
    expect(rows.map((r) => [r.entry.id, r.depth])).toEqual([['b', 0], ['d', 1], ['c', 0]]);
    expect(rows[0]).toMatchObject({ expanded: true, canExpand: true });
    expect(rows[2].canExpand).toBe(false);
  });

  it('marks entries already on the path as recursive and not expandable', () => {
    const keyB = pathKey('outgoing', ['a', 'b']);
    const children = new Map<string, ChildrenState>([[keyB, { loading: false, items: [fn('a')] }]]);
    const rows = buildCallTreeRows('outgoing', 'a', [fn('b')], new Set([keyB]), children);
    expect(rows[1]).toMatchObject({ recursive: true, canExpand: false, depth: 1 });
  });

  it('reports loading state and never expands location callers', () => {
    const loc: CallEntry = { key: 'order.form:12', label: 'order.form:12', file: 'order.form', line: 12, location: true, expandable: false };
    const keyB = pathKey('incoming', ['a', 'b']);
    const rows = buildCallTreeRows('incoming', 'a', [fn('b'), loc], new Set([keyB]), new Map([[keyB, { loading: true }]]));
    expect(rows[0].loading).toBe(true);
    expect(rows[1]).toMatchObject({ canExpand: false, recursive: false });
  });
});

describe('folderOfFile', () => {
  it('returns the containing folder of a workspace-relative file', async () => {
    const { folderOfFile } = await import('../webview/src/utils/callTree');
    expect(folderOfFile('src/cart/cart.js')).toBe('src/cart');
    expect(folderOfFile('/root.js')).toBe('');
  });
});
