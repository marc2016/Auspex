import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalysisSnapshot, TreeNode } from '../src/analyzer/types';
import {
  getTimeframeBounds,
  filterSnapshotByScope,
} from '../src/analyzer/scopeFilter';

vi.mock('simple-git', () => {
  return {
    simpleGit: vi.fn(),
  };
});

import { simpleGit } from 'simple-git';

describe('scopeFilter', () => {
  const now = 1750000000000; // Fixed timestamp for reproducible math

  describe('getTimeframeBounds', () => {
    it('computes correct bounds for presets', () => {
      const b7d = getTimeframeBounds('7d', undefined, undefined, now);
      expect(b7d.endTime).toBe(now);
      expect(b7d.startTime).toBe(now - 7 * 86400000);

      const b30d = getTimeframeBounds('30d', undefined, undefined, now);
      expect(b30d.startTime).toBe(now - 30 * 86400000);

      const b1y = getTimeframeBounds('1y', undefined, undefined, now);
      expect(b1y.startTime).toBe(now - 365 * 86400000);
    });

    it('computes correct bounds for custom start and end date strings', () => {
      const b = getTimeframeBounds('custom', '2026-05-01', '2026-05-15', now);
      const expectedStart = Date.parse('2026-05-01T00:00:00');
      const expectedEnd = Date.parse('2026-05-15T23:59:59.999');

      expect(b.startTime).toBe(expectedStart);
      expect(b.endTime).toBe(expectedEnd);
    });
  });

  describe('filterSnapshotByScope', () => {
    let sampleSnapshot: AnalysisSnapshot;

    beforeEach(() => {
      vi.clearAllMocks();

      const fileA: TreeNode = {
        name: 'fileA.ts',
        path: '/src/fileA.ts',
        type: 'file',
        value: 100,
        loc: 100,
        commitCount: 2,
        churnScore: 1.0,
        fixCount: 1,
        codeHealth: 9.0,
        commits: [
          {
            hash: 'h1',
            author: 'Alice',
            timestamp: now - 5 * 86400000, // 5 days ago (inside 7d)
            message: 'fix: something in file A',
            linesAdded: 20,
            linesDeleted: 5,
            isFix: true,
          },
          {
            hash: 'h2',
            author: 'Alice',
            timestamp: now - 20 * 86400000, // 20 days ago (outside 7d, inside 30d)
            message: 'feat: add file A',
            linesAdded: 80,
            linesDeleted: 0,
            isFix: false,
          },
        ],
      };

      const fileB: TreeNode = {
        name: 'fileB.ts',
        path: '/src/fileB.ts',
        type: 'file',
        value: 200,
        loc: 200,
        commitCount: 1,
        churnScore: 0.5,
        fixCount: 0,
        codeHealth: 7.5,
        commits: [
          {
            hash: 'h3',
            author: 'Bob',
            timestamp: now - 40 * 86400000, // 40 days ago (outside 30d)
            message: 'feat: add file B',
            linesAdded: 200,
            linesDeleted: 0,
            isFix: false,
          },
        ],
      };

      const root: TreeNode = {
        name: 'root',
        path: '/',
        type: 'folder',
        value: 300,
        loc: 300,
        commitCount: 3,
        churnScore: 0.75,
        fixCount: 1,
        codeHealth: 8.0,
        children: [
          {
            name: 'src',
            path: '/src',
            type: 'folder',
            value: 300,
            loc: 300,
            commitCount: 3,
            churnScore: 0.75,
            fixCount: 1,
            codeHealth: 8.0,
            children: [fileA, fileB],
          },
        ],
      };

      sampleSnapshot = {
        id: 'snap-1',
        scannedAt: '2026-09-14',
        durationMs: 50,
        headCommitSha: 'sha-root',
        workspacePath: '/mock/workspace',
        totalFiles: 2,
        totalLoc: 300,
        tree: root,
        hotspots: [
          {
            filePath: 'src/fileA.ts',
            name: 'fileA.ts',
            loc: 100,
            commitCount: 2,
            fixCount: 1,
            churnScore: 1.0,
            defectRatio: 0.5,
            codeHealth: 9.0,
          },
        ],
      };
    });

    it('returns base snapshot unchanged when mode is all', async () => {
      const result = await filterSnapshotByScope(
        sampleSnapshot,
        { mode: 'all' },
        '/mock/workspace'
      );
      expect(result.scope?.mode).toBe('all');
      expect(result.totalFiles).toBe(2);
      expect(result.totalLoc).toBe(300);
    });

    it('filters tree and commits for timeframe mode (e.g. 7d)', async () => {
      // Mock now in getTimeframeBounds by testing with timeframePreset '7d'
      const result = await filterSnapshotByScope(
        sampleSnapshot,
        {
          mode: 'timeframe',
          timeframePreset: 'custom',
          startDate: new Date(now - 10 * 86400000).toISOString().slice(0, 10),
          endDate: new Date(now).toISOString().slice(0, 10),
        },
        '/mock/workspace'
      );

      expect(result.scope?.mode).toBe('timeframe');
      // fileA has commit h1 inside the range (5 days ago), h2 is 20 days ago
      // fileB has h3 (40 days ago, outside)
      const srcFolder = result.tree.children?.[0];
      const resFileA = srcFolder?.children?.find((c) => c.name === 'fileA.ts');
      const resFileB = srcFolder?.children?.find((c) => c.name === 'fileB.ts');

      expect(resFileA?.commitCount).toBe(1);
      expect(resFileA?.commits?.length).toBe(1);
      expect(resFileA?.commits?.[0].hash).toBe('h1');
      expect(resFileB?.commitCount).toBe(0);
      expect(resFileB?.commits?.length).toBe(0);
      expect(result.tree.commitCount).toBe(1);
      expect(result.knowledgeSummary).toBeDefined();
      expect(result.projectCouplings).toBeDefined();
    });

    it('handles empty worktree correctly when git status reports no changes', async () => {
      (simpleGit as any).mockReturnValue({
        checkIsRepo: vi.fn().mockResolvedValue(true),
        status: vi.fn().mockResolvedValue({ files: [] }),
        diff: vi.fn().mockResolvedValue(''),
      });

      const result = await filterSnapshotByScope(
        sampleSnapshot,
        { mode: 'worktree' },
        '/mock/workspace'
      );

      expect(result.scope?.mode).toBe('worktree');
      expect(result.totalFiles).toBe(0);
      expect(result.totalLoc).toBe(0);
      expect(result.hotspots.length).toBe(0);
      expect(result.tree.children?.length).toBe(0);
    });

    it('prunes tree to only modified worktree files and aggregates worktree diff churn', async () => {
      (simpleGit as any).mockReturnValue({
        checkIsRepo: vi.fn().mockResolvedValue(true),
        status: vi.fn().mockResolvedValue({
          files: [
            { path: 'src/fileA.ts', index: 'M', working_dir: 'M' },
          ],
        }),
        diff: vi.fn().mockResolvedValue('15\t3\tsrc/fileA.ts\n'),
      });

      const result = await filterSnapshotByScope(
        sampleSnapshot,
        { mode: 'worktree' },
        '/mock/workspace'
      );

      expect(result.scope?.mode).toBe('worktree');
      expect(result.totalFiles).toBe(1);
      expect(result.totalLoc).toBe(100);

      const srcFolder = result.tree.children?.[0];
      expect(srcFolder?.children?.length).toBe(1);
      expect(srcFolder?.children?.[0].name).toBe('fileA.ts');
      expect(srcFolder?.children?.[0].linesAdded).toBe(15);
      expect(srcFolder?.children?.[0].linesDeleted).toBe(3);
      expect(result.hotspots.length).toBe(1);
      expect(result.hotspots[0].name).toBe('fileA.ts');
    });
  });
});
