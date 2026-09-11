import { describe, it, expect } from 'vitest';
import { TemporalCouplingAnalyzer } from '../src/analyzer/temporalCoupling';
import { GitChurnAnalyzer } from '../src/analyzer/gitChurn';
import type { FileCommitStat } from '../src/analyzer/types';

describe('TemporalCouplingAnalyzer', () => {
  it('calculates directional and symmetric coupling degrees correctly', () => {
    const analyzer = new TemporalCouplingAnalyzer({
      minCoChanges: 2,
      minCouplingDegree: 0.2,
    });

    // Commit 1: A and B
    analyzer.recordCommitFiles(['src/auth.ts', 'src/session.ts']);
    // Commit 2: A and B
    analyzer.recordCommitFiles(['src/auth.ts', 'src/session.ts']);
    // Commit 3: A and B
    analyzer.recordCommitFiles(['src/auth.ts', 'src/session.ts']);
    // Commit 4: A only
    analyzer.recordCommitFiles(['src/auth.ts']);
    // Commit 5: B and C
    analyzer.recordCommitFiles(['src/session.ts', 'src/user.ts']);
    // Commit 6: B and C
    analyzer.recordCommitFiles(['src/session.ts', 'src/user.ts']);

    const { fileCouplings, projectCouplings } = analyzer.finalize();

    // File perspective for auth.ts:
    // auth has 4 commits total, 3 with session.ts -> couplingDegree = 3/4 = 0.75 (75%)
    const authCouplings = fileCouplings.get('src/auth.ts');
    expect(authCouplings).toBeDefined();
    expect(authCouplings?.length).toBe(1);
    expect(authCouplings?.[0].filePath).toBe('src/session.ts');
    expect(authCouplings?.[0].coChanges).toBe(3);
    expect(authCouplings?.[0].couplingDegree).toBeCloseTo(0.75, 2);

    // File perspective for session.ts:
    // session has 5 commits total: 3 with auth.ts (3/5 = 0.6), 2 with user.ts (2/5 = 0.4)
    const sessionCouplings = fileCouplings.get('src/session.ts');
    expect(sessionCouplings).toBeDefined();
    expect(sessionCouplings?.length).toBe(2);
    expect(sessionCouplings?.[0].filePath).toBe('src/auth.ts');
    expect(sessionCouplings?.[0].couplingDegree).toBeCloseTo(0.6, 2);
    expect(sessionCouplings?.[1].filePath).toBe('src/user.ts');
    expect(sessionCouplings?.[1].couplingDegree).toBeCloseTo(0.4, 2);

    // Project-wide coupling pairs
    expect(projectCouplings.length).toBe(2);
    // auth <-> session: 3 / (4 + 5 - 3) = 3/6 = 0.5 Jaccard
    const authSessionPair = projectCouplings.find(
      (p) =>
        (p.fileA === 'src/auth.ts' && p.fileB === 'src/session.ts') ||
        (p.fileA === 'src/session.ts' && p.fileB === 'src/auth.ts')
    );
    expect(authSessionPair).toBeDefined();
    expect(authSessionPair?.coChanges).toBe(3);
    expect(authSessionPair?.symmetricDegree).toBeCloseTo(0.5, 2);
  });

  it('filters out pairs with fewer co-changes than minCoChanges', () => {
    const analyzer = new TemporalCouplingAnalyzer({
      minCoChanges: 2,
      minCouplingDegree: 0.1,
    });

    // Only 1 co-occurrence
    analyzer.recordCommitFiles(['src/a.ts', 'src/b.ts']);
    analyzer.recordCommitFiles(['src/a.ts']);
    analyzer.recordCommitFiles(['src/b.ts']);

    const { fileCouplings, projectCouplings } = analyzer.finalize();
    expect(fileCouplings.size).toBe(0);
    expect(projectCouplings.length).toBe(0);
  });

  it('filters out pairs below minCouplingDegree', () => {
    const analyzer = new TemporalCouplingAnalyzer({
      minCoChanges: 2,
      minCouplingDegree: 0.5, // 50% minimum
    });

    // 2 co-changes
    analyzer.recordCommitFiles(['src/a.ts', 'src/b.ts']);
    analyzer.recordCommitFiles(['src/a.ts', 'src/b.ts']);
    // But A has 10 other commits -> 2/12 = 16.7% < 50%
    for (let i = 0; i < 10; i++) {
      analyzer.recordCommitFiles(['src/a.ts']);
    }

    const { fileCouplings } = analyzer.finalize();
    const aCoupling = fileCouplings.get('src/a.ts');
    expect(aCoupling).toBeUndefined(); // 16.7% < 50%
  });

  it('ignores mass commits exceeding maxCommitFiles to prevent noise', () => {
    const analyzer = new TemporalCouplingAnalyzer({
      maxCommitFiles: 5,
      minCoChanges: 2,
    });

    // Mass commit touching 6 files (e.g. global reformatting)
    analyzer.recordCommitFiles(['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts']);
    analyzer.recordCommitFiles(['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts']);

    const { projectCouplings } = analyzer.finalize();
    expect(projectCouplings.length).toBe(0);
  });

  it('generates D3 graph nodes and links correctly', () => {
    const analyzer = new TemporalCouplingAnalyzer();
    const projectPairs = [
      {
        fileA: 'src/main.ts',
        fileB: 'src/config.ts',
        coChanges: 5,
        degreeA: 0.8,
        degreeB: 0.6,
        symmetricDegree: 0.5,
      },
    ];

    const graph = analyzer.generateGraphData(projectPairs);
    expect(graph.nodes.length).toBe(2);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['src/config.ts', 'src/main.ts']);
    expect(graph.links.length).toBe(1);
    expect(graph.links[0].source).toBe('src/main.ts');
    expect(graph.links[0].target).toBe('src/config.ts');
    expect(graph.links[0].coChanges).toBe(5);
    expect(graph.links[0].degree).toBe(0.8);
  });

  it('integrates seamlessly with GitChurnAnalyzer.parseLogOutput', () => {
    const churnAnalyzer = new GitChurnAnalyzer();
    const statsMap = new Map<string, FileCommitStat>();

    const rawLog = [
      'COMMIT:sha1|1700000000|feat: user login flow',
      '20\t5\tsrc/auth.ts',
      '15\t2\tsrc/session.ts',
      'COMMIT:sha2|1700010000|fix: renew session token on auth refresh',
      '10\t1\tsrc/auth.ts',
      '8\t0\tsrc/session.ts',
      'COMMIT:sha3|1700020000|docs: update auth notes',
      '5\t0\tsrc/auth.ts',
    ].join('\n');

    churnAnalyzer.parseLogOutput(rawLog, statsMap);

    const authStats = statsMap.get('src/auth.ts');
    expect(authStats).toBeDefined();
    expect(authStats?.commitCount).toBe(3);
    expect(authStats?.temporalCoupling).toBeDefined();
    expect(authStats?.temporalCoupling?.length).toBe(1);
    expect(authStats?.temporalCoupling?.[0].filePath).toBe('src/session.ts');
    expect(authStats?.temporalCoupling?.[0].coChanges).toBe(2);
    expect(authStats?.temporalCoupling?.[0].couplingDegree).toBeCloseTo(2 / 3, 2);

    expect(churnAnalyzer.lastProjectCouplings.length).toBe(1);
  });
});
