import type { ClassInfo, MethodInfo, ParsedFileInfo, TreeNode } from '../types';
import type { CallFunctionRef, FunctionId } from './types';

/** A known function with everything the resolver needs. */
export interface IndexedFunction extends CallFunctionRef {
  /** Last name segment without parentheses (`validate` for `Cart > validate()`). */
  name: string;
  /** Container name if the function is a direct method of a container (`Cart`, `Foo.prototype`). */
  container?: string;
  /** True for nested helpers (`parent > child`). */
  nested: boolean;
  /** True for the body of a constructor/component (`Cart()` of container `Cart`). */
  isContainerBody: boolean;
  /** Extractor method name (`add()`), used to match call sites to their caller. */
  methodName: string;
}

const stripParens = (name: string) => name.replace(/\(\)$/, '');

/** `Foo.prototype` and `Foo` denote the same container for call resolution. */
export function normalizeContainerName(name: string): string {
  return name.replace(/\.prototype$/, '');
}

/** Innermost class whose method list contains a method with this name and start line. */
function findOwningClass(classes: ClassInfo[], m: MethodInfo): ClassInfo | undefined {
  let best: ClassInfo | undefined;
  for (const c of classes) {
    const owns = c.methods.some((x) => x.name === m.name && x.startLine === m.startLine);
    if (!owns) continue;
    if (!best || c.endLine - c.startLine < best.endLine - best.startLine) best = c;
  }
  return best;
}

/** Container whose body is this method (same name and same start line). */
function findBodyClass(classes: ClassInfo[], m: MethodInfo): ClassInfo | undefined {
  const base = stripParens(m.name);
  return classes.find(
    (c) => c.name === base && c.startLine === m.startLine && (c.kind === 'constructor' || c.kind === 'component')
  );
}

/**
 * Builds the qualified name of a method:
 * - container body (`Cart()` of container `Cart`) -> `Cart`
 * - direct container method -> `Cart.add`
 * - nested helper `load > parse()` inside `Cart.load` -> `Cart.load > parse`
 * - top-level function -> `main`
 */
function qualify(file: ParsedFileInfo, m: MethodInfo): { qualifiedName: string; container?: string; isContainerBody: boolean } {
  const segments = stripParens(m.name).split(' > ');
  const head = segments[0];

  // Top-level method entry that the head segment refers to (the method itself if not nested)
  const headMethod =
    segments.length === 1
      ? m
      : file.methods.find(
          (x) => x.name === `${head}()` && x.startLine <= m.startLine && x.endLine >= m.endLine
        );

  let headQualified = head;
  let container: string | undefined;
  let isContainerBody = false;

  if (headMethod) {
    if (findBodyClass(file.classes, headMethod)) {
      isContainerBody = segments.length === 1;
    } else {
      const owner = findOwningClass(file.classes, headMethod);
      if (owner) {
        headQualified = `${owner.name}.${head}`;
        if (segments.length === 1) container = owner.name;
      }
    }
  }

  return {
    qualifiedName: [headQualified, ...segments.slice(1)].join(' > '),
    container,
    isContainerBody,
  };
}

/** Builds indexed functions with unique FunctionIds for one file. */
export function indexFileFunctions(file: ParsedFileInfo): IndexedFunction[] {
  const result: IndexedFunction[] = [];
  const seen = new Map<string, number>();
  const qualified = file.methods.map((m) => ({ m, q: qualify(file, m) }));

  for (const { q } of qualified) seen.set(q.qualifiedName, (seen.get(q.qualifiedName) ?? 0) + 1);

  for (const { m, q } of qualified) {
    const duplicate = (seen.get(q.qualifiedName) ?? 0) > 1;
    const id: FunctionId = `${file.filePath}#${q.qualifiedName}${duplicate ? `@${m.startLine}` : ''}`;
    const segments = stripParens(m.name).split(' > ');
    result.push({
      id,
      file: file.filePath,
      qualifiedName: q.qualifiedName,
      startLine: m.startLine,
      endLine: m.endLine,
      name: segments[segments.length - 1],
      container: q.container,
      nested: segments.length > 1,
      isContainerBody: q.isContainerBody,
      methodName: m.name,
    });
  }
  return result;
}

/** Lookup structure over all known functions of the workspace. */
export class FunctionIndex {
  readonly all: IndexedFunction[] = [];
  private readonly byId = new Map<FunctionId, IndexedFunction>();
  private readonly byFile = new Map<string, IndexedFunction[]>();
  private readonly byName = new Map<string, IndexedFunction[]>();
  private readonly byContainer = new Map<string, Map<string, IndexedFunction[]>>();
  private readonly containerBodies = new Map<string, IndexedFunction[]>();

  constructor(files: ParsedFileInfo[]) {
    for (const file of files) {
      const fns = indexFileFunctions(file);
      this.byFile.set(file.filePath, fns);
      for (const fn of fns) {
        this.all.push(fn);
        this.byId.set(fn.id, fn);
        push(this.byName, fn.name, fn);
        if (fn.container) {
          const key = normalizeContainerName(fn.container);
          let methods = this.byContainer.get(key);
          if (!methods) this.byContainer.set(key, (methods = new Map()));
          push(methods, fn.name, fn);
        }
        if (fn.isContainerBody) push(this.containerBodies, fn.name, fn);
      }
    }
  }

  get(id: FunctionId): IndexedFunction | undefined {
    return this.byId.get(id);
  }

  inFile(file: string): IndexedFunction[] {
    return this.byFile.get(file) ?? [];
  }

  /** The function a call site belongs to. */
  caller(file: string, methodName: string, startLine: number): IndexedFunction | undefined {
    return this.inFile(file).find((f) => f.methodName === methodName && f.startLine === startLine);
  }

  /** Functions with this (last-segment) name across the workspace. */
  named(name: string): IndexedFunction[] {
    return this.byName.get(name) ?? [];
  }

  /** Whether a container with this name (or `Name.prototype`) exists. */
  hasContainer(name: string): boolean {
    return this.byContainer.has(normalizeContainerName(name)) || this.containerBodies.has(name);
  }

  /** Methods named `method` of the container `container` (`Foo` and `Foo.prototype` are merged). */
  containerMethods(container: string, method: string): IndexedFunction[] {
    return this.byContainer.get(normalizeContainerName(container))?.get(method) ?? [];
  }

  /** Container names, for case-insensitive receiver matching. */
  containerNames(): string[] {
    return [...this.byContainer.keys()];
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Finds the tree node of a function by file and start line (for metrics in the views). */
export function findTreeNodeForFunction(root: TreeNode, fn: CallFunctionRef): TreeNode | null {
  const target = fn.file.replace(/\\/g, '/').replace(/^\/+/, '');
  let fileNode: TreeNode | null = null;
  const findFile = (n: TreeNode): void => {
    if (fileNode) return;
    if (n.type === 'file' && n.path.replace(/\\/g, '/').replace(/^\/+/, '') === target) {
      fileNode = n;
      return;
    }
    n.children?.forEach(findFile);
  };
  findFile(root);
  if (!fileNode) return null;

  let match: TreeNode | null = null;
  const findMethod = (n: TreeNode): void => {
    if (match) return;
    if (n.type === 'method' && n.startLine === fn.startLine && n.endLine === fn.endLine) {
      match = n;
      return;
    }
    n.children?.forEach(findMethod);
  };
  findMethod(fileNode);
  return match;
}
