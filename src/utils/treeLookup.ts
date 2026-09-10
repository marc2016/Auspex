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
