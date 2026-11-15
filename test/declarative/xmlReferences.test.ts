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

  it('extracts every called name from expressions, without names inside string literals', () => {
    expect(interpretValue("save(this, 1); track('x')")).toEqual([
      { name: 'save', form: 'expression' },
      { name: 'track', form: 'expression' },
      { name: 'x', form: 'string', carrier: 'track' },
    ]);
    expect(interpretValue("log('fake(1)'); Cart.save()").map((n) => n.name)).toEqual(['log', 'Cart.save']);
    expect(interpretValue('if (a) { run() }').map((n) => n.name)).toEqual(['run']);
  });

  it('takes name-like string arguments with their carrier', () => {
    expect(interpretValue("invoke('Cart.save', this)")).toEqual([
      { name: 'invoke', form: 'expression' },
      { name: 'Cart.save', form: 'string', carrier: 'invoke' },
    ]);
    expect(interpretValue('App.call("save")').filter((n) => n.form === 'string')).toEqual([
      { name: 'save', form: 'string', carrier: 'App.call' },
    ]);
  });

  it('ignores strings that are not name-like call arguments', () => {
    expect(interpretValue("show('Order saved!'); x = 'Cart.save'").filter((n) => n.form === 'string')).toEqual([]);
    expect(interpretValue("run('Cart.' + action)").filter((n) => n.form === 'string')).toEqual([]);
    expect(interpretValue("if ('Cart.save') go()").filter((n) => n.form === 'string')).toEqual([]);
  });

  it('uses the innermost call as carrier', () => {
    expect(interpretValue("run(invoke('Cart.save'))").filter((n) => n.form === 'string')).toEqual([
      { name: 'Cart.save', form: 'string', carrier: 'invoke' },
    ]);
  });

  it('handles escaped quotes and template literals', () => {
    const strings = (v: string) => interpretValue(v).filter((n) => n.form === 'string').map((n) => n.name);
    expect(strings("invoke('it\\'s', 'Cart.save')")).toEqual(['Cart.save']);
    expect(strings('invoke(`Cart.save`)')).toEqual(['Cart.save']);
    expect(strings('invoke(`Cart.${name}`)')).toEqual([]);
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

  it('marks string arguments of configured dispatchers with exact dotted-name matching', () => {
    const content = `<form>\n  <button onClick="invoke('Cart.save'); App.call('load'); this.invoke('x')"/>\n</form>`;
    const { rules } = parseRules([{ files: '*', attributes: 'onClick', dispatchers: ['invoke', 'App.call'] }]);
    const strings = extractDeclarativeRefs(content, rules).filter((r) => r.form === 'string');
    expect(strings).toEqual([
      { name: 'Cart.save', line: 2, form: 'string', value: expect.any(String), carrier: 'invoke', dispatcher: true },
      { name: 'load', line: 2, form: 'string', value: expect.any(String), carrier: 'App.call', dispatcher: true },
      { name: 'x', line: 2, form: 'string', value: expect.any(String), carrier: 'this.invoke' },
    ]);
  });

  it('leaves string arguments unmarked without dispatchers', () => {
    const { rules } = parseRules([{ files: '*', attributes: 'onClick' }]);
    const [ref] = extractDeclarativeRefs(`<b onClick="invoke('Cart.save')"/>`, rules).filter((r) => r.form === 'string');
    expect(ref).toEqual({ name: 'Cart.save', line: 1, form: 'string', value: "invoke('Cart.save')", carrier: 'invoke' });
  });

  it('upgrades a reference to dispatcher when one of several matching rules names the carrier', () => {
    const content = `<b onClick="invoke('Cart.save')"/>`;
    for (const order of [
      [{ files: '*', attributes: 'onClick' }, { files: '*', attributes: 'onClick', dispatchers: 'invoke' }],
      [{ files: '*', attributes: 'onClick', dispatchers: 'invoke' }, { files: '*', attributes: 'onClick' }],
    ]) {
      const strings = extractDeclarativeRefs(content, parseRules(order).rules).filter((r) => r.form === 'string');
      expect(strings).toHaveLength(1);
      expect(strings[0].dispatcher).toBe(true);
    }
  });
});
