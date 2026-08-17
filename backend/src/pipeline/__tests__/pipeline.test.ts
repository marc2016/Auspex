import { describe, it, expect, beforeEach } from 'vitest';
import { TreeAggregatorStage } from '../stages/04_tree_aggregator';
import { AstStructureAnalyzerStage } from '../stages/03_ast_structure_analyzer';
import type { PipelineContext, ParsedFileInfo } from '../types';
import { getDb } from '../../services/db';

describe('Auspex Pipeline Stages', () => {
  beforeEach(() => {
    const db = getDb();
    db.exec(`
      DELETE FROM scan_snapshots;
      DELETE FROM file_cache;
      DELETE FROM repositories;
      INSERT INTO repositories (id, name, url_or_path, is_remote)
      VALUES ('test-repo', 'Test Repo', '/tmp/test-repo', 0);
    `);
  });

  it('TreeAggregatorStage builds a clean 4-level hierarchy and normalizes churn', async () => {
    const stage = new TreeAggregatorStage();

    const dummyFiles: ParsedFileInfo[] = [
      {
        filePath: 'src/services/auth.ts',
        namespace: 'AuthModule',
        loc: 100,
        fileHash: 'hash1',
        methods: [
          { name: 'login()', startLine: 10, endLine: 35, loc: 26 },
          { name: 'logout()', startLine: 40, endLine: 55, loc: 16 },
        ],
      },
      {
        filePath: 'src/utils/math.ts',
        loc: 50,
        fileHash: 'hash2',
        methods: [{ name: 'add()', startLine: 5, endLine: 10, loc: 6 }],
      },
      {
        filePath: 'README.md',
        loc: 20,
        fileHash: 'hash3',
        methods: [],
      },
    ];

    const commitCounts = new Map<string, number>();
    commitCounts.set('src/services/auth.ts', 10);
    commitCounts.set('src/utils/math.ts', 2);
    commitCounts.set('README.md', 1);

    const ctx: PipelineContext = {
      repositoryId: 'test-repo',
      repoPath: '/tmp/test-repo',
      isTemporaryClone: false,
      headCommitSha: 'abcdef1234567890',
      isIncremental: false,
      changedFiles: new Set(),
      deletedFiles: new Set(),
      commitCounts,
      totalFiles: 3,
      totalLoc: 0,
      signal: new AbortController().signal,
      reportProgress: () => {},
    };

    (ctx as unknown as Record<string, unknown>)['parsedFiles'] = dummyFiles;

    await stage.execute(ctx);

    expect(ctx.tree).toBeDefined();
    expect(ctx.tree?.type).toBe('folder');
    expect(ctx.totalLoc).toBe(170);

    // Verify root children
    const rootChildren = ctx.tree?.children;
    expect(rootChildren).toBeDefined();

    // src folder and README.md
    const srcFolder = rootChildren?.find((c) => c.name === 'src');
    expect(srcFolder).toBeDefined();
    expect(srcFolder?.type).toBe('folder');

    // Inside src: services (with AuthModule) and utils
    const servicesFolder = srcFolder?.children?.find((c) => c.name === 'services');
    expect(servicesFolder).toBeDefined();

    const authNs = servicesFolder?.children?.find((c) => c.name === 'AuthModule');
    expect(authNs).toBeDefined();
    expect(authNs?.type).toBe('namespace');

    const authFile = authNs?.children?.find((c) => c.name === 'auth.ts');
    expect(authFile).toBeDefined();
    expect(authFile?.type).toBe('file');
    expect(authFile?.children?.length).toBe(2);
    expect(authFile?.churnScore).toBe(1); // 10 / 10 = 1.0 (max churn)
  });
});
