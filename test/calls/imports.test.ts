import { describe, it, expect } from 'vitest';
import { extractImports } from '../../src/analyzer/calls/callSiteExtractor';

const imp = (src: string[]) => extractImports(src);

describe('extractImports', () => {
  it('parses default, named, renamed and namespace imports', () => {
    const { imports, isModule } = imp([
      "import Store from './store';",
      "import { a, b as c, type T } from '../util';",
      "import * as ns from './ns';",
      "import D, { e } from './combo';",
      "import F, * as G from './both';",
    ]);
    expect(isModule).toBe(true);
    expect(imports).toEqual([
      { local: 'Store', imported: 'default', source: './store' },
      { local: 'a', imported: 'a', source: '../util' },
      { local: 'c', imported: 'b', source: '../util' },
      { local: 'ns', imported: '*', source: './ns' },
      { local: 'D', imported: 'default', source: './combo' },
      { local: 'e', imported: 'e', source: './combo' },
      { local: 'F', imported: 'default', source: './both' },
      { local: 'G', imported: '*', source: './both' },
    ]);
  });

  it('supports multi-line import clauses and skips import type', () => {
    const { imports } = imp(['import {', '  resolveLanguage,', '  EXT_STRINGS,', "} from '../i18n';", "import type { X } from './x';"]);
    expect(imports.map((i) => i.local)).toEqual(['resolveLanguage', 'EXT_STRINGS']);
  });

  it('parses require declarations', () => {
    const { imports, isModule } = imp(["const { format, parse: p } = require('./util');", "var store = require('../store');"]);
    expect(isModule).toBe(false);
    expect(imports).toEqual([
      { local: 'format', imported: 'format', source: './util' },
      { local: 'p', imported: 'parse', source: './util' },
      { local: 'store', imported: '*', source: '../store' },
    ]);
  });

  it('ignores package imports and imports in comments or strings', () => {
    const { imports, isModule } = imp([
      "import path from 'path';",
      "// import { x } from './x';",
      "/* import y from './y'; */",
      "const s = \"import z from './z'\";",
      "const fs = require('fs');",
    ]);
    expect(imports).toEqual([]);
    expect(isModule).toBe(true); // the first line is a real import
  });

  it('detects scripts without import/export', () => {
    expect(imp(["define(['a'], function (A) {", '  return 1;', '});']).isModule).toBe(false);
    expect(imp(['export function a() {}']).isModule).toBe(true);
  });
});

import { parseJsWithCalls } from './helpers';

describe('receiver type hints', () => {
  const site = (src: string[], callee: string) =>
    parseJsWithCalls('a.ts', src).callSites!.find((s) => s.callee === callee);

  it('uses local new and keeps the constructed class over an annotation', () => {
    expect(site(['function f() {', '  var c = new Cart();', '  c.save();', '}'], 'save')?.receiverType).toBe('Cart');
    expect(site(['function f() {', '  const c: Base = new app.Cart();', '  c.save();', '}'], 'save')?.receiverType).toBe('Cart');
  });

  it('uses parameter annotations of the calling function', () => {
    expect(site(['function find(index: FunctionIndex, id: string) {', '  return index.get(id);', '}'], 'get')?.receiverType).toBe('FunctionIndex');
  });

  it('records library types as well (they resolve to no edge later)', () => {
    expect(site(['function f() {', '  const seen = new Map<string, number>();', '  seen.get(1);', '}'], 'get')?.receiverType).toBe('Map');
  });

  it('applies hints of enclosing functions to nested ones', () => {
    const s = site(['function outer(store: Store) {', '  function inner() {', '    store.persist();', '  }', '}'], 'persist');
    expect(s?.receiverType).toBe('Store');
  });

  it('has no hint for untyped receivers', () => {
    expect(site(['function f(m) {', '  m.get(1);', '}'], 'get')?.receiverType).toBeUndefined();
  });
});
