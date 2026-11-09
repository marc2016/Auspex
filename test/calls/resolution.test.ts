import { describe, it, expect } from 'vitest';
import { CallGraphBuilder } from '../../src/analyzer/calls/callGraphBuilder';
import { resolveModuleFile, BUILTIN_METHOD_NAMES } from '../../src/analyzer/calls/callResolver';
import type { CallGraph } from '../../src/analyzer/calls/types';
import { parseJsWithCalls } from './helpers';

const build = (files: Record<string, string[]>): CallGraph =>
  new CallGraphBuilder().build(Object.entries(files).map(([p, src]) => parseJsWithCalls(p, src)));
const edgesFrom = (g: CallGraph, from: string) => g.edges.filter((e) => e.from === from).map((e) => [e.to, e.confidence]);

const library = {
  'src/i18n.ts': ['export function resolveLanguage() {', '  return 1;', '}'],
  'src/store.ts': ['export function save() {', '  return 1;', '}', 'export class Store {', '  persist() {', '    return 1;', '  }', '}'],
  'src/util.ts': ['export function format() {', '  return 1;', '}'],
  'src/jobs/index.ts': ['export function run() {', '  return 1;', '}'],
  'src/index/functionIndex.ts': ['export class FunctionIndex {', '  get(id) {', '    return id;', '  }', '}'],
};

describe('resolveModuleFile', () => {
  const files = new Set(['src/i18n.ts', 'src/a/b.tsx', 'src/jobs/index.ts', 'src/legacy.js', 'src/esm.ts']);
  it('resolves extensions, .js specifiers of TS files and index files', () => {
    expect(resolveModuleFile('../i18n', 'src/a/x.ts', files)).toBe('src/i18n.ts');
    expect(resolveModuleFile('./b', 'src/a/x.ts', files)).toBe('src/a/b.tsx');
    expect(resolveModuleFile('./esm.js', 'src/x.ts', files)).toBe('src/esm.ts');
    expect(resolveModuleFile('./legacy.js', 'src/x.ts', files)).toBe('src/legacy.js');
    expect(resolveModuleFile('./jobs', 'src/x.ts', files)).toBe('src/jobs/index.ts');
  });

  it('returns nothing for packages and missing files', () => {
    expect(resolveModuleFile('path', 'src/x.ts', files)).toBeUndefined();
    expect(resolveModuleFile('./missing', 'src/x.ts', files)).toBeUndefined();
  });
});

describe('calls through ES imports and require', () => {
  it('resolves named, renamed, namespace, container, index and require imports as certain', () => {
    const g = build({
      ...library,
      'src/a/main.ts': [
        "import { resolveLanguage } from '../i18n';",
        "import { save as persistAll, Store } from '../store';",
        "import * as util from '../util';",
        "import { run } from '../jobs';",
        'export function main() {',
        '  resolveLanguage();',
        '  persistAll();',
        '  util.format();',
        '  Store.persist();',
        '  run();',
        '}',
      ],
      'src/legacy.js': ["const { format } = require('./util');", 'function old() {', '  format();', '}'],
    });
    expect(edgesFrom(g, 'src/a/main.ts#main').sort()).toEqual(
      [
        ['src/i18n.ts#resolveLanguage', 'certain'],
        ['src/store.ts#save', 'certain'],
        ['src/util.ts#format', 'certain'],
        ['src/store.ts#Store.persist', 'certain'],
        ['src/jobs/index.ts#run', 'certain'],
      ].sort()
    );
    expect(edgesFrom(g, 'src/legacy.js#old')).toEqual([['src/util.ts#format', 'certain']]);
  });

  it('resolves default imports by local name', () => {
    const g = build({ ...library, 'src/b.ts': ["import save from './store';", 'export function b() {', '  save();', '}'] });
    expect(edgesFrom(g, 'src/b.ts#b')).toEqual([['src/store.ts#save', 'certain']]);
  });

  it('creates no edge for package imports', () => {
    const g = build({ ...library, 'src/p.ts': ["import { format } from 'path';", 'export function p() {', '  format();', '}'] });
    expect(edgesFrom(g, 'src/p.ts#p')).toEqual([]);
  });
});

