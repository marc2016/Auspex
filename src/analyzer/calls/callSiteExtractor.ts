import type { MethodInfo } from '../types';
import type { CallSite, ReceiverKind } from './types';

/** Names that look like calls but are language constructs. */
const NON_CALL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'with', 'do', 'else',
  'try', 'finally', 'void', 'delete', 'in', 'of', 'instanceof', 'await', 'yield', 'throw', 'case',
  'class', 'super', 'import', 'export', 'async', 'new', 'constructor',
]);

const REGEX_PRECEDING_CHARS = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_PRECEDING_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'yield', 'await']);

/**
 * Returns the source lines with the contents of strings, template literal text, comments and
 * regular expression literals replaced by spaces (line lengths and line breaks are preserved).
 * Code inside `${...}` template expressions is kept.
 */
export function sanitizeSource(lines: string[]): string[] {
  const src = lines.join('\n');
  const out = src.split('');
  type Mode = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' | 'regex';
  let mode: Mode = 'code';
  const tplDepth: number[] = []; // brace depth per open `${`
  let prevNonWs = '';
  let lastWord = '';
  let regexInClass = false;

  const blank = (i: number) => {
    if (out[i] !== '\n') out[i] = ' ';
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    switch (mode) {
      case 'line':
        if (ch === '\n') mode = 'code';
        else blank(i);
        continue;
      case 'block':
        if (ch === '*' && next === '/') {
          blank(i);
          blank(i + 1);
          i++;
          mode = 'code';
        } else blank(i);
        continue;
      case 'sq':
      case 'dq': {
        const quote = mode === 'sq' ? "'" : '"';
        if (ch === '\\') {
          blank(i);
          if (i + 1 < src.length) blank(i + 1);
          i++;
        } else if (ch === quote || ch === '\n') {
          mode = 'code';
          prevNonWs = quote;
        } else blank(i);
        continue;
      }
      case 'tpl':
        if (ch === '\\') {
          blank(i);
          if (i + 1 < src.length) blank(i + 1);
          i++;
        } else if (ch === '`') {
          mode = 'code';
          prevNonWs = '`';
        } else if (ch === '$' && next === '{') {
          tplDepth.push(1);
          i++;
          mode = 'code';
          prevNonWs = '{';
        } else blank(i);
        continue;
      case 'regex':
        if (ch === '\\') {
          blank(i);
          if (i + 1 < src.length) blank(i + 1);
          i++;
        } else if (ch === '\n') {
          mode = 'code';
        } else if (ch === '[') {
          regexInClass = true;
          blank(i);
        } else if (ch === ']') {
          regexInClass = false;
          blank(i);
        } else if (ch === '/' && !regexInClass) {
          mode = 'code';
          prevNonWs = '/';
        } else blank(i);
        continue;
      case 'code':
        break;
    }

    // code mode
    if (ch === '/' && next === '/') {
      blank(i);
      blank(i + 1);
      i++;
      mode = 'line';
      continue;
    }
    if (ch === '/' && next === '*') {
      blank(i);
      blank(i + 1);
      i++;
      mode = 'block';
      continue;
    }
    if (ch === "'") {
      mode = 'sq';
      continue;
    }
    if (ch === '"') {
      mode = 'dq';
      continue;
    }
    if (ch === '`') {
      mode = 'tpl';
      continue;
    }
    if (ch === '/') {
      const isRegex = !prevNonWs || REGEX_PRECEDING_CHARS.has(prevNonWs) || REGEX_PRECEDING_WORDS.has(lastWord);
      if (isRegex) {
        mode = 'regex';
        regexInClass = false;
        continue;
      }
    }
    if (tplDepth.length > 0) {
      if (ch === '{') tplDepth[tplDepth.length - 1]++;
      else if (ch === '}') {
        tplDepth[tplDepth.length - 1]--;
        if (tplDepth[tplDepth.length - 1] === 0) {
          tplDepth.pop();
          mode = 'tpl';
          continue;
        }
      }
    }

    if (/[\w$]/.test(ch)) {
      // read a whole word for keyword tracking
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      lastWord = src.slice(i, j);
      prevNonWs = src[j - 1];
      i = j - 1;
      continue;
    }
    if (!/\s/.test(ch)) {
      prevNonWs = ch;
      lastWord = '';
    }
  }

  return out.join('').split('\n');
}

/** Call expressions: optional dotted receiver chain followed by the called name and `(`. */
const CALL_PATTERN = /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g;
const THIS_ALIAS = /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*this\b/g;

interface AliasScope {
  name: string;
  startLine: number;
  endLine: number;
}

const stripParens = (name: string) => name.replace(/\(\)$/, '');
const baseName = (methodName: string) => {
  const segments = stripParens(methodName).split(' > ');
  return segments[segments.length - 1];
};

