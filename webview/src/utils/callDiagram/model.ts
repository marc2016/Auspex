import type { TreeNode } from '../../../../src/analyzer/types';
import type { CallFunctionRef } from '../../../../src/analyzer/calls/types';
import type { CallDiagramData } from '../../../../src/analyzer/calls/diagramData';
import { compactTree, type CompactedTreeNode } from '../systemMapUtils';

export type DiagramNodeKind = 'root' | 'folder' | 'namespace' | 'file' | 'class' | 'function';

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
}

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

/**
 * Builds the frame hierarchy of a diagram from the scoped tree: single-child folder chains are
 * compacted, files and classes become frames, methods become function leaves and nested helpers are
 * flattened into the frame of their top-level method. Frames without functions are dropped unless
 * they are files referencing functions (declarative location callers).
 */
export function buildDiagramModel(data: CallDiagramData): DiagramNode | null {
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
