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
});
