import type { TreeNode } from '../../../../src/analyzer/types';
import type { CallFunctionRef } from '../../../../src/analyzer/calls/types';
import type { CallDiagramData } from '../../../../src/analyzer/calls/diagramData';
import { compactTree, type CompactedTreeNode } from '../systemMapUtils';

export type DiagramNodeKind = 'root' | 'folder' | 'namespace' | 'file' | 'class' | 'loose' | 'function';

/** Detail level of a diagram: function boxes, class boxes or file boxes. */
export type DiagramLevel = 'functions' | 'classes' | 'files';

/** Node of the diagram hierarchy: frames (folder/namespace/file/class) and function leaves. */
export interface DiagramNode {
  key: string;
  kind: DiagramNodeKind;
  name: string;
  children: DiagramNode[];
  /** Workspace-relative file of a file frame or function. */
  file?: string;
  /** Workspace-relative folder path of a folder frame (for "open diagram for folder"). */
  folderPath?: string;
  fnId?: string;
  startLine?: number;
  endLine?: number;
  loc?: number;
  codeHealth?: number;
  churnScore?: number;
  hotspot?: boolean;
  /**
   * Set on boxes of the class and file levels: keys of the function leaves the box stands for. Its
   * presence marks a box leaf (a collapsed class, file or the loose functions of a file).
   */
  members?: string[];
}

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

/**
 * Builds the frame hierarchy of a diagram from the scoped tree: single-child folder chains are
 * compacted, files and classes become frames, methods become function leaves and nested helpers are
 * flattened into the frame of their top-level method. Frames without functions are dropped unless
 * they are files referencing functions (declarative location callers).
 */
export function buildDiagramModel(
  data: CallDiagramData,
  options: { functions?: Set<string> } = {}
): DiagramNode | null {
  if (!data.tree) return null;
  const fnByLocation = new Map<string, CallFunctionRef>();
  for (const fn of data.callGraph.functions) fnByLocation.set(`${fn.file}:${fn.startLine}:${fn.endLine}`, fn);
  const hotspots = new Set(data.hotspotFiles.map(normPath));
  const callerFiles = new Set(
    data.callGraph.edges.flatMap((e) => (typeof e.from === 'string' ? [] : [normPath(e.from.file)]))
  );

  const compacted = compactTree(data.tree, true);

  const functionLeaves = (method: TreeNode, file: string): DiagramNode[] => {
    const leaves: DiagramNode[] = [];
    const visit = (m: TreeNode) => {
      if (m.type === 'method') {
        const fn = fnByLocation.get(`${file}:${m.startLine}:${m.endLine}`);
        if (options.functions && (!fn || !options.functions.has(fn.id))) {
          m.children?.forEach(visit);
          return;
        }
        leaves.push({
          key: fn?.id ?? `${file}#${m.name}@${m.startLine}`,
          kind: 'function',
          name: fn ? fn.qualifiedName.split(' > ').pop()!.split('.').pop()! : m.name.replace(/\(\)$/, ''),
          children: [],
          file,
          fnId: fn?.id,
          startLine: m.startLine,
          endLine: m.endLine,
          loc: m.loc,
          codeHealth: m.codeHealth,
          churnScore: m.churnScore,
          hotspot: hotspots.has(file),
        });
      }
      m.children?.forEach(visit);
    };
    visit(method);
    return leaves;
  };

  const convert = (n: CompactedTreeNode | TreeNode, file?: string): DiagramNode | null => {
    if (n.type === 'method') return null; // handled by functionLeaves
    const nodeFile = n.type === 'file' ? normPath(n.path) : file;
    const kind: DiagramNodeKind = n.type === 'file' ? 'file' : n.type === 'class' ? 'class' : n.type === 'namespace' ? 'namespace' : 'folder';
    const children: DiagramNode[] = [];
    for (const child of n.children ?? []) {
      if (child.type === 'method' && nodeFile) children.push(...functionLeaves(child, nodeFile));
      else {
        const c = convert(child, nodeFile);
        if (c) children.push(c);
      }
    }
    const keep = children.length > 0 || (kind === 'file' && !!nodeFile && callerFiles.has(nodeFile));
    if (!keep) return null;
    return {
      key: `${kind}:${n.path}`,
      kind,
      name: n.name,
      children,
      ...(nodeFile ? { file: nodeFile } : {}),
      ...(kind === 'folder' ? { folderPath: normPath(n.path) } : {}),
      ...(kind === 'file' ? { hotspot: hotspots.has(nodeFile!) } : {}),
      ...(kind === 'file' || kind === 'class'
        ? { startLine: n.startLine, endLine: n.endLine, loc: n.loc, codeHealth: n.codeHealth, churnScore: n.churnScore }
        : {}),
      ...(kind === 'class' && nodeFile ? { hotspot: hotspots.has(nodeFile) } : {}),
    };
  };

  const children = (compacted.children ?? [])
    .map((c) => (c.type === 'method' ? null : convert(c)))
    .filter((c): c is DiagramNode => !!c);
  return { key: `root:${data.scopePath}`, kind: 'root', name: data.scopePath || data.tree.name, children };
}

/** All function leaves of a model. */
export function functionNodes(root: DiagramNode): DiagramNode[] {
  const out: DiagramNode[] = [];
  const walk = (n: DiagramNode) => {
    if (n.kind === 'function') out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** True for leaves that stand for a group of functions (class, file or loose-functions boxes). */
export function isBox(n: Pick<DiagramNode, 'members'>): boolean {
  return n.members !== undefined;
}

/**
 * Collapses a model to a detail level. At `files`, every file frame becomes a leaf; at `classes`, the
 * outermost class below a file becomes a leaf (nested containers are merged into it) and the function
 * leaves directly in a file form one `loose` leaf per file. Leaves get the keys of the functions they
 * replace as `members`. File frames without functions (declarative callers) become leaves without
 * members at both levels. At `functions` the model is returned unchanged.
 */
export function collapseModel(model: DiagramNode, level: DiagramLevel): DiagramNode {
  if (level === 'functions') return model;
  const leaf = (n: DiagramNode, kind: DiagramNodeKind = n.kind, extra: Partial<DiagramNode> = {}): DiagramNode => ({
    ...n,
    kind,
    children: [],
    members: functionNodes(n).map((f) => f.key),
    ...extra,
  });
  const collapseFile = (file: DiagramNode): DiagramNode => {
    if (level === 'files' || file.children.length === 0) return leaf(file);
    const loose = file.children.filter((c) => c.kind === 'function');
    const children = file.children.filter((c) => c.kind !== 'function').map(collapseInFile);
    if (loose.length > 0) {
      const fileHotspot = file.hotspot;
      children.unshift({
        key: `loose:${file.file ?? file.key}`,
        kind: 'loose',
        name: file.name,
        children: [],
        file: file.file,
        loc: loose.reduce((sum, f) => sum + (f.loc ?? 0), 0),
        codeHealth: file.codeHealth,
        churnScore: file.churnScore,
        hotspot: fileHotspot,
        members: loose.map((f) => f.key),
      });
    }
    return { ...file, children };
  };
  // Below a file at the class level: the first class reached is the box, namespaces stay frames
  const collapseInFile = (n: DiagramNode): DiagramNode => {
    if (n.kind === 'class') return leaf(n);
    if (n.kind === 'function') return n;
    return { ...n, children: n.children.map(collapseInFile) };
  };
  const walk = (n: DiagramNode): DiagramNode => {
    if (n.kind === 'file') return collapseFile(n);
    return { ...n, children: n.children.map(walk) };
  };
  return walk(model);
}
