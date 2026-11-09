import path from 'path';
import type { ParsedFileInfo } from '../types';
import { normalizeContainerName, type FunctionIndex, type IndexedFunction } from './functionIndex';
import type { CallConfidence, CallEdge, CallEdgeSource, CallEdgeSourceContext, CallSite, FileImport } from './types';

const AMD_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', ''];
const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Methods of built-in JavaScript, Node and DOM objects. Member calls with these names on receivers of
 * unknown type are not matched to workspace methods by name (e.g. `map.get()`, `list.push()`).
 */
export const BUILTIN_METHOD_NAMES = new Set([
  // Array
  'at', 'concat', 'copyWithin', 'entries', 'every', 'fill', 'filter', 'find', 'findIndex', 'findLast',
  'findLastIndex', 'flat', 'flatMap', 'forEach', 'includes', 'indexOf', 'join', 'keys', 'lastIndexOf',
  'map', 'pop', 'push', 'reduce', 'reduceRight', 'reverse', 'shift', 'slice', 'some', 'sort', 'splice',
  'unshift', 'values', 'toSorted', 'toReversed', 'with',
  // Map / Set / WeakMap
  'get', 'set', 'has', 'delete', 'clear', 'add',
  // String / RegExp
  'charAt', 'charCodeAt', 'codePointAt', 'endsWith', 'localeCompare', 'match', 'matchAll', 'normalize',
  'padEnd', 'padStart', 'repeat', 'replace', 'replaceAll', 'search', 'split', 'startsWith', 'substring',
  'substr', 'toLowerCase', 'toUpperCase', 'trim', 'trimEnd', 'trimStart', 'test', 'exec',
  // Object / Number / Math / JSON / Date
  'toString', 'valueOf', 'hasOwnProperty', 'toFixed', 'toPrecision', 'max', 'min', 'abs', 'round',
  'floor', 'ceil', 'sqrt', 'pow', 'random', 'parse', 'stringify', 'getTime', 'toISOString',
  'assign', 'freeze',
  // Promise
  'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'race',
  // events, messaging, DOM
  'on', 'off', 'once', 'emit', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'postMessage',
  'querySelector', 'querySelectorAll', 'getElementById', 'appendChild', 'removeChild', 'setAttribute',
  'getAttribute', 'focus', 'blur', 'click',
  // Node streams / fs basics, lifecycle
  'write', 'end', 'read', 'pipe', 'close', 'dispose', 'bind', 'call', 'apply',
]);

/**
 * Resolves call sites extracted from JavaScript/TypeScript files to call edges between known
 * functions (Auspex's own resolver, source kind `js`).
 */
export class JsCallResolver implements CallEdgeSource {
  readonly kind = 'js' as const;

  collect(ctx: CallEdgeSourceContext): CallEdge[] {
    const filePaths = new Set(ctx.files.map((f) => f.filePath));
    const edges: CallEdge[] = [];
    for (const file of ctx.files) {
      if (!file.callSites || file.callSites.length === 0) continue;
      const imports = new Map((file.imports ?? []).map((i) => [i.local, i]));
      for (const site of file.callSites) {
        const caller = ctx.index.caller(file.filePath, site.callerName, site.callerStartLine);
        if (!caller) continue;
        for (const edge of this.resolveSite(site, caller, file, imports, ctx.index, filePaths)) {
          edges.push(edge);
        }
      }
    }
    return edges;
  }

  private resolveSite(
    site: CallSite,
    caller: IndexedFunction,
    file: ParsedFileInfo,
    imports: Map<string, FileImport>,
    index: FunctionIndex,
    filePaths: Set<string>
  ): CallEdge[] {
    switch (site.receiverKind) {
      case 'none': {
        const imported = imports.get(site.callee);
        if (imported) return this.resolveImportedCall(imported, caller, file, index, filePaths);
        return this.resolveBare(site, caller, file, index);
      }
      case 'this':
        return this.resolveThis(site, caller, index);
      case 'amd':
        return this.resolveAmd(site, caller, file, index, filePaths);
      case 'other': {
        const receiver = site.receiver ?? '';
        const imported = receiver.includes('.') ? undefined : imports.get(receiver);
        if (imported) return this.resolveImportedReceiver(imported, site, caller, file, index, filePaths);
        if (site.receiverType) return this.resolveTyped(site.receiverType, site, caller, imports, file, index, filePaths);
        return this.resolveOther(site, caller, index);
      }
    }
  }

