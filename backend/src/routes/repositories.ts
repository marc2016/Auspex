import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb, getLatestSnapshot } from '../services/db';
import {
  registerScanController,
  unregisterScanController,
  broadcastProgress,
  broadcastComplete,
  broadcastError,
} from '../services/websocket';
import { RepoResolverStage } from '../pipeline/stages/01_repo_resolver';
import { GitChurnAnalyzerStage } from '../pipeline/stages/02_git_churn_analyzer';
import { AstStructureAnalyzerStage } from '../pipeline/stages/03_ast_structure_analyzer';
import { TreeAggregatorStage } from '../pipeline/stages/04_tree_aggregator';
import type { PipelineContext } from '../pipeline/types';
import type { ScanStage } from '@auspex/shared';
import fs from 'fs';

const router = Router();

// ─── Validation Schemas ────────────────────────────────────────────────────

const createRepoSchema = z.object({
  name: z.string().min(1).max(100),
  urlOrPath: z.string().min(1),
  isRemote: z.boolean().default(false),
  defaultBranch: z.string().default('main'),
  shallowClone: z.boolean().default(false),
  ignorePatterns: z.array(z.string()).default(['node_modules', 'dist', '.git', 'bin', 'obj']),
  authTokenId: z.string().optional(),
});

// ─── GET /api/repositories ─────────────────────────────────────────────────

router.get('/', (_req, res) => {
  const db = getDb();
  const repos = db.prepare('SELECT * FROM repositories ORDER BY created_at DESC').all();

  // Attach last scan info
  const enriched = repos.map((repo: unknown) => {
    const r = repo as { id: string };
    const snapshot = getLatestSnapshot(r.id);
    return {
      ...(r as object),
      lastScan: snapshot
        ? {
            headCommitSha: snapshot.head_commit_sha,
            scannedAt: snapshot.scanned_at,
            totalFiles: snapshot.total_files,
            totalLoc: snapshot.total_loc,
          }
        : null,
    };
  });

  res.json(enriched);
});

// ─── POST /api/repositories ────────────────────────────────────────────────

router.post('/', (req, res) => {
  const parsed = createRepoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, urlOrPath, isRemote, defaultBranch, shallowClone, ignorePatterns, authTokenId } =
    parsed.data;
  const db = getDb();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO repositories (id, name, url_or_path, is_remote, default_branch, shallow_clone, ignore_patterns, auth_token_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, urlOrPath, isRemote ? 1 : 0, defaultBranch, shallowClone ? 1 : 0, JSON.stringify(ignorePatterns), authTokenId ?? null);

  const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(id);
  res.status(201).json(repo);
});

// ─── DELETE /api/repositories/:id ──────────────────────────────────────────

router.delete('/:id', (req, res) => {
  const db = getDb();
  const { changes } = db.prepare('DELETE FROM repositories WHERE id = ?').run(req.params.id);
  if (changes === 0) {
    res.status(404).json({ error: 'Repository not found.' });
    return;
  }
  res.json({ success: true });
});

// ─── GET /api/repositories/:id/treemap ─────────────────────────────────────

router.get('/:id/treemap', (req, res) => {
  const snapshot = getLatestSnapshot(req.params.id);
  if (!snapshot) {
    res.status(404).json({ error: 'No scan found for this repository. Run a scan first.' });
    return;
  }

  res.json({
    id: snapshot.id,
    repositoryId: snapshot.repo_id,
    headCommitSha: snapshot.head_commit_sha,
    isIncremental: snapshot.is_incremental === 1,
    totalFiles: snapshot.total_files,
    totalLoc: snapshot.total_loc,
    scannedAt: snapshot.scanned_at,
    tree: JSON.parse(snapshot.tree_data),
  });
});

// ─── GET /api/repositories/:id/snapshots ───────────────────────────────────

router.get('/:id/snapshots', (req, res) => {
  const db = getDb();
  const snapshots = db
    .prepare(
      `SELECT id, repo_id, head_commit_sha, is_incremental, total_files, total_loc, duration_ms, scanned_at
       FROM scan_snapshots WHERE repo_id = ? ORDER BY scanned_at DESC LIMIT 20`
    )
    .all(req.params.id);
  res.json(snapshots);
});

// ─── POST /api/repositories/:id/scan ───────────────────────────────────────

router.post('/:id/scan', async (req, res) => {
  const repositoryId = req.params.id;
  const db = getDb();
  const repo = db.prepare('SELECT id FROM repositories WHERE id = ?').get(repositoryId);

  if (!repo) {
    res.status(404).json({ error: 'Repository not found.' });
    return;
  }

  // Acknowledge immediately – progress comes via WebSocket
  res.json({ message: 'Scan started. Connect via WebSocket for live progress.' });

  // Run scan in background (non-blocking)
  runScanPipeline(repositoryId).catch((err) => {
    console.error(`[SCAN] Unhandled error for repo ${repositoryId}:`, err);
  });
});

// ─── Pipeline Orchestrator ─────────────────────────────────────────────────

async function runScanPipeline(repositoryId: string): Promise<void> {
  const startTime = Date.now();
  const controller = registerScanController(repositoryId);

  const ctx: PipelineContext = {
    repositoryId,
    repoPath: '',
    isTemporaryClone: false,
    headCommitSha: '',
    isIncremental: false,
    changedFiles: new Set(),
    deletedFiles: new Set(),
    commitCounts: new Map(),
    totalFiles: 0,
    totalLoc: 0,
    signal: controller.signal,
    reportProgress: (stage, message, percent, filesProcessed, totalFiles) => {
      broadcastProgress({
        repositoryId,
        stage: stage as ScanStage,
        message,
        percent,
        filesProcessed,
        totalFiles,
      });
    },
  };

  const stages = [
    new RepoResolverStage(),
    new GitChurnAnalyzerStage(),
    new AstStructureAnalyzerStage(),
    new TreeAggregatorStage(),
  ];

  try {
    for (const stage of stages) {
      if (controller.signal.aborted) throw new Error('Scan cancelled.');
      await stage.execute(ctx);
    }

    const durationMs = Date.now() - startTime;
    const snapshot = getLatestSnapshot(repositoryId);

    broadcastComplete({
      repositoryId,
      snapshotId: snapshot?.id ?? '',
      isIncremental: ctx.isIncremental,
      totalFiles: ctx.totalFiles,
      totalLoc: ctx.totalLoc,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === 'SNAPSHOT_CURRENT') {
      // Not an error – snapshot is up to date
      const snapshot = getLatestSnapshot(repositoryId)!;
      broadcastComplete({
        repositoryId,
        snapshotId: snapshot.id,
        isIncremental: true,
        totalFiles: snapshot.total_files,
        totalLoc: snapshot.total_loc,
        durationMs: Date.now() - startTime,
      });
    } else if (message !== 'Scan cancelled.') {
      console.error(`[SCAN] Error for repo ${repositoryId}:`, message);
      broadcastError({ repositoryId, message });
    }
  } finally {
    // Clean up temporary clone
    if (ctx.isTemporaryClone && ctx.repoPath && fs.existsSync(ctx.repoPath)) {
      fs.rmSync(ctx.repoPath, { recursive: true, force: true });
      console.log(`[SCAN] Cleaned up temp clone: ${ctx.repoPath}`);
    }
    unregisterScanController(repositoryId);
  }
}

export default router;
