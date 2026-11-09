import { describe, it, expect } from 'vitest';
import { TreeAggregator } from '../../src/analyzer/treeAggregator';
import { FunctionIndex, findTreeNodeForFunction, indexFileFunctions } from '../../src/analyzer/calls/functionIndex';
import type { ParsedFileInfo } from '../../src/analyzer/types';
import { parseJs } from './helpers';

describe('function ids', () => {
  it('qualifies container methods, constructor bodies and nested helpers', () => {
    const file = parseJs('src/cart.js', [
      'function Cart() {',
      '  function validate(i) {',
      '    return !!i;',
      '  }',
      '  this.add = function () {',
      '    validate(1);',
      '  };',
      '  this.load = function () {',
      '    function parse(r) {',
      '      return r;',
      '    }',
      '  };',
      '}',
    ]);
    const ids = indexFileFunctions(file).map((f) => f.id);
    expect(ids).toEqual([
      'src/cart.js#Cart',
      'src/cart.js#Cart > validate',
      'src/cart.js#Cart.add',
      'src/cart.js#Cart.load',
      'src/cart.js#Cart.load > parse',
    ]);
  });

  it('uses plain names for top-level functions and object literal methods with their container', () => {
    const file = parseJs('src/util.js', [
      'function main() {',
      '  return 1;',
      '}',
      'var Store = {',
      '  persist: function (x) {',
      '    return x;',
      '  }',
      '};',
    ]);
    const fns = indexFileFunctions(file);
    expect(fns.map((f) => f.id)).toEqual(['src/util.js#main', 'src/util.js#Store.persist']);
    expect(fns[1].container).toBe('Store');
    expect(fns[0].container).toBeUndefined();
  });

  it('disambiguates same-named methods in one file with the start line', () => {
    const file = parseJs('src/two.js', [
      'function Cart() {',
      '  this.add = function () {',
      '    return 1;',
      '  };',
      '}',
      'function cart2() {',
      '  function add() {',
      '    return 2;',
      '  }',
      '}',
      'function add() {',
      '  return 3;',
      '}',
    ]);
    const ids = indexFileFunctions(file).map((f) => f.id);
    expect(ids).toContain('src/two.js#Cart.add');
    expect(ids).toContain('src/two.js#cart2 > add');
    expect(ids).toContain('src/two.js#add');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('appends @line for exact collisions', () => {
    const file: ParsedFileInfo = {
      filePath: 'a.js',
      classes: [],
      methods: [
        { name: 'run()', startLine: 1, endLine: 3, loc: 3 },
        { name: 'run()', startLine: 5, endLine: 7, loc: 3 },
      ],
      loc: 7,
      fileHash: 'h',
    };
    expect(indexFileFunctions(file).map((f) => f.id)).toEqual(['a.js#run@1', 'a.js#run@5']);
  });
});

describe('FunctionIndex', () => {
  const index = new FunctionIndex([
    parseJs('a.js', ['Foo.prototype.init = function () {', '  return 1;', '};']),
    parseJs('b.js', ['function init() {', '  return 2;', '}']),
  ]);

  it('merges Foo and Foo.prototype containers', () => {
    expect(index.containerMethods('Foo', 'init').map((f) => f.id)).toEqual(['a.js#Foo.prototype.init']);
    expect(index.hasContainer('Foo')).toBe(true);
  });

  it('finds functions by name across files', () => {
    expect(index.named('init').map((f) => f.file).sort()).toEqual(['a.js', 'b.js']);
  });
});

describe('findTreeNodeForFunction', () => {
  it('maps a function to its tree node by file and lines', () => {
    const file = parseJs('src/cart.js', ['function Cart() {', '  this.add = function () {', '    return 1;', '  };', '}']);
    const { tree } = new TreeAggregator().buildTree([file], new Map());
    const add = indexFileFunctions(file).find((f) => f.name === 'add')!;
    expect(findTreeNodeForFunction(tree, add)?.name).toBe('add()');
  });
});
