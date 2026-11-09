import { describe, it, expect } from 'vitest';
import { CallGraphBuilder, mergeEdges } from '../../src/analyzer/calls/callGraphBuilder';
import { resolveAmdFiles } from '../../src/analyzer/calls/callResolver';
import type { CallEdge, CallEdgeSource, CallGraph } from '../../src/analyzer/calls/types';
import { parseJsWithCalls } from './helpers';

const build = (files: Record<string, string[]>): CallGraph =>
  new CallGraphBuilder().build(Object.entries(files).map(([p, src]) => parseJsWithCalls(p, src)));

const edge = (g: CallGraph, from: string, to: string) =>
  g.edges.find((e) => e.from === from && e.to === to);

describe('JsCallResolver', () => {
  it('resolves calls within the same file', () => {
    const g = build({ 'a.js': ['function save() {', '  validate();', '}', 'function validate() {', '  return 1;', '}'] });
    expect(edge(g, 'a.js#save', 'a.js#validate')).toMatchObject({ confidence: 'certain', source: 'js' });
  });

  it('ignores library calls', () => {
    const g = build({ 'a.js': ['function f(x) {', '  JSON.parse(x);', '  console.log(x);', '}'] });
    expect(g.edges).toHaveLength(0);
  });

  it('records recursion', () => {
    const g = build({ 'a.js': ['function walk(n) {', '  return walk(n - 1);', '}'] });
    expect(edge(g, 'a.js#walk', 'a.js#walk')?.confidence).toBe('certain');
  });

  it('resolves this calls to the same container', () => {
    const g = build({
      'cart.js': [
        'function Cart() {',
        '  this.add = function () {',
        '    this.validate();',
        '  };',
        '  this.validate = function () {',
        '    return true;',
        '  };',
        '}',
      ],
    });
    expect(edge(g, 'cart.js#Cart.add', 'cart.js#Cart.validate')?.confidence).toBe('certain');
  });

  it('resolves self calls inside callbacks', () => {
    const g = build({
      'cart.js': [
        'function Cart(items) {',
        '  var self = this;',
        '  this.add = function () {',
        '    return 1;',
        '  };',
        '  this.load = function () {',
        '    items.forEach(function () {',
        '      self.add();',
        '    });',
        '  };',
        '}',
      ],
    });
    expect(edge(g, 'cart.js#Cart.load', 'cart.js#Cart.add')).toBeDefined();
  });

  it('resolves private helpers of a constructor from its methods', () => {
    const g = build({
      'cart.js': [
        'function Cart() {',
        '  function validate(i) {',
        '    return !!i;',
        '  }',
        '  this.add = function (x) {',
        '    validate(x);',
        '  };',
        '}',
      ],
    });
    expect(edge(g, 'cart.js#Cart.add', 'cart.js#Cart > validate')?.confidence).toBe('certain');
  });

  it('resolves calls across AMD modules', () => {
    const g = build({
      'app/cart.js': [
        "define(['app/Store'], function (Store) {",
        '  function save() {',
        '    Store.persist();',
        '  }',
        '  return save;',
        '});',
      ],
      'app/Store.js': [
        'define([], function () {',
        '  function Store() {',
        '    this.persist = function () {',
        '      return 1;',
        '    };',
        '  }',
        '  return Store;',
        '});',
      ],
    });
    expect(edge(g, 'app/cart.js#save', 'app/Store.js#Store.persist')?.confidence).toBe('certain');
  });

  it('produces no edges for unresolvable AMD dependencies', () => {
    const g = build({
      'a.js': ["define(['lib/jquery'], function ($) {", '  function f() {', '    $.ajax();', '  }', '});'],
    });
    expect(g.edges).toHaveLength(0);
  });

  it('creates one inferred edge per candidate for ambiguous names', () => {
    const g = build({
      'a.js': ['function save() {', '  render();', '}'],
      'b.js': ['function render() {', '  return 1;', '}'],
      'c.js': ['function render() {', '  return 2;', '}'],
    });
    expect(edge(g, 'a.js#save', 'b.js#render')?.confidence).toBe('inferred');
    expect(edge(g, 'a.js#save', 'c.js#render')?.confidence).toBe('inferred');
  });

  it('marks a unique name from another file as inferred', () => {
    const g = build({
      'a.js': ['function save() {', '  formatPrice();', '}'],
      'b.js': ['function formatPrice() {', '  return 1;', '}'],
    });
    expect(g.edges).toEqual([{ from: 'a.js#save', to: 'b.js#formatPrice', confidence: 'inferred', source: 'js' }]);
  });

  it('resolves receivers named like a container', () => {
    const g = build({
      'a.js': ['function save() {', '  Store.persist();', '}'],
      'b.js': ['var Store = {', '  persist: function () {', '    return 1;', '  }', '};'],
    });
    expect(edge(g, 'a.js#save', 'b.js#Store.persist')?.confidence).toBe('certain');
  });

  it('computes caller and callee counts', () => {
    const g = build({
      'a.js': ['function a() {', '  b();', '  c();', '}', 'function b() {', '  c();', '}', 'function c() {', '  return 1;', '}'],
    });
    expect(g.counts['a.js#a']).toEqual({ callers: 0, callees: 2 });
    expect(g.counts['a.js#c']).toEqual({ callers: 2, callees: 0 });
  });
});

