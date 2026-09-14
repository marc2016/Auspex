import { simpleGit } from 'simple-git';
import type { FileCommitStat, ContributorStat, CommitInfo, ProjectCouplingPair } from './types';
import { TemporalCouplingAnalyzer } from './temporalCoupling';

export function isBugfixMessage(message: string): boolean {
  const subject = (message || '').toLowerCase().trim();
  if (
    subject.startsWith('fix:') ||
    subject.startsWith('fix(') ||
    subject.startsWith('hotfix:') ||
    subject.startsWith('bugfix:')
  ) {
    return true;
  }
  return /\b(fix|fixed|fixes|bug|bugs|hotfix|patch|resolve|resolved)\b/i.test(subject);
}

export class GitChurnAnalyzer {
  public lastProjectCouplings: ProjectCouplingPair[] = [];
  public lastDetectedAuthors: string[] = [];

  /**
   * Runs git log with numstat to extract commit counts, churn lines, and author activity.
   * Returns a map of relative file paths to FileCommitStat.
   */
  async analyze(
    workspacePath: string,
    options?: { maxCommits?: number; authorAliases?: Record<string, string[]> }
  ): Promise<Map<string, FileCommitStat>> {
    const statsMap = new Map<string, FileCommitStat>();

    try {
      const git = simpleGit(workspacePath);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        return statsMap;
      }

      const args = [
        'log',
        '--use-mailmap',
        '--numstat',
        '--format=COMMIT:%H|%at|%aN|%s',
        '--diff-filter=ACDMRT',
      ];

      const maxCommits = options?.maxCommits ?? 15000;
      if (maxCommits > 0) {
        args.push(`--max-count=${maxCommits}`);
      }

      const logOutput = await git.raw(args);

      this.parseLogOutput(logOutput, statsMap, options?.authorAliases);
    } catch (err) {
      console.warn('[Auspex] Git churn analysis skipped/failed:', err);
    }

