import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AuspexStorage } from '../src/storage/cache';
import type { AnalysisSnapshot, ParsedFileInfo } from '../src/analyzer/types';

describe('AuspexStorage', () => {
  let tempStorageDir: string;
  let storage: AuspexStorage;

  beforeEach(() => {
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auspex-storage-test-'));
    storage = new AuspexStorage(tempStorageDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('returns null when no snapshot file exists', () => {
    expect(storage.loadSnapshot()).toBeNull();
  });

  it('saves and restores an AnalysisSnapshot correctly', () => {
    const dummySnapshot: AnalysisSnapshot = {
      id: 'snap-123',
      workspacePath: '/mock/workspace',
      headCommitSha: 'commit-abc',
      totalFiles: 42,
      totalLoc: 5432,
      durationMs: 350,
      scannedAt: '2026-09-10T07:00:00.000Z',
      tree: {
        name: 'root',
        path: '/',
        type: 'folder',
        value: 5432,
        loc: 5432,
        commitCount: 150,
        churnScore: 1.0,
        fixCount: 30,
        featCount: 40,
        refactorCount: 10,
        linesAdded: 2000,
        linesDeleted: 500,
      },
      hotspots: [
        {
          filePath: 'src/main.ts',
          name: 'main.ts',
          loc: 300,
          commitCount: 25,
          fixCount: 10,
          churnScore: 1.0,
          defectRatio: 0.4,
        },
      ],
    };

    storage.saveSnapshot(dummySnapshot);
    const loaded = storage.loadSnapshot();

    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe('snap-123');
    expect(loaded?.totalFiles).toBe(42);
    expect(loaded?.totalLoc).toBe(5432);
    expect(loaded?.hotspots[0].filePath).toBe('src/main.ts');
  });

  it('handles corrupt snapshot JSON files gracefully without throwing', () => {
    fs.writeFileSync(path.join(tempStorageDir, 'snapshot.json'), '{ invalid json ...');
    const loaded = storage.loadSnapshot();
    expect(loaded).toBeNull();
  });

  it('saves and restores file cache for incremental scans', () => {
    expect(storage.loadFileCache()).toEqual({});

    const cacheData: Record<string, ParsedFileInfo> = {
      'src/app.ts': {
        filePath: 'src/app.ts',
        loc: 100,
        fileHash: 'sha-256-hash',
        classes: [],
        methods: [],
      },
    };

    storage.saveFileCache(cacheData);
    const restored = storage.loadFileCache();

    expect(restored['src/app.ts']).toBeDefined();
    expect(restored['src/app.ts'].fileHash).toBe('sha-256-hash');
  });

  it('handles corrupt file cache JSON gracefully without throwing', () => {
    fs.writeFileSync(path.join(tempStorageDir, 'file_cache.json'), 'not a json');
    expect(storage.loadFileCache()).toEqual({});
  });
});