describe('resolveAmdFiles', () => {
  const files = new Set(['src/app/Store.js', 'src/app/cart.js', 'lib/util.ts']);

  it('resolves relative ids against the importing file', () => {
    expect(resolveAmdFiles('./Store', 'src/app/cart.js', files)).toEqual(['src/app/Store.js']);
  });

  it('resolves root-relative ids and strips plugins', () => {
    expect(resolveAmdFiles('lib/util', 'src/app/cart.js', files)).toEqual(['lib/util.ts']);
    expect(resolveAmdFiles('text!lib/util', 'x.js', files)).toEqual(['lib/util.ts']);
  });

  it('falls back to a path suffix match for unknown base urls', () => {
    expect(resolveAmdFiles('app/Store', 'x.js', files)).toEqual(['src/app/Store.js']);
    expect(resolveAmdFiles('missing/Mod', 'x.js', files)).toEqual([]);
  });
});

describe('CallGraphBuilder', () => {
  const files = [parseJsWithCalls('a.js', ['function save() {', '  return 1;', '}', 'function persist() {', '  return 2;', '}'])];

  it('keeps one edge per pair with the highest confidence', () => {
    const merged = mergeEdges([
      { from: 'a.js#save', to: 'a.js#persist', confidence: 'inferred', source: 'js' },
      { from: 'a.js#save', to: 'a.js#persist', confidence: 'certain', source: 'js' },
    ]);
    expect(merged).toEqual([{ from: 'a.js#save', to: 'a.js#persist', confidence: 'certain', source: 'js' }]);
  });

  it('accepts location callers from registered sources', () => {
    const declarative: CallEdgeSource = {
      kind: 'declarative',
      collect: (): CallEdge[] => [
        { from: { file: 'order.form', line: 12 }, to: 'a.js#save', confidence: 'certain', source: 'declarative' },
      ],
    };
    const builder = new CallGraphBuilder();
    builder.register(declarative);
    const g = builder.build(files);
    expect(g.edges).toContainEqual({
      from: { file: 'order.form', line: 12 },
      to: 'a.js#save',
      confidence: 'certain',
      source: 'declarative',
    });
    expect(g.counts['a.js#save']).toEqual({ callers: 1, callees: 0 });
  });

  it('drops edges to unknown functions and survives failing sources', () => {
    const builder = new CallGraphBuilder([
      { kind: 'js', collect: () => [{ from: 'a.js#save', to: 'nope.js#x', confidence: 'certain', source: 'js' }] },
      { kind: 'declarative', collect: () => { throw new Error('boom'); } },
    ]);
    expect(builder.build(files).edges).toEqual([]);
  });
});
