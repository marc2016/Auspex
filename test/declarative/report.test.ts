import { describe, it, expect } from 'vitest';
import { formatDeclarativeReport, hasDeclarativeReport } from '../../src/analyzer/declarative/report';
import { buildDeclarativeReport } from '../../src/analyzer/pipeline';
import { parseRules } from '../../src/analyzer/declarative/rules';
import type { ParsedFileInfo } from '../../src/analyzer/types';

const t = {
  title: 'TITLE',
  warnings: 'Warnings:',
  rules: 'Rules:',
  rule: (f: string, m: number, r: number) => `${f}: ${m} files, ${r} refs`,
  unresolved: 'Unresolved',
  noUnresolved: 'All resolved.',
  carriers: 'Carriers:',
  carrier: (n: string, c: number, d: boolean) => `${n} ${c}${d ? ' *' : ''}`,
};

describe('declarative report', () => {
  it('formats warnings, per-rule counts and sorted unresolved references', () => {
    const lines = formatDeclarativeReport(
      {
        warnings: ['bad rule'],
        rules: [{ files: ['**/*.form'], matchedFiles: 2, references: 5 }],
        unresolved: [
          { file: 'b.form', line: 3, value: 'Cart.sav' },
          { file: 'a.form', line: 9, value: 'nope' },
        ],
      },
      t
    );
    expect(lines).toEqual([
      'TITLE', '', 'Warnings:', '  ! bad rule', '', 'Rules:', '  **/*.form: 2 files, 5 refs', '',
      'Unresolved (2)', '  a.form:9  nope', '  b.form:3  Cart.sav',
    ]);
  });

  it('lists carriers by count with configured dispatchers marked', () => {
    const lines = formatDeclarativeReport(
      {
        warnings: [],
        rules: [],
        unresolved: [],
        carriers: [
          { name: 'App.call', count: 3, dispatcher: false },
          { name: 'invoke', count: 42, dispatcher: true },
        ],
      },
      t
    );
    expect(lines).toEqual(['TITLE', '', 'Carriers:', '  invoke 42 *', '  App.call 3', '', 'All resolved.']);
  });

  it('omits the carrier section without resolved string references', () => {
    const lines = formatDeclarativeReport({ warnings: [], rules: [], unresolved: [], carriers: [] }, t);
    expect(lines).not.toContain('Carriers:');
    expect(hasDeclarativeReport({ warnings: [], rules: [], unresolved: [], carriers: [{ name: 'x', count: 1, dispatcher: false }] })).toBe(true);
  });

  it('reports nothing when the feature is not used', () => {
    expect(hasDeclarativeReport({ warnings: [], rules: [], unresolved: [] })).toBe(false);
    expect(hasDeclarativeReport(undefined)).toBe(false);
  });

  it('counts matched files and references per rule', () => {
    const parsed = parseRules([{ files: '**/*.form', attributes: 'onClick' }, { files: '**/*.flow', attributes: 'x' }]);
    const file = (filePath: string, n: number): ParsedFileInfo => ({
      filePath, classes: [], methods: [], loc: 1, fileHash: 'h',
      declarativeRefs: Array.from({ length: n }, (_, i) => ({ name: `f${i}`, line: i + 1, form: 'name' as const, value: 'f' })),
    });
    const report = buildDeclarativeReport(parsed, [file('a.form', 2), file('b.form', 1), file('c.js', 0)], []);
    expect(report.rules).toEqual([
      { files: ['**/*.form'], matchedFiles: 2, references: 3 },
      { files: ['**/*.flow'], matchedFiles: 0, references: 0 },
    ]);
  });
});
