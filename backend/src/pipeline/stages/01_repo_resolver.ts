import path from 'path';
import fs from 'fs';
import os from 'os';
import { simpleGit } from 'simple-git';
import type { PipelineContext, PipelineStage } from '../types';
import { getDb, getLatestSnapshot } from '../../services/db';

const TEMP_CLONE_BASE = path.join(os.tmpdir(), '.auspex_clones');

/**
 * Stage 01: Repository Resolver
 *
 * Responsibilities:
 * - Resolve local path or clone remote URL into a local directory.
 * - Determine current HEAD commit SHA.
 * - Compare with last cached scan to decide full vs. incremental scan.
 * - Populate ctx.changedFiles and ctx.deletedFiles for delta scans.
 */
export class RepoResolverStage implements PipelineStage {
  readonly name = 'resolving';

  async execute(ctx: PipelineContext): Promise<void> {
    const db = getDb();
    const repo = db
      .prepare('SELECT * FROM repositories WHERE id = ?')
      .get(ctx.repositoryId) as
      | {
          url_or_path: string;
          is_remote: number;
          default_branch: string;
          shallow_clone: number;
          auth_token_id: string | null;
        }
      | undefined;

    if (!repo) throw new Error(`Repository ${ctx.repositoryId} not found.`);

    ctx.reportProgress('resolving', 'Resolving repository…', 0);

    if (repo.is_remote) {
      const repoPath = await this.cloneRemote(repo, ctx);
      ctx.repoPath = repoPath;
      ctx.isTemporaryClone = true;
    } else {
      if (!fs.existsSync(repo.url_or_path)) {
        throw new Error(`Local path does not exist: ${repo.url_or_path}`);
      }
      ctx.repoPath = repo.url_or_path;
      ctx.isTemporaryClone = false;
    }

    // Determine HEAD SHA
    try {
      const git = simpleGit(ctx.repoPath);
      const isRepo = await git.checkIsRepo();
      if (isRepo) {
        const logResult = await git.log({ maxCount: 1 });
        ctx.headCommitSha = logResult.latest?.hash ?? 'uncommitted';
      } else {
        ctx.headCommitSha = 'non-git';
      }
    } catch {
      ctx.headCommitSha = 'initial';
    }

    ctx.reportProgress('resolving', `HEAD: ${ctx.headCommitSha.slice(0, 8)}`, 5);

    // Check for existing snapshot to determine incremental vs full scan
    const snapshot = getLatestSnapshot(ctx.repositoryId);

    if (
      snapshot &&
      snapshot.head_commit_sha === ctx.headCommitSha &&
      ctx.headCommitSha !== 'uncommitted' &&
      ctx.headCommitSha !== 'non-git'
    ) {
      throw new Error('SNAPSHOT_CURRENT');
    }

    if (snapshot && ctx.headCommitSha !== 'uncommitted' && ctx.headCommitSha !== 'non-git') {
      try {
        const git = simpleGit(ctx.repoPath);
        ctx.previousHeadCommitSha = snapshot.head_commit_sha;
        ctx.isIncremental = true;
        ctx.reportProgress('resolving', 'Calculating changed files (delta scan)…', 8);

        const diffResult = await git.diff([
          '--name-status',
          snapshot.head_commit_sha,
          ctx.headCommitSha,
        ]);
        this.parseDiffOutput(diffResult, ctx);
      } catch {
        // Fallback to full scan if diff fails
        ctx.isIncremental = false;
        ctx.reportProgress('resolving', 'Performing full scan.', 8);
      }
    } else {
      ctx.isIncremental = false;
      ctx.reportProgress('resolving', 'Performing full scan.', 8);
    }
  }

  private async cloneRemote(
    repo: { url_or_path: string; shallow_clone: number; auth_token_id: string | null },
    ctx: PipelineContext
  ): Promise<string> {
    if (!fs.existsSync(TEMP_CLONE_BASE)) {
      fs.mkdirSync(TEMP_CLONE_BASE, { recursive: true });
    }

    const cloneDir = path.join(TEMP_CLONE_BASE, ctx.repositoryId);
    if (fs.existsSync(cloneDir)) {
      fs.rmSync(cloneDir, { recursive: true, force: true });
    }

    ctx.reportProgress('cloning', `Cloning ${repo.url_or_path}…`, 2);

    const git = simpleGit();
    const cloneOptions: string[] = [];

    if (repo.shallow_clone) {
      cloneOptions.push('--depth', '100');
    }

    await git.clone(repo.url_or_path, cloneDir, cloneOptions);
    return cloneDir;
  }

  private parseDiffOutput(diffOutput: string, ctx: PipelineContext): void {
    for (const line of diffOutput.split('\n').filter(Boolean)) {
      const parts = line.split('\t');
      const status = parts[0]?.charAt(0);
      const filePath = parts[1];

      if (!filePath) continue;

      if (status === 'D') {
        ctx.deletedFiles.add(filePath);
      } else if (status === 'R' && parts[2]) {
        ctx.deletedFiles.add(filePath);
        ctx.changedFiles.add(parts[2]);
      } else {
        ctx.changedFiles.add(filePath);
      }
    }
  }
}
