import { describe, it, expect } from 'vitest';
import { sanitizeSource, extractAmdDependencies } from '../../src/analyzer/calls/callSiteExtractor';
import { parseJsWithCalls } from './helpers';

const sitesOf = (src: string[]) =>
  (parseJsWithCalls('a.js', src).callSites ?? []).map((s) => ({
    caller: s.callerName,
    callee: s.callee,
    kind: s.receiverKind,
    receiver: s.receiver,
    line: s.line,
  }));

describe('sanitizeSource', () => {
  it('blanks strings, comments and regex literals but keeps template expressions', () => {
    const src = [
      "var a = 'foo()'; // bar()",
      'var b = "x(" + /baz\\(/.test(s);',
      '/* qux() */ var c = `t(${run()})`;',
    ];
    const out = sanitizeSource(src);
    expect(out[0]).not.toContain('foo(');
    expect(out[0]).not.toContain('bar(');
    expect(out[1]).not.toContain('baz');
    expect(out[1]).toContain('.test(');
    expect(out[2]).not.toContain('qux(');
    expect(out[2]).toContain('run()');
    expect(out[2]).not.toContain('t(');
    out.forEach((l, i) => expect(l.length).toBe(src[i].length));
  });

  it('keeps line count and line lengths', () => {
    const src = ['var s = `multi', 'line ${x()}', 'end`;', '/* a', 'b */ go();'];
    const out = sanitizeSource(src);
    expect(out).toHaveLength(src.length);
    out.forEach((l, i) => expect(l.length).toBe(src[i].length));
    expect(out[1]).toContain('x()');
    expect(out[4]).toContain('go()');
  });
});

describe('extractCallSites', () => {
  it('finds bare calls and attributes nested function lines to the nested function', () => {
    const sites = sitesOf([
      'function save() {',
      '  validate();',
      '  function helper() {',
      '    format();',
      '  }',
      '}',
    ]);
    expect(sites).toEqual([
      { caller: 'save()', callee: 'validate', kind: 'none', receiver: undefined, line: 2 },
      { caller: 'save > helper()', callee: 'format', kind: 'none', receiver: undefined, line: 4 },
    ]);
  });

  it('classifies this, aliases inside callbacks, AMD params and other receivers', () => {
    const sites = sitesOf([
      "define(['app/Store'], function (Store) {",
      '  function Cart() {',
      '    var self = this;',
      '    this.add = function () {',
      '      this.validate();',
      '      Store.persist();',
      '      JSON.parse(x);',
      '    };',
      '    this.load = function () {',
      '      items.forEach(function () {',
      '        self.add();',
      '      });',
      '    };',
      '  }',
      '});',
    ]);
    const byCallee = Object.fromEntries(sites.map((s) => [s.callee, s]));
    expect(byCallee.validate).toMatchObject({ caller: 'add()', kind: 'this' });
    expect(byCallee.persist).toMatchObject({ caller: 'add()', kind: 'amd', receiver: 'Store' });
    expect(byCallee.parse).toMatchObject({ kind: 'other', receiver: 'JSON' });
    expect(byCallee.add).toMatchObject({ caller: 'load()', kind: 'this', line: 11 });
    expect(byCallee.forEach).toMatchObject({ kind: 'other', receiver: 'items' });
  });

  it('ignores calls inside strings and comments', () => {
    const sites = sitesOf([
      'function f() {',
      "  log('save()');",
      '  // persist();',
      '  /* remove() */',
      '}',
    ]);
    expect(sites.map((s) => s.callee)).toEqual(['log']);
  });

  it('resolves only the first segment of chained calls and keeps deep receivers', () => {
    const sites = sitesOf(['function f() {', '  a().b();', '  self.items.push(1);', '}']);
    expect(sites.map((s) => [s.callee, s.kind, s.receiver])).toEqual([
      ['a', 'none', undefined],
      ['push', 'other', 'self.items'],
    ]);
  });

  it('does not report keywords, declarations or method shorthand definitions as calls', () => {
    const sites = sitesOf([
      'var Store = {',
      '  persist(x) {',
      '    if (x) { return format(x); }',
      '    for (var i = 0; i < 1; i++) {}',
      '  }',
      '};',
    ]);
    expect(sites.map((s) => s.callee)).toEqual(['format']);
  });

  it('records recursive calls', () => {
    const sites = sitesOf(['function walk(n) {', '  return walk(n - 1);', '}']);
    expect(sites.map((s) => s.callee)).toEqual(['walk']);
  });
});

describe('extractAmdDependencies', () => {
  it('returns undefined without define header', () => {
    expect(extractAmdDependencies(['function a() {}'])).toBeUndefined();
  });

  it('handles no, one and several dependencies', () => {
    expect(extractAmdDependencies(['define([], function () {', '});'])).toEqual({});
    expect(extractAmdDependencies(["define(['a/B'], function (B) {"])).toEqual({ B: 'a/B' });
    expect(
      extractAmdDependencies(["define(['a/B', \"c/D\", 'e'], function (B, D, E) {"])
    ).toEqual({ B: 'a/B', D: 'c/D', E: 'e' });
  });

  it('handles multi-line headers, module ids and require()', () => {
    expect(
      extractAmdDependencies(["define('my/mod', [", "  'a/B',", "  'c/D'", '], function (', '  B,', '  D', ') {'])
    ).toEqual({ B: 'a/B', D: 'c/D' });
    expect(extractAmdDependencies(["require(['x'], function (X) {"])).toEqual({ X: 'x' });
  });

  it('maps only as many params as there are dependencies', () => {
    expect(extractAmdDependencies(["define(['a', 'b'], function (A) {"])).toEqual({ A: 'a' });
    expect(extractAmdDependencies(["define(['a'], function (A, require) {"])).toEqual({ A: 'a' });
  });
});
