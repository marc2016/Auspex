import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AuspexPipeline } from '../src/analyzer/pipeline';
import { AuspexStorage } from '../src/storage/cache';
import { ANALYZER_VERSION, type PipelineProgress } from '../src/analyzer/types';

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
      undefined,
      undefined,
      { maxCommits: 50 }
    );
    expect(snapshot).toBeDefined();
    expect(snapshot.totalFiles).toBe(2);
  });

  it('respects .gitignore and respectGitIgnore option in pipeline.run', async () => {
    fs.writeFileSync(path.join(tempWorkspace, '.gitignore'), 'src/utils/\n');

    // With default respectGitIgnore: true
    const snap1 = await pipeline.run(
      tempWorkspace,
      storage,
      undefined,
      ['ignored_dir']
    );
    expect(snap1.totalFiles).toBe(1); // helper.ts is ignored by .gitignore

    // With respectGitIgnore: false
    const snap2 = await pipeline.run(
      tempWorkspace,
      storage,
      undefined,
      ['ignored_dir'],
      undefined,
      undefined,
      { respectGitIgnore: false }
    );
    expect(snap2.totalFiles).toBe(2); // helper.ts is included again
  });

  describe('analyzer version in the file cache', () => {
    const SENTINEL_LOC = 9999;
    const tamperIndexEntry = (version: number | undefined) => {
      const cache = storage.loadFileCache();
      const entry = cache['src/index.ts'];
      entry.loc = SENTINEL_LOC;
      if (version === undefined) delete entry.analyzerVersion;
      else entry.analyzerVersion = version;
      storage.saveFileCache(cache);
    };
    const indexLoc = (snap: { tree: any }) =>
      snap.tree.children?.find((c: any) => c.name === 'src')?.children?.find((c: any) => c.name === 'index.ts')?.loc;

    it('records the analyzer version on cached file results and on the snapshot', async () => {
      const snap = await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
      expect(snap.analyzerVersion).toBe(ANALYZER_VERSION);
      const cache = storage.loadFileCache();
      expect(cache['src/index.ts'].analyzerVersion).toBe(ANALYZER_VERSION);
      expect(storage.loadSnapshot()?.analyzerVersion).toBe(ANALYZER_VERSION);
    });

    it('reuses an unchanged file result with the current version', async () => {
      await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
      tamperIndexEntry(ANALYZER_VERSION);
      const snap = await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
      expect(indexLoc(snap)).toBe(SENTINEL_LOC);
    });

    it('re-analyzes an unchanged file result from an older version', async () => {
      await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
      tamperIndexEntry(ANALYZER_VERSION - 1);
      const snap = await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
      expect(indexLoc(snap)).not.toBe(SENTINEL_LOC);
      expect(storage.loadFileCache()['src/index.ts'].analyzerVersion).toBe(ANALYZER_VERSION);
      // re-parsed entries carry the data added in the current version (call sites)
      expect(storage.loadFileCache()['src/index.ts'].callSites).toBeDefined();
    });

    it('re-analyzes a cached file result without version', async () => {
      await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
      tamperIndexEntry(undefined);
      const snap = await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
      expect(indexLoc(snap)).not.toBe(SENTINEL_LOC);
    });
  });

  it('builds a call graph for JavaScript files', async () => {
    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'cart.js'),
      ['function Cart() {', '  this.add = function () {', '    this.validate();', '  };', '  this.validate = function () {', '    return true;', '  };', '}'].join('\n')
    );
    const snap = await pipeline.run(tempWorkspace, storage, undefined, ['ignored_dir']);
    expect(snap.callGraph?.edges).toContainEqual({
      from: 'src/cart.js#Cart.add',
      to: 'src/cart.js#Cart.validate',
      confidence: 'certain',
      source: 'js',
    });
    expect(snap.callGraph?.functions.map((f) => f.id)).toContain('src/index.ts#main');
  });
});
