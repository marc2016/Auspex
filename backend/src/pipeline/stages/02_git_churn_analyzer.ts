import { simpleGit } from 'simple-git';
import { getDb } from '../../services/db';
import type { PipelineContext, PipelineStage } from '../types';

/**
 * Stage 02: Git Churn Analyzer
 *
 * Responsibilities:
 * - Count commits per file from Git history.
 * - For incremental scans: read only commits since last HEAD SHA and
 *   add to existing cached commit counts.
 * - Populate ctx.commitCounts: Map<filePath, count>
 */
export class GitChurnAnalyzerStage implements PipelineStage {
  readonly name = 'git_churn';

  async execute(ctx: PipelineContext): Promise<void> {
    ctx.reportProgress('git_churn', 'Analyzing Git commit history…', 10);

    const git = simpleGit(ctx.repoPath);

    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        ctx.reportProgress('git_churn', 'Not a git repository, skipping churn history.', 20);
        return;
      }

      if (ctx.isIncremental && ctx.previousHeadCommitSha) {
        await this.runIncrementalChurn(git, ctx);
      } else {
        await this.runFullChurn(git, ctx);
      }
    } catch (err) {
      console.warn(`[CHURN] Git history query failed, continuing with zero churn:`, err);
    }

    ctx.reportProgress('git_churn', `Churn analysis complete (${ctx.commitCounts.size} files).`, 20);
  }

  private async runFullChurn(
    git: ReturnType<typeof simpleGit>,
    ctx: PipelineContext
  ): Promise<void> {
    try {
      const logResult = await git.raw([
        'log',
        '--pretty=format:',
        '--name-only',
        '--diff-filter=ACDMRT',
      ]);

      for (const filePath of logResult.split('\n').filter(Boolean)) {
        const trimmed = filePath.trim().replace(/\\/g, '/');
        if (trimmed) {
          ctx.commitCounts.set(trimmed, (ctx.commitCounts.get(trimmed) ?? 0) + 1);
        }
      }
    } catch {
      // Empty repo or uncommitted files
    }
  }

  private async runIncrementalChurn(
    git: ReturnType<typeof simpleGit>,
    ctx: PipelineContext
  ): Promise<void> {
    const db = getDb();

    const cachedFiles = db
      .prepare('SELECT file_path, commit_count FROM file_cache WHERE repo_id = ?')
      .all(ctx.repositoryId) as { file_path: string; commit_count: number }[];

    for (const row of cachedFiles) {
      ctx.commitCounts.set(row.file_path, row.commit_count);
    }

    try {
      const logResult = await git.raw([
        'log',
        `${ctx.previousHeadCommitSha}..HEAD`,
        '--pretty=format:',
        '--name-only',
        '--diff-filter=ACDMRT',
      ]);

      for (const filePath of logResult.split('\n').filter(Boolean)) {
        const trimmed = filePath.trim().replace(/\\/g, '/');
        if (trimmed) {
          ctx.commitCounts.set(trimmed, (ctx.commitCounts.get(trimmed) ?? 0) + 1);
        }
      }
    } catch {
      // Fallback if range fails
    }
  }
}
