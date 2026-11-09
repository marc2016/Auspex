import { describe, it, expect } from 'vitest';
import { CallGraphBuilder } from '../../src/analyzer/calls/callGraphBuilder';
import { DeclarativeEdgeSource, resolveTargetFile } from '../../src/analyzer/declarative/declarativeEdgeSource';
import { extractDeclarativeRefs } from '../../src/analyzer/declarative/references';
import { parseRules } from '../../src/analyzer/declarative/rules';
import type { ParsedFileInfo } from '../../src/analyzer/types';
import { parseJsWithCalls } from '../calls/helpers';

const { rules } = parseRules([
  { files: '**/*.form', attributes: ['onClick', 'handler'], fileAttribute: 'script', functionAttribute: 'function' },
]);

const xmlFile = (filePath: string, lines: string[]): ParsedFileInfo => ({
  filePath,
  classes: [],
  methods: [],
  loc: lines.length,
  fileHash: 'h',
  declarativeRefs: extractDeclarativeRefs(lines.join('\n'), rules),
});

const jsFiles = [
  parseJsWithCalls('app/Cart.js', [
    'function Cart() {',
    '  this.save = function () {',
    '    return 1;',
    '  };',
    '}',
    'function submitOrder() {',
    '  var c = new Cart();',
    '  c.save();',
    '}',
  ]),
  parseJsWithCalls('app/a.js', ['function render() {', '  return 1;', '}']),
  parseJsWithCalls('app/b.js', ['function render() {', '  return 2;', '}']),
];

function build(xml: ParsedFileInfo) {
  const source = new DeclarativeEdgeSource();
  const builder = new CallGraphBuilder();
  builder.register(source);
  const graph = builder.build([...jsFiles, xml]);
  return { graph, unresolved: source.lastUnresolved };
}

const declarative = (graph: ReturnType<typeof build>['graph']) => graph.edges.filter((e) => e.source === 'declarative');

describe('DeclarativeEdgeSource', () => {
  it('resolves qualified names to the container method as certain location callers', () => {
    const { graph } = build(xmlFile('ui/order.form', ['<form>', '  <button onClick="Cart.save"/>', '</form>']));
    expect(declarative(graph)).toEqual([
      { from: { file: 'ui/order.form', line: 2 }, to: 'app/Cart.js#Cart.save', confidence: 'certain', source: 'declarative' },
    ]);
  });

  it('resolves unique bare names as certain and ambiguous ones as inferred per candidate', () => {
    const { graph } = build(xmlFile('ui/o.form', ['<form>', '  <a handler="submitOrder"/>', '  <b handler="render"/>', '</form>']));
    const edges = declarative(graph).map((e) => [e.to, e.confidence]);
    expect(edges).toContainEqual(['app/Cart.js#submitOrder', 'certain']);
    expect(edges).toContainEqual(['app/a.js#render', 'inferred']);
    expect(edges).toContainEqual(['app/b.js#render', 'inferred']);
  });

  it('resolves file/function pairs relative to the root and to the XML file', () => {
    const { graph } = build(
      xmlFile('app/forms/x.form', ['<f>', '  <action script="app/Cart.js" function="submitOrder"/>', '  <action script="../a" function="render"/>', '</f>'])
    );
    expect(declarative(graph).map((e) => [e.to, e.confidence])).toEqual([
      ['app/Cart.js#submitOrder', 'certain'],
      ['app/a.js#render', 'certain'],
    ]);
  });

  it('counts declarative references as callers', () => {
    const { graph } = build(xmlFile('ui/o.form', ['<form>', '  <a onClick="Cart.save"/>', '  <b handler="Cart.save()"/>', '</form>']));
    expect(graph.counts['app/Cart.js#Cart.save'].callers).toBe(3); // 1 JS caller + 2 XML locations
  });

  it('lists unresolved names but not unresolved names from expressions', () => {
    const { graph, unresolved } = build(
      xmlFile('ui/o.form', ['<form>', '  <a onClick="Cart.sav"/>', '  <b onClick="submitOrder(); alert(1)"/>', '</form>'])
    );
    expect(unresolved).toEqual([{ file: 'ui/o.form', line: 2, value: 'Cart.sav' }]);
    expect(declarative(graph).map((e) => e.to)).toEqual(['app/Cart.js#submitOrder']);
  });
});

describe('resolveTargetFile', () => {
  const files = new Set(['app/Cart.js', 'lib/util.ts']);
  it('tries root-relative, file-relative and common extensions', () => {
    expect(resolveTargetFile('app/Cart.js', 'x/y.form', files)).toBe('app/Cart.js');
    expect(resolveTargetFile('../lib/util', 'forms/a.form', files)).toBe('lib/util.ts');
    expect(resolveTargetFile('nope.js', 'a.form', files)).toBeUndefined();
  });
});
