import type { TreeNode } from '../../../src/analyzer/types';

export interface CompactedTreeNode extends TreeNode {
  compactedPaths?: string[];
  children?: CompactedTreeNode[];
}

/**
 * Compacts intermediate single-child folder chains (e.g. webview -> src -> components)
 * into a single folder node with a chained name (e.g. "webview/src/components").
 * This avoids concentric redundant circles and overlapping labels in Circle Packing.
 */
export function compactTree(node: TreeNode, isRoot = true): CompactedTreeNode {
  // Deep clone or construct clean copy so original tree is not mutated
  const copy: CompactedTreeNode = {
    ...node,
    compactedPaths: [node.path],
  };

  if (!node.children || node.children.length === 0) {
    copy.children = [];
    return copy;
  }

  // Recursively compact all children first
  let processedChildren: CompactedTreeNode[] = node.children.map((child) =>
    compactTree(child, false)
  );

  // If this is not the root node, and it has exactly 1 child which is a folder,
  // collapse this node and child into one single node.
  if (!isRoot && processedChildren.length === 1 && processedChildren[0].type === 'folder') {
    const singleChild = processedChildren[0];
    const chainedName = `${node.name}/${singleChild.name}`;
    const mergedPaths = [
      ...(copy.compactedPaths || [node.path]),
      ...(singleChild.compactedPaths || [singleChild.path]),
    ];

    return {
      ...singleChild,
      name: chainedName,
      compactedPaths: mergedPaths,
      // Retain the child's children (already recursively compacted)
      children: singleChild.children,
    };
  }

  copy.children = processedChildren;
  return copy;
}

/**
 * Calculates whether a folder label should be visible based on zoom scale k and screen radius.
 */
export function shouldShowFolderLabel(
  depth: number,
  screenRadius: number,
  k: number,
  containerDim: number
): boolean {
  // Circle must be large enough on screen to hold text (at least ~70px diameter)
  if (screenRadius < 35) {
    return false;
  }

  // If circle is huge (taking up entire viewport or far offscreen), hide its top label
  // so it doesn't block the child clusters.
  if (screenRadius > containerDim * 1.1) {
    return false;
  }

  // Level of Detail (LoD) based on zoom factor k
  if (k <= 1.25) {
    // Overview: only top-level clusters
    return depth === 1;
  } else if (k <= 2.8) {
    // Medium zoom: show depth 1 and 2
    return depth <= 2;
  } else {
    // Deep zoom: show deeper clusters as long as circle is sufficiently large
    return true;
  }
}

/**
 * Truncates label text so it fits within the given diameter in screen pixels.
 */
export function truncateLabel(text: string, maxScreenPx: number, avgCharPx = 6.5): string {
  const maxChars = Math.floor(maxScreenPx / avgCharPx);
  if (maxChars <= 3) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 2)) + '..';
}
