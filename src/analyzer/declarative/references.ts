import type { DeclarativeRule } from './rules';
import { scanXml, type XmlScanResult } from './xmlReferenceScanner';

/** How a reference was written in the XML file. */
export type DeclarativeRefForm =
  /** bare function name: `save` */
  | 'name'
  /** `Container.method` */
  | 'qualified'
  /** name taken from a JS expression: `save(this, 1)` */
  | 'expression'
  /** file attribute + function attribute on one element */
  | 'pair';

/** A reference to a JS function found in an XML-like file (cached with the file's parse result). */
export interface DeclarativeRef {
  /** Referenced name; `Container.method` for qualified names. */
  name: string;
  line: number;
  form: DeclarativeRefForm;
  /** Referenced JS file for `pair` references. */
  targetFile?: string;
  /** Original attribute value or element text. */
  value: string;
  /** Found by the heuristic mode (always `inferred`). */
  heuristic?: boolean;
}

const JS_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'with', 'do', 'void',
  'delete', 'in', 'of', 'instanceof', 'await', 'yield', 'throw', 'case', 'class', 'super',
]);

const SIMPLE_REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/;
const CALL_IN_EXPRESSION = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/g;

export interface InterpretedName {
  name: string;
  form: Exclude<DeclarativeRefForm, 'pair'>;
}

/**
 * Interprets an attribute value or element text: a JS expression yields every called name, a bare
 * or qualified name yields itself, anything else yields nothing.
 */
export function interpretValue(raw: string): InterpretedName[] {
  const value = raw.trim();
  if (!value) return [];
  if (value.includes('(')) {
    const code = value
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/`(?:\\.|[^`\\])*`/g, '``');
    const names: InterpretedName[] = [];
    for (const m of code.matchAll(CALL_IN_EXPRESSION)) {
      const before = code.slice(0, m.index);
      if (/\.\s*$/.test(before)) continue; // a().b() - only the first segment
      const name = m[1];
      if (JS_KEYWORDS.has(name.split('.')[0])) continue;
      if (!names.some((n) => n.name === name)) names.push({ name, form: 'expression' });
    }
    return names;
  }
  if (SIMPLE_REFERENCE.test(value)) {
    return [{ name: value, form: value.includes('.') ? 'qualified' : 'name' }];
  }
  return [];
}

/** References in an XML-like file according to the matching rules. */
export function extractDeclarativeRefs(content: string, rules: DeclarativeRule[], scan?: XmlScanResult): DeclarativeRef[] {
  if (rules.length === 0) return [];
  const result = scan ?? scanXml(content);
  const refs: DeclarativeRef[] = [];
  const seen = new Set<string>();
  const add = (ref: DeclarativeRef) => {
    const key = `${ref.line}|${ref.form}|${ref.name}|${ref.targetFile ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  for (const rule of rules) {
    for (const tag of result.tags) {
      for (const attr of tag.attributes) {
        if (!rule.attributes.includes(attr.name)) continue;
        for (const n of interpretValue(attr.value)) add({ name: n.name, line: attr.line, form: n.form, value: attr.value });
      }
      if (rule.fileAttribute && rule.functionAttribute) {
        const file = tag.attributes.find((a) => a.name === rule.fileAttribute);
        const fn = tag.attributes.find((a) => a.name === rule.functionAttribute);
        if (file?.value.trim() && fn?.value.trim()) {
          add({ name: fn.value.trim(), line: fn.line, form: 'pair', targetFile: file.value.trim(), value: `${file.value}#${fn.value}` });
        }
      }
    }
    if (rule.elements.length > 0) {
      for (const text of result.texts) {
        if (!rule.elements.includes(text.element)) continue;
        for (const n of interpretValue(text.text)) add({ name: n.name, line: text.line, form: n.form, value: text.text });
      }
    }
  }
  return refs.sort((a, b) => a.line - b.line);
}

/** Content starts with an XML declaration or a root element. */
export function looksLikeXml(content: string): boolean {
  const start = content.replace(/^\uFEFF/, '').trimStart();
  return start.startsWith('<?xml') || /^<[A-Za-z_]/.test(start);
}

/**
 * Heuristic mode: all attribute values of an XML-like file, keeping only code-like references
 * (resolution later keeps bare names only if they are unique). All results are marked heuristic.
 */
export function extractHeuristicRefs(content: string): DeclarativeRef[] {
  if (!looksLikeXml(content)) return [];
  const { tags } = scanXml(content);
  const refs: DeclarativeRef[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    for (const attr of tag.attributes) {
      for (const n of interpretValue(attr.value)) {
        const key = `${attr.line}|${n.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ name: n.name, line: attr.line, form: n.form, value: attr.value, heuristic: true });
      }
    }
  }
  return refs;
}