  /**
   * `name()`: visible functions in the same file first. Otherwise, in an ES module, nothing (module
   * code must import other files' functions); in a script, global functions by name.
   */
  private resolveBare(site: CallSite, caller: IndexedFunction, file: ParsedFileInfo, index: FunctionIndex): CallEdge[] {
    const sameFile = index
      .inFile(caller.file)
      .filter((f) => f.name === site.callee && !f.container && isVisibleFrom(f, caller, index));
    if (sameFile.length > 0) return edgesTo(caller, sameFile);
    if (file.isModule) return [];

    const global = index.named(site.callee).filter((f) => !f.nested && !f.container);
    return edgesTo(caller, global, 'inferred');
  }

  /** Bare call of an imported name: the imported top-level function (or class/constructor body). */
  private resolveImportedCall(
    imp: FileImport,
    caller: IndexedFunction,
    file: ParsedFileInfo,
    index: FunctionIndex,
    filePaths: Set<string>
  ): CallEdge[] {
    const target = resolveModuleFile(imp.source, file.filePath, filePaths);
    if (!target) return [];
    const topLevel = index.inFile(target).filter((f) => !f.nested && !f.container);
    let candidates: IndexedFunction[];
    if (imp.imported === 'default' || imp.imported === '*') {
      const byLocal = topLevel.filter((f) => f.name === imp.local);
      candidates = byLocal.length > 0 ? byLocal : topLevel.length === 1 ? topLevel : [];
    } else {
      candidates = topLevel.filter((f) => f.name === imp.imported);
    }
    return edgesTo(caller, candidates);
  }

  /** `imported.name()`: function of a namespace import, or method of an imported container. */
  private resolveImportedReceiver(
    imp: FileImport,
    site: CallSite,
    caller: IndexedFunction,
    file: ParsedFileInfo,
    index: FunctionIndex,
    filePaths: Set<string>
  ): CallEdge[] {
    const target = resolveModuleFile(imp.source, file.filePath, filePaths);
    if (!target) return [];
    const inTarget = index.inFile(target);
    const containerName = imp.imported === '*' || imp.imported === 'default' ? imp.local : imp.imported;
    const methods = inTarget.filter(
      (f) => f.container !== undefined && normalizeContainerName(f.container) === normalizeContainerName(containerName) && f.name === site.callee
    );
    if (methods.length > 0) return edgesTo(caller, methods);
    if (imp.imported === '*') {
      return edgesTo(caller, inTarget.filter((f) => !f.nested && !f.container && f.name === site.callee));
    }
    return [];
  }

  /** `recv.name()` with a known receiver type: only methods of that container (none for library types). */
  private resolveTyped(
    type: string,
    site: CallSite,
    caller: IndexedFunction,
    imports: Map<string, FileImport>,
    file: ParsedFileInfo,
    index: FunctionIndex,
    filePaths: Set<string>
  ): CallEdge[] {
    const imp = imports.get(type);
    if (imp) return this.resolveImportedReceiver({ ...imp, local: type }, site, caller, file, index, filePaths);
    if (!index.hasContainer(type)) return [];
    return edgesTo(caller, preferFile(index.containerMethods(type, site.callee), caller.file));
  }

  /** `this.name()` / `self.name()`: method of the caller's container. */
  private resolveThis(site: CallSite, caller: IndexedFunction, index: FunctionIndex): CallEdge[] {
    const container = containerOf(caller, index);
    if (container) {
      const methods = index.containerMethods(container, site.callee);
      if (methods.length > 0) return edgesTo(caller, methods);
    }
    // Unknown container (e.g. inherited method): unique, non-built-in method name only
    return edgesTo(caller, uniqueMethodByName(index, site.callee), 'inferred');
  }

  /** `Param.name()` where Param is an AMD factory parameter: function in the dependency's file. */
  private resolveAmd(
    site: CallSite,
    caller: IndexedFunction,
    file: ParsedFileInfo,
    index: FunctionIndex,
    filePaths: Set<string>
  ): CallEdge[] {
    const depId = site.receiver ? file.amdDependencies?.[site.receiver] : undefined;
    if (!depId) return [];
    const targets = resolveAmdFiles(depId, file.filePath, filePaths);
    if (targets.length === 0) return [];

    const candidates = targets.flatMap((t) =>
      index.inFile(t).filter((f) => f.name === site.callee && !f.nested)
    );
    const confidence = targets.length === 1 && candidates.length === 1 ? 'certain' : 'inferred';
    return edgesTo(caller, candidates, confidence);
  }

  /**
   * `obj.name()`: container named like the receiver; otherwise, unless `name` is a built-in method,
   * the only container method with that name (no edge if there are several).
   */
  private resolveOther(site: CallSite, caller: IndexedFunction, index: FunctionIndex): CallEdge[] {
    const receiver = (site.receiver ?? '').split('.').pop() ?? '';

    if (receiver && index.hasContainer(receiver)) {
      const methods = preferFile(index.containerMethods(receiver, site.callee), caller.file);
      if (methods.length > 0) return edgesTo(caller, methods);
    }

    const lower = receiver.toLowerCase();
    const caseInsensitive = index.containerNames().filter((c) => c !== receiver && c.toLowerCase() === lower);
    const ciMethods = caseInsensitive.flatMap((c) => index.containerMethods(c, site.callee));
    if (ciMethods.length > 0) return edgesTo(caller, ciMethods, 'inferred');

    return edgesTo(caller, uniqueMethodByName(index, site.callee), 'inferred');
  }
}

