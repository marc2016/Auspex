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
  | 'pair'
  /** string argument of a call: `invoke('Cart.save')` (carrier `invoke`) */
  | 'string';

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
  /** Call carrying a `string` reference, as written (`invoke`, `App.call`). */
  carrier?: string;
  /** The carrier is listed in the `dispatchers` of a rule that produced this reference. */
  dispatcher?: boolean;
}

const JS_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'with', 'do', 'void',
  'delete', 'in', 'of', 'instanceof', 'await', 'yield', 'throw', 'case', 'class', 'super',
]);

const SIMPLE_REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/;
const CALL_IN_EXPRESSION = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/g;

const CARRIER_BEFORE = /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*$/;

export interface InterpretedName {
  name: string;
  form: Exclude<DeclarativeRefForm, 'pair'>;
  /** Carrying call for `string` references. */
  carrier?: string;
}

/**
 * String literals that are direct call arguments and contain a bare or qualified name, with the
 * innermost call carrying them. Strings outside calls, in grouping parentheses, concatenated or
 * with template substitutions are ignored.
 */
function stringArguments(code: string): InterpretedName[] {
  const found: InterpretedName[] = [];
  const stack: (string | null)[] = [];
  let lastSignificant = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let content = '';
      let substitution = false;
      while (j < code.length && code[j] !== c) {
        if (code[j] === '\\') {
          content += code[j + 1] ?? '';
          j += 2;
          continue;
        }
        if (c === '`' && code[j] === '$' && code[j + 1] === '{') substitution = true;
        content += code[j];
        j++;
      }
      if (j >= code.length) break; // unclosed literal
      let k = j + 1;
      while (k < code.length && /\s/.test(code[k])) k++;
      const carrier = stack.length > 0 ? stack[stack.length - 1] : null;
      const isArgument = (lastSignificant === '(' || lastSignificant === ',') && (code[k] === ',' || code[k] === ')');
      if (carrier && isArgument && !substitution && SIMPLE_REFERENCE.test(content)) {
        if (!found.some((f) => f.name === content && f.carrier === carrier)) found.push({ name: content, form: 'string', carrier });
      }
      lastSignificant = c;
      i = j + 1;
      continue;
    }
    if (c === '(') {
      const m = CARRIER_BEFORE.exec(code.slice(0, i));
      const name = m ? m[1].replace(/\s+/g, '') : null;
      stack.push(name && !JS_KEYWORDS.has(name.split('.')[0]) ? name : null);
    } else if (c === ')') {
      stack.pop();
    }
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return found;
}

/**
 * Interprets an attribute value or element text: a JS expression yields every called name plus the
 * name-like string arguments of its calls, a bare or qualified name yields itself, anything else
 * yields nothing.
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
    return [...names, ...stringArguments(value)];
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
  const refs = new Map<string, DeclarativeRef>();
  const add = (ref: DeclarativeRef) => {
    const key = `${ref.line}|${ref.form}|${ref.name}|${ref.targetFile ?? ''}|${ref.carrier ?? ''}`;
    const existing = refs.get(key);
    if (!existing) refs.set(key, ref);
    else if (ref.dispatcher) existing.dispatcher = true; // one rule naming the carrier as dispatcher is enough
  };
  const toRef = (n: InterpretedName, line: number, value: string, rule: DeclarativeRule): DeclarativeRef => {
    if (n.form !== 'string') return { name: n.name, line, form: n.form, value };
    const ref: DeclarativeRef = { name: n.name, line, form: 'string', value, carrier: n.carrier };
    if (n.carrier && rule.dispatchers?.includes(n.carrier)) ref.dispatcher = true;
    return ref;
  };

  for (const rule of rules) {
    for (const tag of result.tags) {
      for (const attr of tag.attributes) {
        if (!rule.attributes.includes(attr.name)) continue;
        for (const n of interpretValue(attr.value)) add(toRef(n, attr.line, attr.value, rule));
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
        for (const n of interpretValue(text.text)) add(toRef(n, text.line, text.text, rule));
      }
    }
  }
  return [...refs.values()].sort((a, b) => a.line - b.line);
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
        const key = `${attr.line}|${n.name}|${n.carrier ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ref: DeclarativeRef = { name: n.name, line: attr.line, form: n.form, value: attr.value, heuristic: true };
        if (n.carrier) ref.carrier = n.carrier;
        refs.push(ref);
      }
    }
  }
  return refs;
}