/** Methods strictly nested in `m` (their lines belong to them, not to `m`). */
function nestedRanges(m: MethodInfo, methods: MethodInfo[]): MethodInfo[] {
  return methods.filter(
    (o) =>
      o !== m &&
      o.startLine >= m.startLine &&
      o.endLine <= m.endLine &&
      !(o.startLine === m.startLine && o.endLine === m.endLine)
  );
}

/** Innermost method containing a line. */
function innermostMethod(line: number, methods: MethodInfo[]): MethodInfo | undefined {
  let best: MethodInfo | undefined;
  for (const m of methods) {
    if (line < m.startLine || line > m.endLine) continue;
    if (!best || m.endLine - m.startLine < best.endLine - best.startLine) best = m;
  }
  return best;
}

/**
 * Extracts the call sites inside each known function. Lines of nested functions are attributed to
 * the nested function only. Strings, comments and regex literals are ignored.
 */
export function extractCallSites(
  lines: string[],
  methods: MethodInfo[],
  amdDependencies?: Record<string, string>
): CallSite[] {
  if (methods.length === 0) return [];
  const code = sanitizeSource(lines);
  const amd = amdDependencies ?? extractAmdDependencies(lines) ?? {};

  // `var self = this` aliases apply within the innermost method declaring them (incl. nested ones)
  const aliases: AliasScope[] = [];
  code.forEach((text, idx) => {
    THIS_ALIAS.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = THIS_ALIAS.exec(text))) {
      const owner = innermostMethod(idx + 1, methods);
      aliases.push({
        name: m[1],
        startLine: owner?.startLine ?? 1,
        endLine: owner?.endLine ?? lines.length,
      });
    }
  });
  const isThisAlias = (name: string, line: number) =>
    aliases.some((a) => a.name === name && line >= a.startLine && line <= a.endLine);

  const sites: CallSite[] = [];

  for (const method of methods) {
    const nested = nestedRanges(method, methods);
    const ownName = baseName(method.name);

    for (let lineNo = method.startLine; lineNo <= Math.min(method.endLine, code.length); lineNo++) {
      if (nested.some((n) => lineNo >= n.startLine && lineNo <= n.endLine)) continue;
      const text = code[lineNo - 1];
      if (!text || !text.includes('(')) continue;

      CALL_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = CALL_PATTERN.exec(text))) {
        const before = text.slice(0, match.index);
        // `a().b()` - only the first segment of a call chain is resolved
        if (/\.\s*$/.test(before)) continue;
        // declarations: `function name(`, `get name(`
        if (/\bfunction\s*\*?\s*$/.test(before) || /\b(?:get|set|static)\s+$/.test(before)) continue;

        const parts = match[1].split('.').map((p) => p.trim());
        const callee = parts[parts.length - 1];
        if (NON_CALL_KEYWORDS.has(callee)) continue;

        // method shorthand / declaration of the method itself on its first line: `save(x) {`
        if (lineNo === method.startLine && parts.length === 1 && callee === ownName) {
          const after = text.slice(match.index + match[0].length);
          if (/^[^)]*\)\s*(?::[^{]*)?\{/.test(after)) continue;
        }

        let receiverKind: ReceiverKind = 'none';
        let receiver: string | undefined;
        if (parts.length === 2) {
          const r = parts[0];
          if (r === 'this' || isThisAlias(r, lineNo)) receiverKind = 'this';
          else if (Object.prototype.hasOwnProperty.call(amd, r)) {
            receiverKind = 'amd';
            receiver = r;
          } else {
            receiverKind = 'other';
            receiver = r;
          }
        } else if (parts.length > 2) {
          receiverKind = 'other';
          receiver = parts.slice(0, -1).join('.');
        }

        sites.push({
          callerName: method.name,
          callerStartLine: method.startLine,
          line: lineNo,
          callee,
          receiverKind,
          ...(receiver !== undefined ? { receiver } : {}),
        });
      }
    }
  }
  return sites;
}

const AMD_HEADER =
  /\b(?:define|require)\s*\(\s*(?:(['"])[^'"]*\1\s*,\s*)?\[([^\]]*)\]\s*,\s*function\s*[\w$]*\s*\(([^)]*)\)/;

/**
 * Maps AMD factory parameters to dependency ids for `define([...], function (...) {})`
 * (also with a module id first, and `require([...], function (...) {})`). Returns undefined if the
 * file has no such header.
 */
export function extractAmdDependencies(lines: string[]): Record<string, string> | undefined {
  // The header is near the top; strip line comments so commented-out deps are ignored.
  const head = lines
    .slice(0, 80)
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
  const m = head.match(AMD_HEADER);
  if (!m) return undefined;

  const deps = [...m[2].matchAll(/(['"])([^'"]+)\1/g)].map((d) => d[2]);
  const params = m[3]
    .split(',')
    .map((p) => p.replace(/\/\*[\s\S]*?\*\//g, '').trim())
    .filter((p) => p.length > 0);

  const map: Record<string, string> = {};
  for (let k = 0; k < Math.min(deps.length, params.length); k++) {
    map[params[k]] = deps[k];
  }
  return map;
}
