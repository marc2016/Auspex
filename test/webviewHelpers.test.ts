import { describe, it, expect } from 'vitest';
import type { TreeNode } from '../src/analyzer/types';

// Webview pure helper functions to test
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'java', 'cs', 'py', 'go', 'rs', 'c', 'cpp', 'h', 'hpp',
]);

function filterSourceCodeOnly(node: TreeNode): TreeNode | null {
  if (node.type === 'file') {
    const ext = node.name.split('.').pop()?.toLowerCase() ?? '';
    return CODE_EXTENSIONS.has(ext) ? { ...node } : null;
  }

  if (node.children) {
    const filtered = node.children
      .map(filterSourceCodeOnly)
      .filter((c): c is TreeNode => c !== null);

    if (filtered.length === 0) return null;

    const totalLoc = filtered.reduce((sum, c) => sum + c.loc, 0);
    return {
      ...node,
      loc: totalLoc,
      value: totalLoc,
      children: filtered,
    };
  }

  return { ...node };
}

function getHeatColor(score: number, isLight: boolean): string {
  const normalized = Math.max(0, Math.min(score ?? 0, 1));
  let r: number, g: number, b: number;

  if (isLight) {
    if (normalized < 0.5) {
      const t = normalized * 2;
      r = Math.round(74 + t * (251 - 74));
      g = Math.round(222 + t * (191 - 222));
      b = Math.round(128 + t * (36 - 128));
    } else {
      const t = (normalized - 0.5) * 2;
      r = Math.round(251 + t * (248 - 251));
      g = Math.round(191 - t * (191 - 113));
      b = Math.round(36 + t * (113 - 36));
    }
    return `rgba(${r}, ${g}, ${b}, 0.95)`;
  }

  if (normalized < 0.5) {
    const t = normalized * 2;
    r = Math.round(34 + t * (234 - 34));
    g = Math.round(197 + t * (179 - 197));
    b = Math.round(94 + t * (8 - 94));
  } else {
    const t = (normalized - 0.5) * 2;
    r = Math.round(234 + t * (239 - 234));
    g = Math.round(179 - t * (179 - 68));
    b = Math.round(8 - t * 8);
  }

  return `rgba(${r}, ${g}, ${b}, 0.85)`;
}

function collectNodes(
  node: TreeNode,
  targetType: 'file' | 'class' | 'method',
  list: TreeNode[] = []
): TreeNode[] {
  if (node.type === targetType) {
    list.push(node);
    return list;
  }
  if (node.children) {
    for (const child of node.children) {
      collectNodes(child, targetType, list);
    }
  }
  return list;
}

describe('Webview Helpers', () => {
  describe('filterSourceCodeOnly', () => {
    it('removes non-code files and keeps only supported programming languages', () => {
      const tree: TreeNode = {
        name: 'root',
        path: '/',
        type: 'folder',
        value: 200,
        loc: 200,
        commitCount: 0,
        churnScore: 0,
        fixCount: 0,
        featCount: 0,
        refactorCount: 0,
        linesAdded: 0,
        linesDeleted: 0,
        children: [
          {
            name: 'src',
            path: '/src',
            type: 'folder',
            value: 100,
            loc: 100,
            commitCount: 0,
            churnScore: 0,
            fixCount: 0,
            featCount: 0,
            refactorCount: 0,
            linesAdded: 0,
            linesDeleted: 0,
            children: [
              {
                name: 'index.ts',
                path: '/src/index.ts',
                type: 'file',
                value: 100,
                loc: 100,
                commitCount: 0,
                churnScore: 0,
                fixCount: 0,
                featCount: 0,
                refactorCount: 0,
                linesAdded: 0,
                linesDeleted: 0,
              },
            ],
          },
          {
            name: 'docs',
            path: '/docs',
            type: 'folder',
            value: 100,
            loc: 100,
            commitCount: 0,
            churnScore: 0,
            fixCount: 0,
            featCount: 0,
            refactorCount: 0,
            linesAdded: 0,
            linesDeleted: 0,
            children: [
              {
                name: 'readme.txt',
                path: '/docs/readme.txt',
                type: 'file',
                value: 100,
                loc: 100,
                commitCount: 0,
                churnScore: 0,
                fixCount: 0,
                featCount: 0,
                refactorCount: 0,
                linesAdded: 0,
                linesDeleted: 0,
              },
            ],
          },
        ],
      };

      const filtered = filterSourceCodeOnly(tree);

      expect(filtered).toBeDefined();
      expect(filtered?.children?.length).toBe(1);
      expect(filtered?.children?.[0].name).toBe('src');
      expect(filtered?.loc).toBe(100);
    });
  });

  describe('getHeatColor', () => {
    it('returns higher-luminance colors in light mode', () => {
      const darkGreen = getHeatColor(0, false);
      const lightGreen = getHeatColor(0, true);

      expect(darkGreen).toBe('rgba(34, 197, 94, 0.85)');
      expect(lightGreen).toBe('rgba(74, 222, 128, 0.95)');

      const darkRed = getHeatColor(1, false);
      const lightRed = getHeatColor(1, true);

      expect(darkRed).toBe('rgba(239, 68, 0, 0.85)');
      expect(lightRed).toBe('rgba(248, 113, 113, 0.95)');
    });
  });

  describe('collectNodes', () => {
    it('flattens nested files, classes, and methods', () => {
      const tree: TreeNode = {
        name: 'root',
        path: '/',
        type: 'folder',
        value: 100,
        loc: 100,
        commitCount: 0,
        churnScore: 0,
        fixCount: 0,
        featCount: 0,
        refactorCount: 0,
        linesAdded: 0,
        linesDeleted: 0,
        children: [
          {
            name: 'main.ts',
            path: 'main.ts',
            type: 'file',
            value: 60,
            loc: 60,
            commitCount: 0,
            churnScore: 0,
            fixCount: 0,
            featCount: 0,
            refactorCount: 0,
            linesAdded: 0,
            linesDeleted: 0,
            children: [
              {
                name: 'start()',
                path: 'main.ts#start',
                type: 'method',
                value: 20,
                loc: 20,
                commitCount: 0,
                churnScore: 0,
                fixCount: 0,
                featCount: 0,
                refactorCount: 0,
                linesAdded: 0,
                linesDeleted: 0,
              },
            ],
          },
          {
            name: 'util.ts',
            path: 'util.ts',
            type: 'file',
            value: 40,
            loc: 40,
            commitCount: 0,
            churnScore: 0,
            fixCount: 0,
            featCount: 0,
            refactorCount: 0,
            linesAdded: 0,
            linesDeleted: 0,
          },
        ],
      };

      const files = collectNodes(tree, 'file');
      expect(files.length).toBe(2);
      expect(files.map((f) => f.name)).toEqual(['main.ts', 'util.ts']);

      const methods = collectNodes(tree, 'method');
      expect(methods.length).toBe(1);
      expect(methods[0].name).toBe('start()');
    });
  });
});
