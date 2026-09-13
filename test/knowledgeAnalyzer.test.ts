import { describe, it, expect } from 'vitest';
import { KnowledgeAnalyzer } from '../src/analyzer/knowledgeAnalyzer';
import type { ContributorStat, FileCommitStat, ParsedFileInfo } from '../src/analyzer/types';

describe('KnowledgeAnalyzer', () => {
  const analyzer = new KnowledgeAnalyzer();

  describe('assessNodeKnowledge', () => {
    it('identifies High Risk when single author owns >= 75% of commits with high churn or LOC', () => {
      const contributors: ContributorStat[] = [
        { name: 'Alice Developer', commits: 9, linesAdded: 300, linesDeleted: 50, percentage: 90 },
        { name: 'Bob Junior', commits: 1, linesAdded: 10, linesDeleted: 2, percentage: 10 },
      ];

      const assessment = analyzer.assessNodeKnowledge(contributors, 10, 200, 0.5);

      expect(assessment.primaryAuthor).toBe('Alice Developer');
      expect(assessment.primaryAuthorPercentage).toBe(90);
      expect(assessment.knowledgeRisk).toBe('high');
    });

    it('identifies Medium Risk when single author owns 50-74% of commits', () => {
      const contributors: ContributorStat[] = [
        { name: 'Alice Developer', commits: 6, linesAdded: 120, linesDeleted: 20, percentage: 60 },
        { name: 'Bob Junior', commits: 4, linesAdded: 80, linesDeleted: 15, percentage: 40 },
      ];

      const assessment = analyzer.assessNodeKnowledge(contributors, 10, 100, 0.2);

      expect(assessment.primaryAuthor).toBe('Alice Developer');
      expect(assessment.primaryAuthorPercentage).toBe(60);
      expect(assessment.knowledgeRisk).toBe('medium');
    });

    it('identifies Low Risk when knowledge is evenly shared across 3+ active authors', () => {
      const contributors: ContributorStat[] = [
        { name: 'Alice Developer', commits: 4, linesAdded: 50, linesDeleted: 10, percentage: 40 },
        { name: 'Bob Junior', commits: 3, linesAdded: 40, linesDeleted: 10, percentage: 30 },
        { name: 'Charlie Lead', commits: 3, linesAdded: 35, linesDeleted: 5, percentage: 30 },
      ];

      const assessment = analyzer.assessNodeKnowledge(contributors, 10, 80, 0.2);

      expect(assessment.primaryAuthor).toBe('Alice Developer');
      expect(assessment.primaryAuthorPercentage).toBe(40);
      expect(assessment.knowledgeRisk).toBe('low');
    });

    it('returns low risk when there are no contributors or 0 commits', () => {
      const assessment = analyzer.assessNodeKnowledge([], 0, 50, 0);
      expect(assessment.primaryAuthor).toBeUndefined();
      expect(assessment.knowledgeRisk).toBe('low');
    });
  });

  describe('computeProjectSummary', () => {
    it('calculates Truck Factor = 1 when single author dominates > 50% of the codebase', () => {
      const files: ParsedFileInfo[] = [
        { filePath: 'src/a.ts', loc: 100, fileHash: 'h1', classes: [], methods: [] },
        { filePath: 'src/b.ts', loc: 100, fileHash: 'h2', classes: [], methods: [] },
        { filePath: 'src/c.ts', loc: 100, fileHash: 'h3', classes: [], methods: [] },
        { filePath: 'src/d.ts', loc: 100, fileHash: 'h4', classes: [], methods: [] },
      ];

      const commitStats = new Map<string, FileCommitStat>();
      // Alice owns 3 out of 4 files (75% of files)
      commitStats.set('src/a.ts', {
        commitCount: 5,
        fixCount: 1,
        featCount: 2,
        refactorCount: 0,
        linesAdded: 100,
        linesDeleted: 10,
        lastModifiedAt: 1700000000,
        contributors: [{ name: 'Alice', commits: 5, linesAdded: 100, linesDeleted: 10, percentage: 100 }],
      });
      commitStats.set('src/b.ts', {
        commitCount: 4,
        fixCount: 0,
        featCount: 2,
        refactorCount: 0,
        linesAdded: 80,
        linesDeleted: 5,
        lastModifiedAt: 1700000000,
        contributors: [{ name: 'Alice', commits: 4, linesAdded: 80, linesDeleted: 5, percentage: 100 }],
      });
      commitStats.set('src/c.ts', {
        commitCount: 6,
        fixCount: 1,
        featCount: 3,
        refactorCount: 0,
        linesAdded: 110,
        linesDeleted: 8,
        lastModifiedAt: 1700000000,
        contributors: [{ name: 'Alice', commits: 6, linesAdded: 110, linesDeleted: 8, percentage: 100 }],
      });
      commitStats.set('src/d.ts', {
        commitCount: 3,
        fixCount: 0,
        featCount: 1,
        refactorCount: 0,
        linesAdded: 50,
        linesDeleted: 2,
        lastModifiedAt: 1700000000,
        contributors: [{ name: 'Bob', commits: 3, linesAdded: 50, linesDeleted: 2, percentage: 100 }],
      });

      const summary = analyzer.computeProjectSummary(files, commitStats, 6);

      expect(summary.totalAuthors).toBe(2);
      expect(summary.truckFactor).toBe(1); // Alice alone owns > 50%
      expect(summary.monopolyFileCount).toBe(4); // All 4 files are 100% owned by a single author
      expect(summary.monopolyPercentage).toBe(100);

      const topAuthor = summary.topAuthors[0];
      expect(topAuthor.name).toBe('Alice');
      expect(topAuthor.fileCount).toBe(3);
      expect(topAuthor.percentageOfCodebase).toBe(75);

      expect(summary.highestRiskFiles.length).toBe(4);
    });

    it('calculates Truck Factor > 1 when knowledge is distributed among multiple authors', () => {
      const files: ParsedFileInfo[] = [
        { filePath: 'src/auth.ts', loc: 200, fileHash: 'h1', classes: [], methods: [] },
        { filePath: 'src/billing.ts', loc: 200, fileHash: 'h2', classes: [], methods: [] },
        { filePath: 'src/users.ts', loc: 200, fileHash: 'h3', classes: [], methods: [] },
        { filePath: 'src/dashboard.ts', loc: 200, fileHash: 'h4', classes: [], methods: [] },
      ];

      const commitStats = new Map<string, FileCommitStat>();
      commitStats.set('src/auth.ts', {
        commitCount: 4,
        fixCount: 0,
        featCount: 2,
        refactorCount: 0,
        linesAdded: 50,
        linesDeleted: 5,
        lastModifiedAt: 1700000000,
        contributors: [{ name: 'Alice', commits: 4, linesAdded: 50, linesDeleted: 5, percentage: 100 }],
      });
      commitStats.set('src/billing.ts', {
        commitCount: 4,
        fixCount: 0,
        featCount: 2,
        refactorCount: 0,
        linesAdded: 50,
        linesDeleted: 5,
        lastModifiedAt: 1700000000,
        contributors: [{ name: 'Bob', commits: 4, linesAdded: 50, linesDeleted: 5, percentage: 100 }],
      });
      commitStats.set('src/users.ts', {
        commitCount: 4,
        fixCount: 0,
        featCount: 2,
        refactorCount: 0,
        linesAdded: 50,
        linesDeleted: 5,
        lastModifiedAt: 1700000000,
        contributors: [{ name: 'Charlie', commits: 4, linesAdded: 50, linesDeleted: 5, percentage: 100 }],
      });
      commitStats.set('src/dashboard.ts', {
        commitCount: 4,
        fixCount: 0,
        featCount: 2,
        refactorCount: 0,
        linesAdded: 50,
        linesDeleted: 5,
        lastModifiedAt: 1700000000,
        contributors: [{ name: 'Dave', commits: 4, linesAdded: 50, linesDeleted: 5, percentage: 100 }],
      });

      const summary = analyzer.computeProjectSummary(files, commitStats, 4);

      expect(summary.totalAuthors).toBe(4);
      // Each owns 1 file (25%). To reach >= 50%, at least 2 authors are needed
      expect(summary.truckFactor).toBe(2);
    });

    it('handles empty repositories gracefully', () => {
      const summary = analyzer.computeProjectSummary([], new Map(), 0);
      expect(summary.totalAuthors).toBe(0);
      expect(summary.truckFactor).toBe(0);
      expect(summary.monopolyFileCount).toBe(0);
      expect(summary.monopolyPercentage).toBe(0);
      expect(summary.topAuthors).toEqual([]);
      expect(summary.highestRiskFiles).toEqual([]);
    });
  });
});