describe('receiver type hints', () => {
  it('resolves local new and parameter annotations as certain', () => {
    const g = build({
      ...library,
      'src/t.ts': [
        "import { FunctionIndex } from './index/functionIndex';",
        'export function find(index: FunctionIndex) {',
        '  return index.get(1);',
        '}',
        'export function make() {',
        '  const s = new Store();',
        '  s.persist();',
        '}',
        'class Store {',
        '  persist() {',
        '    return 2;',
        '  }',
        '}',
      ],
    });
    expect(edgesFrom(g, 'src/t.ts#find')).toEqual([['src/index/functionIndex.ts#FunctionIndex.get', 'certain']]);
    expect(edgesFrom(g, 'src/t.ts#make')).toEqual([['src/t.ts#Store.persist', 'certain']]);
  });

  it('creates no edge for library types', () => {
    const g = build({ ...library, 'src/m.ts': ['export function m() {', '  const seen = new Map<string, number>();', '  seen.get(1);', '}'] });
    expect(edgesFrom(g, 'src/m.ts#m')).toEqual([]);
  });
});

describe('member calls on unknown receivers', () => {
  it('does not match built-in method names (Map access)', () => {
    expect(BUILTIN_METHOD_NAMES.has('get')).toBe(true);
    const g = build({ ...library, 'src/q.js': ['function q(byName) {', '  return byName.get(1);', '}'] });
    expect(edgesFrom(g, 'src/q.js#q')).toEqual([]);
  });

  it('matches a unique method name as inferred and ambiguous names not at all', () => {
    const g = build({
      'src/c.js': ['var Cart = {', '  checkout: function () {', '    return 1;', '  }', '};'],
      'src/d.js': [
        'var A = {', '  refresh: function () {', '    return 1;', '  }', '};',
        'var B = {', '  refresh: function () {', '    return 2;', '  }', '};',
      ],
      'src/u.js': ['function u(x, y) {', '  x.checkout();', '  y.refresh();', '}'],
    });
    expect(edgesFrom(g, 'src/u.js#u')).toEqual([['src/c.js#Cart.checkout', 'inferred']]);
  });
});

describe('module scope and script fallback', () => {
  it('does not link unimported names in ES modules, but local functions', () => {
    const g = build({
      'src/h.ts': ['export function helper() {', '  return 1;', '}'],
      'src/mod.ts': ['export function a() {', '  helper();', '  local();', '}', 'function local() {', '  return 2;', '}'],
    });
    expect(edgesFrom(g, 'src/mod.ts#a')).toEqual([['src/mod.ts#local', 'certain']]);
  });

  it('keeps the name-based fallback for scripts', () => {
    const g = build({
      'src/r1.js': ['function render() {', '  return 1;', '}'],
      'src/r2.js': ['function render() {', '  return 2;', '}'],
      'src/f.js': ['function formatPrice() {', '  return 3;', '}'],
      'src/s.js': ['function s() {', '  render();', '  formatPrice();', '}'],
    });
    expect(edgesFrom(g, 'src/s.js#s').sort()).toEqual(
      [
        ['src/r1.js#render', 'inferred'],
        ['src/r2.js#render', 'inferred'],
        ['src/f.js#formatPrice', 'inferred'],
      ].sort()
    );
  });
});

describe('regression: cases measured on Auspex itself', () => {
  it('no Map.get call is matched to FunctionIndex.get, and imported resolveLanguage is certain', () => {
    const g = build({
      'src/analyzer/calls/functionIndex.ts': [
        'export class FunctionIndex {',
        '  private readonly byId = new Map<string, number>();',
        '  get(id: string) {',
        '    return this.byId.get(id);',
        '  }',
        '}',
      ],
      'src/i18n.ts': ['export function resolveLanguage() {', "  return 'en';", '}'],
      'src/providers/view.ts': [
        "import { resolveLanguage } from '../i18n';",
        'export function render(files: Map<string, number>, cache) {',
        '  const lang = resolveLanguage();',
        "  files.get('a');",
        "  cache.get('b');",
        '  return lang;',
        '}',
      ],
    });
    const intoGet = g.edges.filter((e) => e.to === 'src/analyzer/calls/functionIndex.ts#FunctionIndex.get');
    expect(intoGet).toEqual([]);
    expect(edgesFrom(g, 'src/providers/view.ts#render')).toEqual([['src/i18n.ts#resolveLanguage', 'certain']]);
  });
});