function edgesTo(caller: IndexedFunction, targets: IndexedFunction[], forced?: CallConfidence): CallEdge[] {
  const unique = [...new Map(targets.map((t) => [t.id, t])).values()];
  const confidence = forced ?? (unique.length === 1 ? 'certain' : 'inferred');
  return unique.map((t) => ({ from: caller.id, to: t.id, confidence, source: 'js' as const }));
}

/** Candidates in the given file if there are any (a local class shadows same-named classes elsewhere). */
function preferFile(candidates: IndexedFunction[], file: string): IndexedFunction[] {
  const local = candidates.filter((c) => c.file === file);
  return local.length > 0 ? local : candidates;
}

/** The single container method with this name, unless the name is a built-in method name. */
function uniqueMethodByName(index: FunctionIndex, name: string): IndexedFunction[] {
  if (BUILTIN_METHOD_NAMES.has(name)) return [];
  const methods = index.named(name).filter((f) => !!f.container);
  return methods.length === 1 ? methods : [];
}

/**
 * Workspace file of a relative module specifier: the path itself, with a JS/TS extension, a `.js`
 * specifier mapped to `.ts`/`.tsx`, or an `index` file in that folder. Undefined if nothing matches.
 */
export function resolveModuleFile(source: string, fromFile: string, filePaths: Set<string>): string | undefined {
  if (!source.startsWith('.')) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), source));
  const candidates = [base, ...MODULE_EXTENSIONS.map((e) => base + e)];
  const jsExt = base.match(/\.(?:js|jsx|mjs|cjs)$/);
  if (jsExt) {
    const stem = base.slice(0, -jsExt[0].length);
    candidates.push(stem + '.ts', stem + '.tsx');
  }
  candidates.push(...MODULE_EXTENSIONS.map((e) => `${base}/index${e}`));
  return candidates.find((c) => filePaths.has(c));
}

/** Innermost other function in the same file that strictly contains `fn`. */
function parentOf(fn: IndexedFunction, index: FunctionIndex): IndexedFunction | undefined {
  let best: IndexedFunction | undefined;
  for (const f of index.inFile(fn.file)) {
    if (f === fn) continue;
    if (f.startLine <= fn.startLine && f.endLine >= fn.endLine && !(f.startLine === fn.startLine && f.endLine === fn.endLine)) {
      if (!best || f.endLine - f.startLine < best.endLine - best.startLine) best = f;
    }
  }
  return best;
}

/** A nested helper is only callable from inside its parent function. */
function isVisibleFrom(fn: IndexedFunction, caller: IndexedFunction, index: FunctionIndex): boolean {
  if (!fn.nested) return true;
  const parent = parentOf(fn, index);
  if (!parent) return true;
  return caller.startLine >= parent.startLine && caller.endLine <= parent.endLine;
}

/** Container whose `this` applies inside the caller (`Cart` for `Cart.add`, `Cart`, `Cart.load > parse`). */
function containerOf(caller: IndexedFunction, index: FunctionIndex): string | undefined {
  if (caller.container) return caller.container;
  if (caller.isContainerBody) return caller.name;
  const head = caller.qualifiedName.split(' > ')[0];
  const dot = head.lastIndexOf('.');
  if (dot > 0) return head.slice(0, dot);
  const headFn = index.inFile(caller.file).find((f) => f.qualifiedName === head);
  return headFn?.isContainerBody ? headFn.name : undefined;
}

/** Workspace files an AMD dependency id may refer to. */
export function resolveAmdFiles(depId: string, fromFile: string, filePaths: Set<string>): string[] {
  const id = depId.replace(/^[^!]*!/, ''); // strip loader plugins like "text!"
  const bases: string[] = [];
  if (id.startsWith('./') || id.startsWith('../')) {
    bases.push(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), id)));
  } else {
    bases.push(id);
  }

  for (const base of bases) {
    for (const ext of AMD_EXTENSIONS) {
      if (filePaths.has(base + ext)) return [base + ext];
    }
  }

  // Unknown baseUrl: match by path suffix
  if (id.startsWith('.')) return [];
  const suffixes = AMD_EXTENSIONS.filter((e) => e).map((e) => `/${id}${e}`);
  return [...filePaths].filter((p) => suffixes.some((s) => p.endsWith(s)));
}