    return statsMap;
  }

  /**
   * Parses git log --numstat output into semantic commit statistics.
   */
  public parseLogOutput(
    logOutput: string,
    statsMap: Map<string, FileCommitStat>,
    authorAliases?: Record<string, string[]>
  ): void {
    const lines = logOutput.split('\n');

    const aliasToCanonical = new Map<string, string>();
    if (authorAliases) {
      for (const [canonical, aliases] of Object.entries(authorAliases)) {
        if (Array.isArray(aliases)) {
          for (const alias of aliases) {
            const trimmed = (alias || '').trim();
            if (trimmed) {
              aliasToCanonical.set(trimmed.toLowerCase(), canonical.trim());
            }
          }
        }
        if (canonical && canonical.trim()) {
          aliasToCanonical.set(canonical.trim().toLowerCase(), canonical.trim());
        }
      }
    }

    const detectedAuthorsSet = new Set<string>();

    let currentCommitSha = '';
    let currentAuthor = 'Unknown';
    let currentTimestamp = Date.now();
    let currentMessage = '';
    let isFix = false;
    let isFeat = false;
    let isRefactor = false;

    const fileContributorsMap = new Map<
      string,
      Map<string, { commits: number; linesAdded: number; linesDeleted: number }>
    >();
    const fileCommitsMap = new Map<string, CommitInfo[]>();
    const couplingAnalyzer = new TemporalCouplingAnalyzer();
    let currentCommitFiles: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('COMMIT:')) {
        if (currentCommitFiles.length > 0) {
          couplingAnalyzer.recordCommitFiles(currentCommitFiles);
          currentCommitFiles = [];
        }

        isFix = false;
        isFeat = false;
        isRefactor = false;

        const parts = line.slice(7).split('|');
        currentCommitSha = parts[0] || '';
        const timestampSec = parseInt(parts[1], 10);
        currentTimestamp = !isNaN(timestampSec) ? timestampSec * 1000 : Date.now();

        let rawAuthor = 'Unknown';
        if (parts.length >= 4) {
          rawAuthor = (parts[2] || 'Unknown').trim();
          currentMessage = parts.slice(3).join('|');
        } else {
          rawAuthor = (parts[2] || 'Unknown').trim();
          currentMessage = parts.slice(2).join('|');
        }

        if (rawAuthor && rawAuthor !== 'Unknown') {
          detectedAuthorsSet.add(rawAuthor);
        }

        const mappedAuthor = aliasToCanonical.get(rawAuthor.toLowerCase()) || rawAuthor;
        currentAuthor = mappedAuthor || 'Unknown';

        const subject = currentMessage.toLowerCase();

        // 1. Conventional Commits prefix matching
        if (
          subject.startsWith('fix:') ||
          subject.startsWith('fix(') ||
          subject.startsWith('hotfix:') ||
          subject.startsWith('bugfix:')
        ) {
          isFix = true;
        } else if (
          subject.startsWith('feat:') ||
          subject.startsWith('feat(') ||
          subject.startsWith('feature:')
        ) {
          isFeat = true;
        } else if (
          subject.startsWith('refactor:') ||
          subject.startsWith('refactor(') ||
          subject.startsWith('perf:') ||
          subject.startsWith('perf(')
        ) {
          isRefactor = true;
        } else {
          // 2. Keyword fallback for non-conventional commit messages
          isFix = isBugfixMessage(subject);
          isFeat = /\b(feat|feature|add|added|implement|implemented|new)\b/i.test(subject);
          isRefactor = /\b(refactor|refactored|clean|cleanup|restructure|reorganize|rewrite|simplify)\b/i.test(subject);
        }

        continue;
      }

      // Parse numstat line: <added>\t<deleted>\t<filepath>
      let added = 0;
      let deleted = 0;
      let filePath = '';

      const tab1 = rawLine.indexOf('\t');
      if (tab1 !== -1) {
        const tab2 = rawLine.indexOf('\t', tab1 + 1);
        if (tab2 !== -1) {
          const addedStr = rawLine.slice(0, tab1).trim();
          const deletedStr = rawLine.slice(tab1 + 1, tab2).trim();
          filePath = rawLine.slice(tab2 + 1).trim().replace(/\\/g, '/');
          added = addedStr === '-' ? 0 : parseInt(addedStr, 10) || 0;
          deleted = deletedStr === '-' ? 0 : parseInt(deletedStr, 10) || 0;
        }
      }

      if (!filePath) {
        const match = rawLine.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
        if (match) {
          added = match[1] === '-' ? 0 : parseInt(match[1], 10) || 0;
          deleted = match[2] === '-' ? 0 : parseInt(match[2], 10) || 0;
          filePath = match[3].trim().replace(/\\/g, '/');
        }
      }

      if (filePath) {
        // Handle git file rename notation: {old_dir => new_dir}/file.ts or old.ts => new.ts
        if (filePath.includes('=>')) {
          filePath = this.resolveRenamePath(filePath);
        }

        if (!filePath) continue;

        let stats = statsMap.get(filePath);
        if (!stats) {
          stats = {
            commitCount: 0,
            fixCount: 0,
            featCount: 0,
            refactorCount: 0,
            linesAdded: 0,
            linesDeleted: 0,
            lastModifiedAt: 0,
            contributors: [],
            commits: [],
          };
          statsMap.set(filePath, stats);
        }

        stats.commitCount += 1;
        if (isFix) stats.fixCount += 1;
        if (isFeat) stats.featCount += 1;
        if (isRefactor) stats.refactorCount += 1;
        stats.linesAdded += added;
        stats.linesDeleted += deleted;
        stats.lastModifiedAt = Math.max(stats.lastModifiedAt, currentTimestamp);

        // Record commit info for this file
        let commits = fileCommitsMap.get(filePath);
        if (!commits) {
          commits = [];
          fileCommitsMap.set(filePath, commits);
        }
        commits.push({
          hash: currentCommitSha,
          author: currentAuthor,
          timestamp: currentTimestamp,
          message: currentMessage,
          linesAdded: added,
          linesDeleted: deleted,
          isFix,
        });

        // Record contributor contribution for this file
        let contribMap = fileContributorsMap.get(filePath);
        if (!contribMap) {
          contribMap = new Map();
          fileContributorsMap.set(filePath, contribMap);
        }
        const existing = contribMap.get(currentAuthor) || { commits: 0, linesAdded: 0, linesDeleted: 0 };
        existing.commits += 1;
        existing.linesAdded += added;
        existing.linesDeleted += deleted;
        contribMap.set(currentAuthor, existing);

        // Record for temporal coupling
        currentCommitFiles.push(filePath);
      }
    }

    // Flush last commit files for temporal coupling
    if (currentCommitFiles.length > 0) {
      couplingAnalyzer.recordCommitFiles(currentCommitFiles);
    }

    // Finalize temporal coupling
    const { fileCouplings, projectCouplings } = couplingAnalyzer.finalize(statsMap);
    this.lastProjectCouplings = projectCouplings;

    // Finalize contributors, commits, and temporal coupling per file
    for (const [filePath, stats] of statsMap.entries()) {
      stats.temporalCoupling = fileCouplings.get(filePath) || [];

      const commits = fileCommitsMap.get(filePath) || [];
      commits.sort((a, b) => b.timestamp - a.timestamp);
      stats.commits = commits;

      const contribMap = fileContributorsMap.get(filePath);
      if (contribMap && stats.commitCount > 0) {
        const contributors: ContributorStat[] = [];
        for (const [name, c] of contribMap.entries()) {
          const percentage = Number(((c.commits / stats.commitCount) * 100).toFixed(1));
          contributors.push({
            name,
            commits: c.commits,
            linesAdded: c.linesAdded,
            linesDeleted: c.linesDeleted,
            percentage,
          });
        }
        contributors.sort(
          (a, b) => b.commits - a.commits || (b.linesAdded + b.linesDeleted) - (a.linesAdded + a.linesDeleted)
        );
        stats.contributors = contributors;
      } else {
        stats.contributors = [];
      }
    }

    this.lastDetectedAuthors = Array.from(detectedAuthorsSet).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  private resolveRenamePath(filePath: string): string {
    const braceMatch = filePath.match(/(.*)\{(.*)\s*=>\s*(.*)\}(.*)/);
    if (braceMatch) {
      const prefix = braceMatch[1];
      const newPart = braceMatch[3].trim();
      const suffix = braceMatch[4];
      return `${prefix}${newPart}${suffix}`.replace(/\/+/g, '/');
    }
    const arrowMatch = filePath.split('=>');
    if (arrowMatch.length === 2) {
      return arrowMatch[1].trim();
    }
    return filePath;
  }
}
