import { describe, it, expect } from 'vitest';
import { AstStructureAnalyzer } from '../../src/analyzer/astAnalyzer';
import { parseRules } from '../../src/analyzer/declarative/rules';
import { CallGraphBuilder } from '../../src/analyzer/calls/callGraphBuilder';
import { DeclarativeEdgeSource } from '../../src/analyzer/declarative/declarativeEdgeSource';
import { looksLikeXml } from '../../src/analyzer/declarative/references';

const cartJs = ['function Cart() {', '  this.save = function () {', '    return 1;', '  };', '}'].join('\n');

function graphFor(analyzer: AstStructureAnalyzer, xmlPath: string, xml: string) {
  const source = new DeclarativeEdgeSource();
  const builder = new CallGraphBuilder();
  builder.register(source);
  const xmlInfo = analyzer.analyzeSource(xml, xmlPath);
  const graph = builder.build([analyzer.analyzeSource(cartJs, 'app/Cart.js'), xmlInfo]);
  return { graph, xmlInfo, unresolved: source.lastUnresolved };
}

describe('heuristic mode', () => {
  it('creates inferred edges for code-like values in unconfigured XML files', () => {
    const analyzer = new AstStructureAnalyzer();
    analyzer.setDeclarativeRules(parseRules([], true));
    const { graph, unresolved } = graphFor(
      analyzer,
      'views/x.view',
      ['<?xml version="1.0"?>', '<view>', '  <button action="Cart.save" title="Save order"/>', '</view>'].join('\n')
    );
    expect(graph.edges).toEqual([
      { from: { file: 'views/x.view', line: 3 }, to: 'app/Cart.js#Cart.save', confidence: 'inferred', source: 'declarative' },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('ignores plain text values and stays off by default', () => {
    const on = new AstStructureAnalyzer();
    on.setDeclarativeRules(parseRules([], true));
    expect(graphFor(on, 'v.view', '<view title="Save order" label="Ok"/>').graph.edges).toEqual([]);

    const off = new AstStructureAnalyzer();
    off.setDeclarativeRules(parseRules([], false));
    expect(graphFor(off, 'v.view', '<view action="Cart.save"/>').xmlInfo.declarativeRefs).toBeUndefined();
  });

  it('does not scan rule-matched files heuristically a second time', () => {
    const analyzer = new AstStructureAnalyzer();
    analyzer.setDeclarativeRules(parseRules([{ files: '**/*.form', attributes: ['onClick'] }], true));
    const { xmlInfo, graph } = graphFor(analyzer, 'ui/o.form', '<form><b onClick="Cart.save" action="Cart.save"/></form>');
    expect(xmlInfo.declarativeRefs).toEqual([{ name: 'Cart.save', line: 1, form: 'qualified', value: 'Cart.save' }]);
    expect(graph.edges[0].confidence).toBe('certain');
  });

  it('detects XML-like content', () => {
    expect(looksLikeXml('﻿  <?xml version="1.0"?><a/>')).toBe(true);
    expect(looksLikeXml('<form/>')).toBe(true);
    expect(looksLikeXml('function a() {}')).toBe(false);
    expect(looksLikeXml('{ "a": 1 }')).toBe(false);
  });
});
