import type { AnalysisSnapshot, TreeNode } from '../types';
import { isLocationCaller, type CallGraph } from './types';

/** Data one call diagram tab needs: the scoped subtree and the call edges touching it. */
export interface CallDiagramData {
  /** Workspace-relative folder path of the scope ('' = whole workspace). */
  scopePath: string;
  tree: TreeNode | null;
  callGraph: CallGraph;
  /** Files classified as hotspots by the analysis. */
  hotspotFiles: string[];
}

export const normalizeScopePath = (p: string): string => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

/** Folder node of the tree with the given workspace-relative path ('' = root). */
export function findFolderNode(root: TreeNode, scopePath: string): TreeNode | null {
  const target = normalizeScopePath(scopePath);
  if (!target) return root;
  let found: TreeNode | null = null;
  const walk = (n: TreeNode) => {
    if (found) return;
    if (n.type === 'folder' && normalizeScopePath(n.path) === target) {
      found = n;
      return;
    }
    n.children?.forEach(walk);
  };
  walk(root);
  return found;
}

export const isInScope = (file: string, scopePath: string): boolean => {
  const scope = normalizeScopePath(scopePath);
  return !scope || file === scope || file.startsWith(`${scope}/`);
};

/** Builds the data of a diagram scoped to a folder: edges with caller or callee in scope. */
export function buildCallDiagramData(snapshot: AnalysisSnapshot | null, scopePath: string): CallDiagramData {
  const scope = normalizeScopePath(scopePath);
  const empty: CallGraph = { functions: [], edges: [], counts: {} };
  if (!snapshot) return { scopePath: scope, tree: null, callGraph: empty, hotspotFiles: [] };

  const tree = findFolderNode(snapshot.tree, scope);
  const graph = snapshot.callGraph ?? empty;
  const fileOf = new Map(graph.functions.map((f) => [f.id, f.file]));
  const callerFile = (from: (typeof graph.edges)[number]['from']) =>
    isLocationCaller(from) ? from.file : fileOf.get(from);

  const edges = graph.edges.filter((e) => {
    const cf = callerFile(e.from);
    const tf = fileOf.get(e.to);
    return (cf !== undefined && isInScope(cf, scope)) || (tf !== undefined && isInScope(tf, scope));
  });
  const used = new Set<string>();
  for (const e of edges) {
    if (!isLocationCaller(e.from)) used.add(e.from);
    used.add(e.to);
  }
  const functions = graph.functions.filter((f) => isInScope(f.file, scope) || used.has(f.id));
  const counts: CallGraph['counts'] = {};
  for (const f of functions) if (graph.counts[f.id]) counts[f.id] = graph.counts[f.id];

  return {
    scopePath: scope,
    tree,
    callGraph: { functions, edges, counts },
    hotspotFiles: (snapshot.hotspots ?? []).map((h) => normalizeScopePath(h.filePath)),
  };
}
