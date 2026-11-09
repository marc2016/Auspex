import { describe, it, expect } from 'vitest';
import { resolveCurrentFunction, sameCurrentFunction } from '../../src/analyzer/calls/currentFunction';
import { CallGraphBuilder } from '../../src/analyzer/calls/callGraphBuilder';
import { parseJs, parseJsWithCalls } from './helpers';

const cartSrc = [
  'function Cart() {', //            1
  '  this.add = function () {', //   2
  '    function check() {', //       3
  '      return 1;', //              4
  '    }', //                        5
  '    return check();', //          6
  '  };', //                         7
  '  this.remove = function () {', // 8
  '    return 0;', //                9
  '  };', //                        10
  '}', //                           11
];

const graphFor = (src: string[]) => new CallGraphBuilder().build([parseJsWithCalls('src/cart.js', src)]).functions;

describe('resolveCurrentFunction', () => {
  const functions = graphFor(cartSrc);

  it('returns the innermost function at the cursor (nested function)', () => {
    const parsed = parseJs('src/cart.js', cartSrc);
    expect(resolveCurrentFunction('src/cart.js', 4, parsed, functions)).toMatchObject({
      qualifiedName: 'Cart.add > check',
      fnId: 'src/cart.js#Cart.add > check',
    });
    expect(resolveCurrentFunction('src/cart.js', 6, parsed, functions)?.fnId).toBe('src/cart.js#Cart.add');
    expect(resolveCurrentFunction('src/cart.js', 9, parsed, functions)?.fnId).toBe('src/cart.js#Cart.remove');
  });

  it('matches by name when unsaved lines shifted the function', () => {
    const edited = [...Array.from({ length: 20 }, (_, i) => `// inserted ${i}`), ...cartSrc];
    const parsed = parseJs('src/cart.js', edited);
    const cf = resolveCurrentFunction('src/cart.js', 29, parsed, functions);
    expect(cf).toMatchObject({ fnId: 'src/cart.js#Cart.remove', startLine: 28 });
  });

  it('uses the closest start line for duplicate names', () => {
    const src = ['function a() {', '  return 1;', '}', 'function a() {', '  return 2;', '}'];
    const fns = graphFor(src);
    expect(fns.map((f) => f.id)).toEqual(['src/cart.js#a@1', 'src/cart.js#a@4']);
    const parsed = parseJs('src/cart.js', ['// new line', ...src]);
    expect(resolveCurrentFunction('src/cart.js', 6, parsed, fns)?.fnId).toBe('src/cart.js#a@4');
    expect(resolveCurrentFunction('src/cart.js', 3, parsed, fns)?.fnId).toBe('src/cart.js#a@1');
  });

  it('reports a new, unsaved function without call data', () => {
    const edited = [...cartSrc, 'function clear() {', '  return null;', '}'];
    const parsed = parseJs('src/cart.js', edited);
    const cf = resolveCurrentFunction('src/cart.js', 13, parsed, functions);
    expect(cf).toMatchObject({ qualifiedName: 'clear', startLine: 12 });
    expect(cf?.fnId).toBeUndefined();
  });

  it('returns undefined outside every function', () => {
    const src = ['import x from "x";', '', ...cartSrc];
    const parsed = parseJs('src/cart.js', src);
    expect(resolveCurrentFunction('src/cart.js', 1, parsed, functions)).toBeUndefined();
  });

  it('falls back to the call graph lines without parsed structure', () => {
    expect(resolveCurrentFunction('src/cart.js', 9, undefined, functions)?.fnId).toBe('src/cart.js#Cart.remove');
    expect(resolveCurrentFunction('src/other.js', 9, undefined, functions)).toBeUndefined();
  });

  it('compares current functions', () => {
    const a = { file: 'f', qualifiedName: 'a', fnId: 'f#a', startLine: 1, endLine: 2 };
    expect(sameCurrentFunction(a, { ...a, startLine: 5 })).toBe(true);
    expect(sameCurrentFunction(a, { ...a, qualifiedName: 'b' })).toBe(false);
    expect(sameCurrentFunction(undefined, undefined)).toBe(true);
    expect(sameCurrentFunction(a, undefined)).toBe(false);
  });
});
