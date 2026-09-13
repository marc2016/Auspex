import { describe, it, expect } from 'vitest';
import { TreeAggregator } from '../src/analyzer/treeAggregator';
import type { ParsedFileInfo, FileCommitStat } from '../src/analyzer/types';

describe('TreeAggregator', () => {
  const aggregator = new TreeAggregator();

  it('builds full 4-level hierarchy and aggregates LOC and git metrics', () => {
    const files: ParsedFileInfo[] = [
      {
        filePath: 'src/api/client.ts',
        namespace: 'Network',
        loc: 120,
        fileHash: 'h1',
        classes: [
          {
            name: 'HttpClient',
            startLine: 10,
            endLine: 110,
            loc: 100,
            methods: [],
          },
        ],
        methods: [
          { name: 'get()', startLine: 20, endLine: 50, loc: 30 },
          { name: 'post()', startLine: 55, endLine: 95, loc: 40 },
        ],
      },
      {
        filePath: 'src/utils/format.ts',
        loc: 30,
        fileHash: 'h2',
        classes: [],
        methods: [{ name: 'formatDate()', startLine: 5, endLine: 25, loc: 20 }],
      },
      {
        filePath: 'docs/guide.md',
        loc: 50,
        fileHash: 'h3',
        classes: [],
        methods: [],
      },
    ];

    const stats = new Map<string, FileCommitStat>();
    stats.set('src/api/client.ts', {
      commitCount: 20,
      fixCount: 10,
      featCount: 5,
      refactorCount: 2,
      linesAdded: 150,
      linesDeleted: 30,
      lastModifiedAt: 1700000000,
    });
    stats.set('src/utils/format.ts', {
      commitCount: 4,
      fixCount: 1,
      featCount: 2,
      refactorCount: 0,
      linesAdded: 35,
      linesDeleted: 5,
      lastModifiedAt: 1699990000,
    });
    stats.set('docs/guide.md', {
      commitCount: 1,
      fixCount: 0,
      featCount: 1,
      refactorCount: 0,
      linesAdded: 50,
      linesDeleted: 0,
      lastModifiedAt: 1699900000,
    });

    const { tree, hotspots } = aggregator.buildTree(files, stats);

    expect(tree).toBeDefined();
    expect(tree.type).toBe('folder');
    expect(tree.loc).toBe(200); // 120 + 30 + 50
    expect(tree.commitCount).toBe(25); // 20 + 4 + 1

    // Root should have 'src' and 'docs'
    const srcFolder = tree.children?.find((c) => c.name === 'src');
    expect(srcFolder).toBeDefined();
    expect(srcFolder?.type).toBe('folder');
    expect(srcFolder?.loc).toBe(150); // 120 + 30

    // Inside src: api folder with Network namespace
    const apiFolder = srcFolder?.children?.find((c) => c.name === 'api');
    expect(apiFolder).toBeDefined();

    const netNamespace = apiFolder?.children?.find((c) => c.name === 'Network');
    expect(netNamespace?.type).toBe('namespace');

    const clientFile = netNamespace?.children?.find((c) => c.name === 'client.ts');
    expect(clientFile?.type).toBe('file');
    expect(clientFile?.churnScore).toBe(1.0); // 20 / 20 = 1.0
    expect(clientFile?.defectRatio).toBe(0.5); // 10 fixes / 20 commits

    // Class and methods attached
    const httpClass = clientFile?.children?.find((c) => c.name === 'HttpClient');
    expect(httpClass?.type).toBe('class');
    expect(httpClass?.children?.length).toBe(2); // get() and post() attached to HttpClient

    // Hotspot items
    expect(hotspots.length).toBe(3);
    // client.ts should be rank 1 hotspot (highest churn + high LOC)
    expect(hotspots[0].filePath).toBe('src/api/client.ts');
    expect(hotspots[0].defectRatio).toBe(0.5);
  });

  it('handles empty file lists gracefully', () => {
    const { tree, hotspots } = aggregator.buildTree([], new Map());
    expect(tree.loc).toBe(0);
    expect(tree.children).toEqual([]);
    expect(hotspots).toEqual([]);
  });

  it('aggregates contributors and commits hierarchically for folders and classes', () => {
    const files: ParsedFileInfo[] = [
      {
        filePath: 'src/moduleA.ts',
        loc: 80,
        fileHash: 'ha',
        classes: [
          {
            name: 'ServiceA',
            startLine: 1,
            endLine: 50,
            loc: 50,
            methods: [],
          },
        ],
        methods: [],
      },
      {
        filePath: 'src/moduleB.ts',
        loc: 60,
        fileHash: 'hb',
        classes: [],
        methods: [],
      },
    ];

    const stats = new Map<string, FileCommitStat>();
    stats.set('src/moduleA.ts', {
      commitCount: 2,
      fixCount: 1,
      featCount: 1,
      refactorCount: 0,
      linesAdded: 30,
      linesDeleted: 10,
      lastModifiedAt: 1700010000,
      contributors: [
        { name: 'Dev One', commits: 2, linesAdded: 30, linesDeleted: 10, percentage: 100 },
      ],
      commits: [
        {
          hash: 'sha1',
          author: 'Dev One',
          timestamp: 1700010000,
          message: 'Update moduleA',
          linesAdded: 30,
          linesDeleted: 10,
        },
      ],
    });

    stats.set('src/moduleB.ts', {
      commitCount: 1,
      fixCount: 0,
      featCount: 1,
      refactorCount: 0,
      linesAdded: 15,
      linesDeleted: 5,
      lastModifiedAt: 1700020000,
      contributors: [
        { name: 'Dev Two', commits: 1, linesAdded: 15, linesDeleted: 5, percentage: 100 },
      ],
      commits: [
        {
          hash: 'sha2',
          author: 'Dev Two',
          timestamp: 1700020000,
          message: 'Add moduleB',
          linesAdded: 15,
          linesDeleted: 5,
        },
      ],
    });

    const { tree } = aggregator.buildTree(files, stats);

    // Root folder aggregates contributors and commits
    expect(tree.contributors?.length).toBe(2);
    expect(tree.commits?.length).toBe(2);

    // src folder aggregates contributors
    const srcFolder = tree.children?.find((c) => c.name === 'src');
    expect(srcFolder).toBeDefined();
    expect(srcFolder?.contributors?.length).toBe(2);
    expect(srcFolder?.commits?.length).toBe(2);

    // Class node inherits file contributors and commits
    const moduleA = srcFolder?.children?.find((c) => c.name === 'moduleA.ts');
    expect(moduleA?.contributors?.[0].name).toBe('Dev One');
    const serviceA = moduleA?.children?.find((c) => c.name === 'ServiceA');
    expect(serviceA?.contributors?.[0].name).toBe('Dev One');
    expect(serviceA?.commits?.[0].hash).toBe('sha1');
  });

  it('caps folder commits to 100 most recent to prevent snapshot explosion while keeping total commitCount exact', () => {
    const files: ParsedFileInfo[] = [
      {
        filePath: 'src/heavy.ts',
        loc: 500,
        fileHash: 'h-heavy',
        classes: [],
        methods: [],
      },
    ];

    // Generate 150 distinct commits
    const manyCommits = Array.from({ length: 150 }, (_, i) => ({
      hash: `hash_${i}`,
      author: 'Dev',
      timestamp: 1700000000 + i * 10,
      message: `commit ${i}`,
      linesAdded: 2,
      linesDeleted: 1,
    }));

    const stats = new Map<string, FileCommitStat>();
    stats.set('src/heavy.ts', {
      commitCount: 150,
      fixCount: 20,
      featCount: 50,
      refactorCount: 10,
      linesAdded: 300,
      linesDeleted: 150,
      lastModifiedAt: 1700001500,
      commits: manyCommits,
    });

    const { tree } = aggregator.buildTree(files, stats);

    // Root folder node and src folder node should have commits capped to 100
    expect(tree.commitCount).toBe(150); // Exact count preserved
    expect(tree.commits?.length).toBe(100); // Array capped at 100
    // Capped commits are sorted newest first
    expect(tree.commits?.[0].hash).toBe('hash_149');

    const srcFolder = tree.children?.find((c) => c.name === 'src');
    expect(srcFolder?.commitCount).toBe(150);
    expect(srcFolder?.commits?.length).toBe(100);

    // Individual file node preserves its full commit array
    const heavyFile = srcFolder?.children?.find((c) => c.name === 'heavy.ts');
    expect(heavyFile?.commitCount).toBe(150);
    expect(heavyFile?.commits?.length).toBe(150);
  });

  it('caps folder biomarkers to 50 to prevent memory bloating in large projects', () => {
    const files: ParsedFileInfo[] = [
      {
        filePath: 'src/smelly1.ts',
        loc: 200,
        fileHash: 'h-s1',
        classes: [],
        methods: [],
        biomarkers: Array.from({ length: 35 }, (_, i) => ({
          type: 'nested_complexity',
          severity: 'medium',
          details: `smell 1.${i}`,
        })),
      },
      {
        filePath: 'src/smelly2.ts',
        loc: 200,
        fileHash: 'h-s2',
        classes: [],
        methods: [],
        biomarkers: Array.from({ length: 35 }, (_, i) => ({
          type: 'complex_conditional',
          severity: 'low',
          details: `smell 2.${i}`,
        })),
      },
    ];

    const stats = new Map<string, FileCommitStat>();
    const { tree } = aggregator.buildTree(files, stats);

    const srcFolder = tree.children?.find((c) => c.name === 'src');
    expect(srcFolder?.biomarkers?.length).toBe(50); // Capped from 70 to 50
    expect(tree.biomarkers?.length).toBe(50);
  });
});

