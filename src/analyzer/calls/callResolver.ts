import path from 'path';
import type { ParsedFileInfo } from '../types';
import type { FunctionIndex, IndexedFunction } from './functionIndex';
import type { CallConfidence, CallEdge, CallEdgeSource, CallEdgeSourceContext, CallSite } from './types';

const AMD_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', ''];

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
      for (const site of file.callSites) {
        const caller = ctx.index.caller(file.filePath, site.callerName, site.callerStartLine);
        if (!caller) continue;
        for (const edge of this.resolveSite(site, caller, file, ctx.index, filePaths)) {
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
    index: FunctionIndex,
    filePaths: Set<string>
  ): CallEdge[] {
    switch (site.receiverKind) {
      case 'none':
        return this.resolveBare(site, caller, index);
      case 'this':
        return this.resolveThis(site, caller, index);
      case 'amd':
        return this.resolveAmd(site, caller, file, index, filePaths);
      case 'other':
        return this.resolveOther(site, caller, index);
    }
  }

  /** `name()`: visible functions in the same file first, otherwise global functions by name. */
  private resolveBare(site: CallSite, caller: IndexedFunction, index: FunctionIndex): CallEdge[] {
    const sameFile = index
      .inFile(caller.file)
      .filter((f) => f.name === site.callee && !f.container && isVisibleFrom(f, caller, index));
    if (sameFile.length > 0) return edgesTo(caller, sameFile);

    const global = index.named(site.callee).filter((f) => !f.nested && !f.container);
    return edgesTo(caller, global, 'inferred');
  }

  /** `this.name()` / `self.name()`: method of the caller's container. */
  private resolveThis(site: CallSite, caller: IndexedFunction, index: FunctionIndex): CallEdge[] {
    const container = containerOf(caller, index);
    if (container) {
      const methods = index.containerMethods(container, site.callee);
      if (methods.length > 0) return edgesTo(caller, methods);
    }
    // Unknown container (e.g. inherited method): any container method with that name
    return edgesTo(caller, containerMethodsNamed(index, site.callee), 'inferred');
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

  /** `obj.name()`: container named like the receiver, otherwise container methods by name. */
  private resolveOther(site: CallSite, caller: IndexedFunction, index: FunctionIndex): CallEdge[] {
    const receiver = (site.receiver ?? '').split('.').pop() ?? '';

    if (receiver && index.hasContainer(receiver)) {
      const methods = index.containerMethods(receiver, site.callee);
      if (methods.length > 0) return edgesTo(caller, methods);
    }

    const lower = receiver.toLowerCase();
    const caseInsensitive = index.containerNames().filter((c) => c !== receiver && c.toLowerCase() === lower);
    const ciMethods = caseInsensitive.flatMap((c) => index.containerMethods(c, site.callee));
    if (ciMethods.length > 0) return edgesTo(caller, ciMethods, 'inferred');

    return edgesTo(caller, containerMethodsNamed(index, site.callee), 'inferred');
  }
}

function edgesTo(caller: IndexedFunction, targets: IndexedFunction[], forced?: CallConfidence): CallEdge[] {
  const unique = [...new Map(targets.map((t) => [t.id, t])).values()];
  const confidence = forced ?? (unique.length === 1 ? 'certain' : 'inferred');
  return unique.map((t) => ({ from: caller.id, to: t.id, confidence, source: 'js' as const }));
}

function containerMethodsNamed(index: FunctionIndex, name: string): IndexedFunction[] {
  return index.named(name).filter((f) => !!f.container);
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
