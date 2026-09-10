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
