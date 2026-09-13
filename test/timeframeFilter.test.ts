import { describe, it, expect } from 'vitest';
import type { TreeNode } from '../src/analyzer/types';
import {
  getTimeframeCutoff,
  filterTreeByTimeframe,
  type TimeframeOption,
} from '../webview/src/utils/timeframeFilter';

describe('timeframeFilter', () => {
  const fixedNow = 1726000000000; // Reference timestamp

  describe('getTimeframeCutoff', () => {
    it('returns 0 for "all"', () => {
      expect(getTimeframeCutoff('all', fixedNow)).toBe(0);
    });

    it('calculates correct cutoffs for each timeframe option', () => {
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      const oneMonth = 30 * 24 * 60 * 60 * 1000;
      const sixMonths = 182 * 24 * 60 * 60 * 1000;
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      const twoYears = 730 * 24 * 60 * 60 * 1000;

      expect(getTimeframeCutoff('1w', fixedNow)).toBe(fixedNow - oneWeek);
      expect(getTimeframeCutoff('1m', fixedNow)).toBe(fixedNow - oneMonth);
      expect(getTimeframeCutoff('6m', fixedNow)).toBe(fixedNow - sixMonths);
      expect(getTimeframeCutoff('1y', fixedNow)).toBe(fixedNow - oneYear);
      expect(getTimeframeCutoff('2y', fixedNow)).toBe(fixedNow - twoYears);
    });
  });

  describe('filterTreeByTimeframe', () => {
    it('returns root as-is when timeframe is "all"', () => {
      const tree: TreeNode = {
        name: 'root',
        path: '/',
        type: 'folder',
        value: 100,
        loc: 100,
        commitCount: 10,
        churnScore: 1,
        fixCount: 2,
        featCount: 5,
        refactorCount: 3,
        linesAdded: 50,
        linesDeleted: 20,
      };

      const result = filterTreeByTimeframe(tree, 'all', fixedNow);
      expect(result).toBe(tree);
    });

    it('filters commits and recalculates metrics and normalized churn within the timeframe', () => {
      const now = fixedNow;
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
      const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
      const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;

      const tree: TreeNode = {
        name: 'root',
        path: '/',
        type: 'folder',
        value: 200,
        loc: 200,
        commitCount: 5,
        churnScore: 1,
        fixCount: 2,
        featCount: 2,
        refactorCount: 1,
        linesAdded: 150,
        linesDeleted: 50,
        children: [
          {
            name: 'recentActive.ts',
            path: 'recentActive.ts',
            type: 'file',
            value: 100,
            loc: 100,
            commitCount: 3,
            churnScore: 1,
            fixCount: 1,
            featCount: 1,
            refactorCount: 1,
            linesAdded: 100,
            linesDeleted: 30,
            commits: [
              {
                hash: 'c1',
                author: 'Alice',
                timestamp: twoDaysAgo, // within 1w
                message: 'fix: resolve edge case',
                linesAdded: 20,
                linesDeleted: 5,
                isFix: true,
              },
              {
                hash: 'c2',
                author: 'Bob',
                timestamp: twoWeeksAgo, // older than 1w, within 1m
                message: 'feat: add export',
                linesAdded: 50,
                linesDeleted: 15,
                isFix: false,
              },
              {
                hash: 'c3',
                author: 'Alice',
                timestamp: twoMonthsAgo, // older than 1m, within 6m
                message: 'initial file',
                linesAdded: 30,
                linesDeleted: 10,
                isFix: false,
              },
            ],
          },
          {
            name: 'olderFile.ts',
            path: 'olderFile.ts',
            type: 'file',
            value: 100,
            loc: 100,
            commitCount: 2,
            churnScore: 0.67,
            fixCount: 1,
            featCount: 1,
            refactorCount: 0,
            linesAdded: 50,
            linesDeleted: 20,
            commits: [
              {
                hash: 'c4',
                author: 'Charlie',
                timestamp: twoWeeksAgo, // within 1m
                message: 'fix: typo',
                linesAdded: 10,
                linesDeleted: 5,
                isFix: true,
              },
              {
                hash: 'c5',
                author: 'Charlie',
                timestamp: twoMonthsAgo, // within 6m
                message: 'initial commit',
                linesAdded: 40,
                linesDeleted: 15,
                isFix: false,
              },
            ],
          },
        ],
      };

      // 1. Filter for 1 week ('1w'):
      // recentActive.ts has 1 commit (c1), olderFile.ts has 0 commits.
      const filtered1w = filterTreeByTimeframe(tree, '1w', now);
      const recent1w = filtered1w.children?.find((c) => c.name === 'recentActive.ts')!;
      const older1w = filtered1w.children?.find((c) => c.name === 'olderFile.ts')!;

      expect(recent1w.commitCount).toBe(1);
      expect(recent1w.fixCount).toBe(1);
      expect(recent1w.linesAdded).toBe(20);
      expect(recent1w.linesDeleted).toBe(5);
      expect(recent1w.defectRatio).toBe(1);
      expect(recent1w.churnScore).toBe(1); // Normalized to 1 since it's the max in this timeframe

      expect(older1w.commitCount).toBe(0);
      expect(older1w.fixCount).toBe(0);
      expect(older1w.linesAdded).toBe(0);
      expect(older1w.linesDeleted).toBe(0);
      expect(older1w.defectRatio).toBe(0);
      expect(older1w.churnScore).toBe(0);

      // Folder aggregation
      expect(filtered1w.commitCount).toBe(1);
      expect(filtered1w.fixCount).toBe(1);
      expect(filtered1w.linesAdded).toBe(20);

      // 2. Filter for 1 month ('1m'):
      // recentActive.ts has 2 commits (c1, c2)
      // olderFile.ts has 1 commit (c4)
      const filtered1m = filterTreeByTimeframe(tree, '1m', now);
      const recent1m = filtered1m.children?.find((c) => c.name === 'recentActive.ts')!;
      const older1m = filtered1m.children?.find((c) => c.name === 'olderFile.ts')!;

      expect(recent1m.commitCount).toBe(2);
      expect(recent1m.fixCount).toBe(1);
      expect(recent1m.linesAdded).toBe(70);
      expect(recent1m.defectRatio).toBe(0.5);
      expect(recent1m.churnScore).toBe(1); // 2 commits = max

      expect(older1m.commitCount).toBe(1);
      expect(older1m.fixCount).toBe(1);
      expect(older1m.linesAdded).toBe(10);
      expect(older1m.defectRatio).toBe(1);
      expect(older1m.churnScore).toBe(0.5); // 1 / 2 = 0.5

      expect(filtered1m.commitCount).toBe(3);
      expect(filtered1m.fixCount).toBe(2);
    });

    it('handles files with no commits gracefully without NaN or errors', () => {
      const tree: TreeNode = {
        name: 'uncommitted.ts',
        path: 'uncommitted.ts',
        type: 'file',
        value: 50,
        loc: 50,
        commitCount: 0,
        churnScore: 0,
        fixCount: 0,
        featCount: 0,
        refactorCount: 0,
        linesAdded: 0,
        linesDeleted: 0,
        commits: [],
      };

      const res = filterTreeByTimeframe(tree, '1m', fixedNow);
      expect(res.commitCount).toBe(0);
      expect(res.fixCount).toBe(0);
      expect(res.defectRatio).toBe(0);
      expect(res.churnScore).toBe(0);
      expect(isNaN(res.defectRatio || 0)).toBe(false);
      expect(isNaN(res.churnScore)).toBe(false);
    });

    it('recalculates and preserves primaryAuthor and knowledgeRisk in filtered timeframe', () => {
      const tree: TreeNode = {
        name: 'module.ts',
        path: 'module.ts',
        type: 'file',
        value: 200,
        loc: 200,
        commitCount: 3,
        primaryAuthor: 'Original Dev',
        primaryAuthorPercentage: 100,
        knowledgeRisk: 'high',
        commits: [
          {
            hash: 'c1',
            author: 'New Dev',
            timestamp: fixedNow - 1000,
            message: 'feature update',
            linesAdded: 50,
            linesDeleted: 10,
          },
          {
            hash: 'c2',
            author: 'New Dev',
            timestamp: fixedNow - 2000,
            message: 'bug fix',
            linesAdded: 20,
            linesDeleted: 5,
          },
        ],
      };

      const filtered = filterTreeByTimeframe(tree, '1w', fixedNow);
      expect(filtered.primaryAuthor).toBe('New Dev');
      expect(filtered.primaryAuthorPercentage).toBe(100);
      expect(filtered.knowledgeRisk).toBe('high');
    });
  });
});
