import type { TreeNode } from '../analyzer/types';

/**
 * Searches a TreeNode hierarchy for a 'file' node matching the given relative file path.
 * Normalizes slashes and leading/trailing slashes for cross-platform compatibility.
 */
export function findFileNode(root: TreeNode, relativeFilePath: string): TreeNode | null {
  if (!root || !relativeFilePath) return null;
  const targetNormalized = relativeFilePath.replace(/\\/g, '/').replace(/^\/+/, '');

  function search(node: TreeNode): TreeNode | null {
    if (node.type === 'file') {
      const nodeNormalized = node.path.replace(/\\/g, '/').replace(/^\/+/, '');
      if (nodeNormalized === targetNormalized) {
        return node;
      }
    }

    if (node.children) {
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
    }

    return null;
  }

  return search(root);
}

/** First node of the given type below (or at) `node` that starts at `startLine`. */
export function findNodeAt(node: TreeNode, startLine: number, type: TreeNode['type']): TreeNode | null {
  if (node.type === type && node.startLine === startLine) return node;
  for (const child of node.children ?? []) {
    const found = findNodeAt(child, startLine, type);
    if (found) return found;
  }
  return null;
}

/**
 * Node selected from a diagram box: the class starting at `startLine` in the file when a line is
 * given, otherwise the file node itself.
 */
export function findDiagramNode(root: TreeNode, filePath: string, startLine?: number): TreeNode | null {
  const fileNode = findFileNode(root, filePath);
  if (!fileNode) return null;
  if (startLine === undefined) return fileNode;
  return findNodeAt(fileNode, startLine, 'class');
}
