import { describe, it, expect } from 'vitest';
import { GitChurnAnalyzer, isBugfixMessage } from '../src/analyzer/gitChurn';
import type { FileCommitStat } from '../src/analyzer/types';

describe('GitChurnAnalyzer', () => {
  const analyzer = new GitChurnAnalyzer();

  it('parses conventional commits (fix, feat, refactor, perf)', () => {
    const statsMap = new Map<string, FileCommitStat>();

    const rawLog = [
      'COMMIT:sha1|1700000000|fix(auth): prevent session timeout bug',
      '20\t5\tsrc/auth/session.ts',
      'COMMIT:sha2|1700010000|feat(dashboard): add metrics summary',
      '50\t2\tsrc/ui/dashboard.tsx',
      'COMMIT:sha3|1700020000|refactor: simplify tree aggregator',
      '10\t15\tsrc/analyzer/treeAggregator.ts',
      'COMMIT:sha4|1700030000|perf: optimize ast file scanning',
      '5\t8\tsrc/analyzer/astAnalyzer.ts',
    ].join('\n');

    analyzer.parseLogOutput(rawLog, statsMap);

    const sessionStats = statsMap.get('src/auth/session.ts');
    expect(sessionStats?.commitCount).toBe(1);
    expect(sessionStats?.fixCount).toBe(1);
    expect(sessionStats?.featCount).toBe(0);
    expect(sessionStats?.linesAdded).toBe(20);
    expect(sessionStats?.linesDeleted).toBe(5);

    const dashStats = statsMap.get('src/ui/dashboard.tsx');
    expect(dashStats?.featCount).toBe(1);

    const treeStats = statsMap.get('src/analyzer/treeAggregator.ts');
    expect(treeStats?.refactorCount).toBe(1);

    const astStats = statsMap.get('src/analyzer/astAnalyzer.ts');
    expect(astStats?.refactorCount).toBe(1); // perf is treated as refactor category
  });

  it('identifies bug fix and feature keywords in non-conventional messages', () => {
    const statsMap = new Map<string, FileCommitStat>();

    const rawLog = [
      'COMMIT:sha1|1700000000|Resolved race condition during file walk',
      '8\t2\tsrc/walker.ts',
      'COMMIT:sha2|1700010000|Hotfix for unhandled exception on null node',
      '3\t1\tsrc/walker.ts',
      'COMMIT:sha3|1700020000|Added new treemap export option',
      '25\t0\tsrc/export.ts',
      'COMMIT:sha4|1700030000|Cleanup temporary files and reorganize imports',
      '2\t10\tsrc/export.ts',
    ].join('\n');

    analyzer.parseLogOutput(rawLog, statsMap);

    const walkerStats = statsMap.get('src/walker.ts');
    expect(walkerStats?.commitCount).toBe(2);
    expect(walkerStats?.fixCount).toBe(2);

    const exportStats = statsMap.get('src/export.ts');
    expect(exportStats?.commitCount).toBe(2);
    expect(exportStats?.featCount).toBe(1);
    expect(exportStats?.refactorCount).toBe(1);
  });

  it('handles git rename notations properly', () => {
    const statsMap = new Map<string, FileCommitStat>();

    const rawLog = [
      'COMMIT:sha1|1700000000|Move file into services subfolder',
      '10\t2\tsrc/{utils => services}/cache.ts',
      'COMMIT:sha2|1700010000|Rename helper file directly',
      '5\t1\toldName.ts => newName.ts',
    ].join('\n');

    analyzer.parseLogOutput(rawLog, statsMap);

    expect(statsMap.has('src/services/cache.ts')).toBe(true);
    expect(statsMap.get('src/services/cache.ts')?.linesAdded).toBe(10);

    expect(statsMap.has('newName.ts')).toBe(true);
    expect(statsMap.get('newName.ts')?.linesAdded).toBe(5);
  });

  it('handles binary files with dash line counts gracefully', () => {
    const statsMap = new Map<string, FileCommitStat>();

    const rawLog = [
      'COMMIT:sha1|1700000000|Add binary asset image',
      '-\t-\tassets/logo.png',
    ].join('\n');

    analyzer.parseLogOutput(rawLog, statsMap);

    const logoStats = statsMap.get('assets/logo.png');
    expect(logoStats).toBeDefined();
    expect(logoStats?.commitCount).toBe(1);
    expect(logoStats?.linesAdded).toBe(0);
    expect(logoStats?.linesDeleted).toBe(0);
  });

  it('returns empty stats map for a non-git directory without throwing', async () => {
    const result = await analyzer.analyze('/tmp/non-git-dir-auspex-test-12345');
    expect(result.size).toBe(0);
  });

  it('extracts contributors with total stats and commit history per file', () => {
    const statsMap = new Map<string, FileCommitStat>();

    const rawLog = [
      'COMMIT:sha1|1700000000|Alice Developer|feat: implement core feature',
      '50\t10\tsrc/core.ts',
      'COMMIT:sha2|1700010000|Bob Engineer|fix: handle edge case in core',
      '5\t2\tsrc/core.ts',
      'COMMIT:sha3|1700020000|Alice Developer|refactor: improve performance',
      '20\t15\tsrc/core.ts',
    ].join('\n');

    analyzer.parseLogOutput(rawLog, statsMap);

    const stats = statsMap.get('src/core.ts');
    expect(stats).toBeDefined();
    expect(stats?.commitCount).toBe(3);
    expect(stats?.linesAdded).toBe(75);
    expect(stats?.linesDeleted).toBe(27);

    // Contributors
    expect(stats?.contributors).toBeDefined();
    expect(stats?.contributors?.length).toBe(2);

    const alice = stats?.contributors?.find((c) => c.name === 'Alice Developer');
    expect(alice).toBeDefined();
    expect(alice?.commits).toBe(2);
    expect(alice?.linesAdded).toBe(70);
    expect(alice?.linesDeleted).toBe(25);
    expect(alice?.percentage).toBe(66.7);

    const bob = stats?.contributors?.find((c) => c.name === 'Bob Engineer');
    expect(bob).toBeDefined();
    expect(bob?.commits).toBe(1);
    expect(bob?.linesAdded).toBe(5);
    expect(bob?.linesDeleted).toBe(2);
    expect(bob?.percentage).toBe(33.3);

    // Commits list
    expect(stats?.commits).toBeDefined();
    expect(stats?.commits?.length).toBe(3);
    // Newest first
    expect(stats?.commits?.[0].hash).toBe('sha3');
    expect(stats?.commits?.[0].author).toBe('Alice Developer');
    expect(stats?.commits?.[0].message).toBe('refactor: improve performance');
    expect(stats?.commits?.[0].linesAdded).toBe(20);
    expect(stats?.commits?.[0].linesDeleted).toBe(15);
    expect(stats?.commits?.[0].isFix).toBe(false);

    expect(stats?.commits?.[1].hash).toBe('sha2');
    expect(stats?.commits?.[1].author).toBe('Bob Engineer');
    expect(stats?.commits?.[1].message).toBe('fix: handle edge case in core');
    expect(stats?.commits?.[1].linesAdded).toBe(5);
    expect(stats?.commits?.[1].linesDeleted).toBe(2);
    expect(stats?.commits?.[1].isFix).toBe(true);

    expect(stats?.commits?.[2].hash).toBe('sha1');
    expect(stats?.commits?.[2].isFix).toBe(false);
  });

  it('correctly classifies bugfix commit messages', () => {
    expect(isBugfixMessage('fix: resolve null pointer')).toBe(true);
    expect(isBugfixMessage('fix(ui): button layout')).toBe(true);
    expect(isBugfixMessage('hotfix: critical security patch')).toBe(true);
    expect(isBugfixMessage('bugfix: infinite loop in parser')).toBe(true);
    expect(isBugfixMessage('Fixed memory leak in cache')).toBe(true);
    expect(isBugfixMessage('Resolve database timeout issue')).toBe(true);
    expect(isBugfixMessage('feat: add user authentication')).toBe(false);
    expect(isBugfixMessage('refactor: simplify reducer code')).toBe(false);
    expect(isBugfixMessage('docs: update readme')).toBe(false);
  });

  it('handles tab-delimited paths with spaces and multiple line segments correctly', () => {
    const statsMap = new Map<string, FileCommitStat>();
    const rawLog = [
      'COMMIT:sha1|1700000000|Dev|feat: update spaced file',
      '12\t4\tsrc/components/My Spaced Component.tsx',
      '0\t0\tsrc/empty.ts',
      'invalid line without tabs',
    ].join('\n');

    analyzer.parseLogOutput(rawLog, statsMap);

    const spacedStats = statsMap.get('src/components/My Spaced Component.tsx');
    expect(spacedStats).toBeDefined();
    expect(spacedStats?.linesAdded).toBe(12);
    expect(spacedStats?.linesDeleted).toBe(4);

    const emptyStats = statsMap.get('src/empty.ts');
    expect(emptyStats).toBeDefined();
    expect(emptyStats?.commitCount).toBe(1);
  });
});

