import { describe, it, expect } from 'vitest';
import { CallGraphBuilder } from '../../src/analyzer/calls/callGraphBuilder';
import { updateCallGraphForFile } from '../../src/analyzer/calls/incremental';
import { parseJsWithCalls } from './helpers';

describe('updateCallGraphForFile', () => {
  const before = [
    'function Cart() {',
    '  this.add = function () {',
    '    return 1;',
    '  };',
    '  this.reset = function () {',
    '    return 0;',
    '  };',
    '}',
  ];
  const after = [
    'function Cart() {',
    '  this.add = function () {',
    '    this.reset();',
    '  };',
    '  this.reset = function () {',
    '    return 0;',
    '  };',
    '}',
  ];

  it('adds an edge introduced by a saved file without a full scan', () => {
    const builder = new CallGraphBuilder();
    const cache = {
      'cart.js': parseJsWithCalls('cart.js', before),
      'other.js': parseJsWithCalls('other.js', ['function main() {', '  return 1;', '}']),
    };
    expect(builder.build(Object.values(cache)).edges).toHaveLength(0);

    const { fileCache, callGraph } = updateCallGraphForFile(cache, parseJsWithCalls('cart.js', after), builder);
    expect(callGraph.edges).toEqual([
      { from: 'cart.js#Cart.add', to: 'cart.js#Cart.reset', confidence: 'certain', source: 'js' },
    ]);
    expect(Object.keys(fileCache).sort()).toEqual(['cart.js', 'other.js']);
    expect(cache['cart.js'].callSites).toHaveLength(0); // input not mutated
  });
});
