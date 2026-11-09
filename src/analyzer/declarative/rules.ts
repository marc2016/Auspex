import crypto from 'crypto';
import ignore, { type Ignore } from 'ignore';

/** A validated rule of `auspex.declarativeReferences`. */
export interface DeclarativeRule {
  /** Glob patterns (gitignore syntax) matched against workspace-relative paths. */
  files: string[];
  /** Attributes whose values reference JS functions (names, qualified names or expressions). */
  attributes: string[];
  /** Elements whose text references JS functions. */
  elements: string[];
  /** Attribute naming a JS file; used together with `functionAttribute`. */
  fileAttribute?: string;
  /** Attribute naming a function in the file given by `fileAttribute`. */
  functionAttribute?: string;
}

export interface ParsedRules {
  rules: DeclarativeRule[];
  warnings: string[];
  /** Stable hash of the effective rules and the heuristic flag (for cache invalidation). */
  hash: string;
  heuristic: boolean;
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function stringList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (isNonEmptyString(value)) return [value.trim()];
  if (Array.isArray(value) && value.every(isNonEmptyString)) return value.map((v) => v.trim());
  return null;
}

/** Validates the raw setting value; invalid rules are dropped with a warning. */
export function parseRules(raw: unknown, heuristic = false): ParsedRules {
  const rules: DeclarativeRule[] = [];
  const warnings: string[] = [];
  const list = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : null;

  if (list === null) {
    warnings.push('auspex.declarativeReferences must be a list of rules.');
  } else {
    list.forEach((entry, i) => {
      const label = `auspex.declarativeReferences[${i}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        warnings.push(`${label}: a rule must be an object.`);
        return;
      }
      const r = entry as Record<string, unknown>;
      const files = stringList(r.files);
      if (!files || files.length === 0) {
        warnings.push(`${label}: "files" (glob or list of globs) is required.`);
        return;
      }
      const attributes = stringList(r.attributes);
      const elements = stringList(r.elements);
      if (!attributes || !elements) {
        warnings.push(`${label}: "attributes" and "elements" must be strings or lists of strings.`);
        return;
      }
      const hasFileAttr = r.fileAttribute !== undefined;
      const hasFnAttr = r.functionAttribute !== undefined;
      if (hasFileAttr !== hasFnAttr || (hasFileAttr && (!isNonEmptyString(r.fileAttribute) || !isNonEmptyString(r.functionAttribute)))) {
        warnings.push(`${label}: "fileAttribute" and "functionAttribute" must be given together as non-empty strings.`);
        return;
      }
      if (attributes.length === 0 && elements.length === 0 && !hasFileAttr) {
        warnings.push(`${label}: define "attributes", "elements" or "fileAttribute"/"functionAttribute".`);
        return;
      }
      rules.push({
        files,
        attributes,
        elements,
        ...(hasFileAttr
          ? { fileAttribute: (r.fileAttribute as string).trim(), functionAttribute: (r.functionAttribute as string).trim() }
          : {}),
      });
    });
  }

  const hash = crypto.createHash('sha256').update(JSON.stringify({ rules, heuristic })).digest('hex');
  return { rules, warnings, hash, heuristic };
}

/** Matches workspace-relative paths against rule globs. */
export class RuleMatcher {
  private readonly matchers: { rule: DeclarativeRule; ig: Ignore }[];

  constructor(rules: DeclarativeRule[]) {
    this.matchers = rules.map((rule) => ({ rule, ig: ignore().add(rule.files) }));
  }

  /** Rules whose globs match the path (in configuration order). */
  rulesFor(relPath: string): DeclarativeRule[] {
    const p = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!p) return [];
    return this.matchers.filter((m) => m.ig.ignores(p)).map((m) => m.rule);
  }

  get isEmpty(): boolean {
    return this.matchers.length === 0;
  }
}
