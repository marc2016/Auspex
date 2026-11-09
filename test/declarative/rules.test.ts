import { describe, it, expect } from 'vitest';
import { parseRules, RuleMatcher } from '../../src/analyzer/declarative/rules';

describe('parseRules', () => {
  it('accepts valid rules and normalizes globs to lists', () => {
    const { rules, warnings } = parseRules([
      { files: '**/*.form', attributes: ['onClick', 'handler'] },
      { files: ['**/*.flow', 'proc/*.xml'], elements: 'handler', fileAttribute: 'script', functionAttribute: 'function' },
    ]);
    expect(warnings).toEqual([]);
    expect(rules).toEqual([
      { files: ['**/*.form'], attributes: ['onClick', 'handler'], elements: [] },
      { files: ['**/*.flow', 'proc/*.xml'], attributes: [], elements: ['handler'], fileAttribute: 'script', functionAttribute: 'function' },
    ]);
  });

  it('drops a rule without files with a warning naming it', () => {
    const { rules, warnings } = parseRules([{ attributes: ['onClick'] }, { files: 'a/*.form', attributes: 'x' }]);
    expect(rules).toHaveLength(1);
    expect(warnings).toEqual([expect.stringContaining('auspex.declarativeReferences[0]')]);
  });

  it('drops incomplete file/function pairs and rules without reference locations', () => {
    const { rules, warnings } = parseRules([
      { files: 'a', fileAttribute: 'script' },
      { files: 'b' },
      { files: 'c', attributes: [1] },
      'not an object',
    ]);
    expect(rules).toEqual([]);
    expect(warnings).toHaveLength(4);
  });

  it('treats a missing setting as no rules and a non-list as a warning', () => {
    expect(parseRules(undefined)).toMatchObject({ rules: [], warnings: [] });
    expect(parseRules({ files: 'x' }).warnings).toHaveLength(1);
  });

  it('produces a stable hash that changes with rules and the heuristic flag', () => {
    const a = parseRules([{ files: 'x', attributes: ['a'] }]).hash;
    expect(parseRules([{ files: 'x', attributes: ['a'] }]).hash).toBe(a);
    expect(parseRules([{ files: 'x', attributes: ['a', 'b'] }]).hash).not.toBe(a);
    expect(parseRules([{ files: 'x', attributes: ['a'] }], true).hash).not.toBe(a);
  });
});

describe('RuleMatcher', () => {
  it('matches workspace-relative paths with gitignore-style globs', () => {
    const { rules } = parseRules([{ files: '**/*.form', attributes: 'onClick' }, { files: 'proc/', elements: 'h' }]);
    const m = new RuleMatcher(rules);
    expect(m.rulesFor('ui/order.form')).toHaveLength(1);
    expect(m.rulesFor('proc/a/b.xml')).toEqual([rules[1]]);
    expect(m.rulesFor('src/app.js')).toEqual([]);
  });
});
