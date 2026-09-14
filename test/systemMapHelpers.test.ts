import { describe, it, expect } from 'vitest';
import type { TreeNode } from '../src/analyzer/types';
import {
  compactTree,
  shouldShowFolderLabel,
  truncateLabel,
} from '../webview/src/utils/systemMapUtils';

describe('System Map Utilities', () => {
  describe('compactTree', () => {
    it('compacts single-child folder chains into a chained folder node', () => {
      const tree: TreeNode = {
        name: 'root',
        path: '/',
        type: 'folder',
        value: 100,
        loc: 100,
        commitCount: 5,
        churnScore: 0.5,
        children: [
          {
            name: 'webview',
            path: '/webview',
            type: 'folder',
            value: 100,
            loc: 100,
            commitCount: 5,
            churnScore: 0.5,
            children: [
              {
                name: 'src',
                path: '/webview/src',
                type: 'folder',
                value: 100,
                loc: 100,
                commitCount: 5,
                churnScore: 0.5,
                children: [
                  {
                    name: 'components',
                    path: '/webview/src/components',
                    type: 'folder',
                    value: 100,
                    loc: 100,
                    commitCount: 5,
                    churnScore: 0.5,
                    children: [
                      {
                        name: 'Button.tsx',
                        path: '/webview/src/components/Button.tsx',
                        type: 'file',
                        value: 50,
                        loc: 50,
                        commitCount: 2,
                        churnScore: 0.2,
                      },
                      {
                        name: 'Panel.tsx',
                        path: '/webview/src/components/Panel.tsx',
                        type: 'file',
                        value: 50,
                        loc: 50,
                        commitCount: 3,
                        churnScore: 0.3,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const compacted = compactTree(tree);

      // Root remains root
      expect(compacted.name).toBe('root');
      expect(compacted.children?.length).toBe(1);

      // webview -> src -> components should be compacted into single node
      const chainedFolder = compacted.children![0];
      expect(chainedFolder.name).toBe('webview/src/components');
      expect(chainedFolder.path).toBe('/webview/src/components');
      expect(chainedFolder.compactedPaths).toEqual([
        '/webview',
        '/webview/src',
        '/webview/src/components',
      ]);
      // Children of the chained folder should be the 2 files
      expect(chainedFolder.children?.length).toBe(2);
      expect(chainedFolder.children![0].name).toBe('Button.tsx');
      expect(chainedFolder.children![1].name).toBe('Panel.tsx');
    });

    it('does not compact folders that have multiple children or contain files alongside a subfolder', () => {
      const tree: TreeNode = {
        name: 'root',
        path: '/',
        type: 'folder',
        value: 150,
        loc: 150,
        commitCount: 5,
        churnScore: 0.5,
        children: [
          {
            name: 'src',
            path: '/src',
            type: 'folder',
            value: 150,
            loc: 150,
            commitCount: 5,
            churnScore: 0.5,
            children: [
              {
                name: 'index.ts',
                path: '/src/index.ts',
                type: 'file',
                value: 50,
                loc: 50,
                commitCount: 1,
                churnScore: 0.1,
              },
              {
                name: 'utils',
                path: '/src/utils',
                type: 'folder',
                value: 100,
                loc: 100,
                commitCount: 4,
                churnScore: 0.4,
                children: [
                  {
                    name: 'math.ts',
                    path: '/src/utils/math.ts',
                    type: 'file',
                    value: 100,
                    loc: 100,
                    commitCount: 4,
                    churnScore: 0.4,
                  },
                ],
              },
            ],
          },
        ],
      };

      const compacted = compactTree(tree);
      const srcFolder = compacted.children![0];
      // src has 2 children (index.ts and utils), so src is NOT collapsed into utils
      expect(srcFolder.name).toBe('src');
      expect(srcFolder.children?.length).toBe(2);
    });
  });

  describe('shouldShowFolderLabel', () => {
    it('hides labels when screen radius is too small (< 35px)', () => {
      expect(shouldShowFolderLabel(1, 20, 1.0, 800)).toBe(false);
      expect(shouldShowFolderLabel(1, 34, 1.0, 800)).toBe(false);
      expect(shouldShowFolderLabel(1, 35, 1.0, 800)).toBe(true);
    });

    it('only shows depth 1 at low zoom (k <= 1.25)', () => {
      expect(shouldShowFolderLabel(1, 60, 1.0, 800)).toBe(true);
      expect(shouldShowFolderLabel(2, 60, 1.0, 800)).toBe(false);
      expect(shouldShowFolderLabel(3, 60, 1.0, 800)).toBe(false);
    });

    it('shows depth 1 and 2 at medium zoom (1.25 < k <= 2.8)', () => {
      expect(shouldShowFolderLabel(1, 60, 2.0, 800)).toBe(true);
      expect(shouldShowFolderLabel(2, 60, 2.0, 800)).toBe(true);
      expect(shouldShowFolderLabel(3, 60, 2.0, 800)).toBe(false);
    });

    it('shows deeper depths at high zoom (k > 2.8) when radius permits', () => {
      expect(shouldShowFolderLabel(3, 60, 3.5, 800)).toBe(true);
      expect(shouldShowFolderLabel(4, 60, 3.5, 800)).toBe(true);
    });

    it('hides label if container is overwhelmed by a huge circle (> containerDim * 1.1)', () => {
      expect(shouldShowFolderLabel(1, 950, 4.0, 800)).toBe(false);
    });
  });

  describe('truncateLabel', () => {
    it('returns empty string if space is too narrow', () => {
      expect(truncateLabel('components', 15)).toBe('');
    });

    it('returns full text if it fits', () => {
      expect(truncateLabel('src', 80)).toBe('src');
    });

    it('truncates with ellipsis when text exceeds space', () => {
      const truncated = truncateLabel('veryLongDirectoryNameHere', 60);
      expect(truncated.endsWith('..')).toBe(true);
      expect(truncated.length).toBeLessThan('veryLongDirectoryNameHere'.length);
    });
  });
});
