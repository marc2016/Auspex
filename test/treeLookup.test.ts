import { describe, it, expect } from 'vitest';
import { findFileNode } from '../src/utils/treeLookup';
import type { TreeNode } from '../src/analyzer/types';

describe('treeLookup - findFileNode', () => {
  const sampleTree: TreeNode = {
    name: 'root',
    path: '/',
    type: 'folder',
    value: 100,
    loc: 100,
    commitCount: 10,
    churnScore: 0.5,
    fixCount: 2,
    featCount: 3,
    refactorCount: 1,
    linesAdded: 50,
    linesDeleted: 10,
    children: [
      {
        name: 'package.json',
        path: 'package.json',
        type: 'file',
        value: 20,
        loc: 20,
        commitCount: 2,
        churnScore: 0.1,
        fixCount: 0,
        featCount: 1,
        refactorCount: 0,
        linesAdded: 15,
        linesDeleted: 2,
      },
      {
        name: 'src',
        path: '/src',
        type: 'folder',
        value: 80,
        loc: 80,
        commitCount: 8,
        churnScore: 0.4,
        fixCount: 2,
        featCount: 2,
        refactorCount: 1,
        linesAdded: 35,
        linesDeleted: 8,
        children: [
          {
            name: 'services',
            path: '/src/services',
            type: 'folder',
            value: 80,
            loc: 80,
            commitCount: 8,
            churnScore: 0.4,
            fixCount: 2,
            featCount: 2,
            refactorCount: 1,
            linesAdded: 35,
            linesDeleted: 8,
            children: [
              {
                name: 'UserService.ts',
                path: 'src/services/UserService.ts',
                type: 'file',
                value: 80,
                loc: 80,
                commitCount: 8,
                churnScore: 0.4,
                fixCount: 2,
                featCount: 2,
                refactorCount: 1,
                linesAdded: 35,
                linesDeleted: 8,
                children: [
                  {
                    name: 'UserService',
                    path: 'src/services/UserService.ts#UserService',
                    type: 'class',
                    value: 80,
                    loc: 80,
                    commitCount: 8,
                    churnScore: 0.4,
                    fixCount: 2,
                    featCount: 2,
                    refactorCount: 1,
                    linesAdded: 35,
                    linesDeleted: 8,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it('finds top-level file', () => {
    const node = findFileNode(sampleTree, 'package.json');
    expect(node).not.toBeNull();
    expect(node?.name).toBe('package.json');
  });

  it('finds nested file with exact relative path', () => {
    const node = findFileNode(sampleTree, 'src/services/UserService.ts');
    expect(node).not.toBeNull();
    expect(node?.name).toBe('UserService.ts');
  });

  it('normalizes leading slashes and Windows backslashes', () => {
    const node1 = findFileNode(sampleTree, '/src/services/UserService.ts');
    expect(node1?.name).toBe('UserService.ts');

    const node2 = findFileNode(sampleTree, 'src\\services\\UserService.ts');
    expect(node2?.name).toBe('UserService.ts');
  });

  it('returns null for nonexistent files', () => {
    const node = findFileNode(sampleTree, 'src/services/NonExistent.ts');
    expect(node).toBeNull();
  });

  it('returns null for empty or null inputs', () => {
    expect(findFileNode(null as any, 'file.ts')).toBeNull();
    expect(findFileNode(sampleTree, '')).toBeNull();
  });
});

import { findNodeAt, findDiagramNode } from '../src/utils/treeLookup';

describe('treeLookup - diagram box selection', () => {
  const node = (type: TreeNode['type'], path: string, children: TreeNode[] = [], startLine?: number): TreeNode => ({
    name: path.split('/').pop()!, path, type, value: 1, loc: 1, commitCount: 0, churnScore: 0, fixCount: 0, featCount: 0,
    refactorCount: 0, linesAdded: 0, linesDeleted: 0, startLine, children,
  });
  const add = node('method', 'src/cart/cart.js#Cart.add', [], 2);
  const cls = node('class', 'src/cart/cart.js#Cart', [node('method', 'src/cart/cart.js#Cart', [], 1), add], 1);
  const file = node('file', 'src/cart/cart.js', [cls]);
  const root = node('folder', 'src', [node('folder', 'src/cart', [file])]);

  it('selects the file node for a file box', () => {
    expect(findDiagramNode(root, 'src/cart/cart.js')).toBe(file);
  });

  it('selects the class node for a class box with its start line', () => {
    expect(findDiagramNode(root, 'src/cart/cart.js', 1)).toBe(cls);
  });

  it('keeps method lookup by start line for function boxes', () => {
    expect(findNodeAt(file, 2, 'method')).toBe(add);
    expect(findNodeAt(file, 1, 'method')?.path).toBe('src/cart/cart.js#Cart');
    expect(findDiagramNode(root, 'src/missing.js')).toBeNull();
  });
});
