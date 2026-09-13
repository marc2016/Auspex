import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AuspexPipeline } from '../src/analyzer/pipeline';
import { AuspexStorage } from '../src/storage/cache';
import type { PipelineProgress } from '../src/analyzer/types';

describe('AuspexPipeline', () => {
  let tempWorkspace: string;
  let tempStorageDir: string;
  let storage: AuspexStorage;
  const pipeline = new AuspexPipeline();

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'auspex-pipe-ws-'));
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auspex-pipe-store-'));
    storage = new AuspexStorage(tempStorageDir);

    // Create a mock codebase structure
    fs.mkdirSync(path.join(tempWorkspace, 'src', 'utils'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspace, 'ignored_dir'), { recursive: true });

    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'index.ts'),
      'export function main() {\n  return 1;\n}'
    );
    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'utils', 'helper.ts'),
      'export const help = () => {\n  console.log("help");\n};'
    );
    fs.writeFileSync(
      path.join(tempWorkspace, 'ignored_dir', 'skip.ts'),
      'export const skipped = true;'
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('runs complete analysis pipeline, reports progress, and saves snapshot', async () => {
    const progressEvents: PipelineProgress[] = [];

    const snapshot = await pipeline.run(
      tempWorkspace,
      storage,
      (p) => progressEvents.push(p),
      ['ignored_dir']
    );

    expect(snapshot).toBeDefined();
    expect(snapshot.totalFiles).toBe(2); // index.ts and helper.ts (ignored_dir excluded)
    expect(snapshot.tree.type).toBe('folder');
    expect(snapshot.totalLoc).toBeGreaterThan(0);

    // Verify progress stages were reported
    const stages = progressEvents.map((e) => e.stage);
    expect(stages).toContain('churn');
    expect(stages).toContain('ast');
    expect(stages).toContain('tree');
    expect(stages).toContain('done');

    const lastProgress = progressEvents[progressEvents.length - 1];
    expect(lastProgress.percentage).toBe(100);

    // Verify snapshot was persisted in storage
    const loaded = storage.loadSnapshot();
    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe(snapshot.id);
  });

  it('leverages incremental cache when files are unchanged on subsequent runs', async () => {
    // Run 1: cold run
    const snap1 = await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
    expect(snap1.totalFiles).toBe(2);

    // Run 2: warm run (files unchanged, mtime matches)
    const progressEvents: PipelineProgress[] = [];
    const snap2 = await pipeline.run(
      tempWorkspace,
      storage,
      (p) => progressEvents.push(p),
      ['ignored_dir']
    );

    expect(snap2.totalFiles).toBe(2);
    expect(snap2.totalLoc).toBe(snap1.totalLoc);

    // Storage is updated with the new snapshot
    const loaded = storage.loadSnapshot();
    expect(loaded?.id).toBe(snap2.id);
  });

  it('re-analyzes modified files while preserving unchanged files from cache', async () => {
    // Run 1
    const snap1 = await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
    const origLoc = snap1.totalLoc;

    // Modify index.ts by adding 10 lines
    const indexPath = path.join(tempWorkspace, 'src', 'index.ts');
    const newContent = 'export function main() {\n' + Array(10).fill('  console.log("more");\n').join('') + '  return 42;\n}\n';
    // Sleep a tiny fraction to ensure mtime advances
    const futureTime = new Date(Date.now() + 2000);
    fs.writeFileSync(indexPath, newContent);
    fs.utimesSync(indexPath, futureTime, futureTime);

    // Run 2: index.ts should be re-analyzed with more LOC
    const snap2 = await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
    expect(snap2.totalLoc).toBeGreaterThan(origLoc);

    // helper.ts LOC should remain intact
    const helperNode = snap2.tree.children
      ?.find((c) => c.name === 'src')
      ?.children?.find((c) => c.name === 'utils')
      ?.children?.find((c) => c.name === 'helper.ts');
    expect(helperNode).toBeDefined();
    expect(helperNode?.loc).toBeGreaterThan(0);
  });

  it('supports maxCommits parameter passing without error', async () => {
    const snapshot = await pipeline.run(
      tempWorkspace,
      storage,
      undefined,
      ['ignored_dir'],
      50
    );
    expect(snapshot).toBeDefined();
    expect(snapshot.totalFiles).toBe(2);
  });
});

