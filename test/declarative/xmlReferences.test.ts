import { describe, it, expect } from 'vitest';
import { scanXml, decodeEntities } from '../../src/analyzer/declarative/xmlReferenceScanner';
import { interpretValue, extractDeclarativeRefs } from '../../src/analyzer/declarative/references';
import { parseRules } from '../../src/analyzer/declarative/rules';

describe('scanXml', () => {
  it('reads single- and double-quoted attributes with their lines, also in multi-line tags', () => {
    const { tags } = scanXml(['<form>', '  <button id="b1"', "     onClick='Cart.save'", '     handler="x"/>', '</form>'].join('\n'));
    const button = tags.find((t) => t.name === 'button')!;
    expect(button.line).toBe(2);
    expect(button.attributes).toEqual([
      { name: 'id', value: 'b1', line: 2 },
      { name: 'onClick', value: 'Cart.save', line: 3 },
      { name: 'handler', value: 'x', line: 4 },
    ]);
  });

  it('skips comments, CDATA, processing instructions and declarations', () => {
    const { tags, texts } = scanXml(
      ['<?xml version="1.0"?>', '<!DOCTYPE form>', '<form>', '<!-- <button onClick="hidden"/> -->', '<![CDATA[ <x onClick="nope"/> ]]>', '<handler>run</handler>', '</form>'].join('\n')
    );
    expect(tags.map((t) => t.name)).toEqual(['form', 'handler']);
    expect(texts).toEqual([{ element: 'handler', text: 'run', line: 6 }]);
  });

  it('decodes entities in values and text', () => {
    expect(decodeEntities('a &amp;&amp; b &lt; c &#65;&#x42;')).toBe('a && b < c AB');
    const { tags } = scanXml('<b onClick="check(a &amp;&amp; b)"/>');
    expect(tags[0].attributes[0].value).toBe('check(a && b)');
  });

  it('still finds later references in a malformed file', () => {
    const { tags } = scanXml(['<form>', '  <panel title="unclosed', '  <button onClick="Cart.save"/>', '  <div', '  <link handler="go"/>', '</form>'].join('\n'));
    const values = tags.flatMap((t) => t.attributes.map((a) => [a.name, a.value, a.line]));
    expect(values).toContainEqual(['onClick', 'Cart.save', 3]);
    expect(values).toContainEqual(['handler', 'go', 5]);
  });

  it('reports element text with the line of its first character', () => {
    const { texts } = scanXml('<a>\n\n   validateOrder\n</a>');
    expect(texts).toEqual([{ element: 'a', text: 'validateOrder', line: 3 }]);
  });
});

describe('interpretValue', () => {
  it('interprets bare and qualified names', () => {
    expect(interpretValue('save')).toEqual([{ name: 'save', form: 'name' }]);
    expect(interpretValue(' Cart.save ')).toEqual([{ name: 'Cart.save', form: 'qualified' }]);
  });

  it('extracts every called name from expressions, ignoring string literals', () => {
    expect(interpretValue("save(this, 1); track('x')")).toEqual([
      { name: 'save', form: 'expression' },
      { name: 'track', form: 'expression' },
    ]);
    expect(interpretValue("log('fake(1)'); Cart.save()").map((n) => n.name)).toEqual(['log', 'Cart.save']);
    expect(interpretValue('if (a) { run() }').map((n) => n.name)).toEqual(['run']);
  });

  it('ignores non-reference text', () => {
    expect(interpretValue('Save order')).toEqual([]);
    expect(interpretValue('')).toEqual([]);
    expect(interpretValue('42')).toEqual([]);
  });
});

describe('extractDeclarativeRefs', () => {
  it('extracts attribute references, element text and file/function pairs per rule', () => {
    const { rules } = parseRules([
      { files: '**/*.form', attributes: ['onClick'], elements: ['handler'], fileAttribute: 'script', functionAttribute: 'function' },
    ]);
    const content = [
      '<form>',
      '  <button onClick="Cart.save" title="Save"/>',
      '  <handler>validateOrder</handler>',
      '  <action script="app/Cart.js" function="save"/>',
      '</form>',
    ].join('\n');
    expect(extractDeclarativeRefs(content, rules)).toEqual([
      { name: 'Cart.save', line: 2, form: 'qualified', value: 'Cart.save' },
      { name: 'validateOrder', line: 3, form: 'name', value: 'validateOrder' },
      { name: 'save', line: 4, form: 'pair', targetFile: 'app/Cart.js', value: 'app/Cart.js#save' },
    ]);
  });
});
