import { describe, it, expect } from 'vitest';
import { TreeAggregator } from '../src/analyzer/treeAggregator';
import { AstStructureAnalyzer, isPathIgnored } from '../src/analyzer/astAnalyzer';
import { GitChurnAnalyzer } from '../src/analyzer/gitChurn';
import type { ParsedFileInfo, FileCommitStat } from '../src/analyzer/types';

describe('AstStructureAnalyzer path filtering', () => {
  it('correctly filters ignored paths', () => {
    const patterns = ['node_modules', 'dist', '*.log', '.git'];
    expect(isPathIgnored('node_modules', 'node_modules', patterns)).toBe(true);
    expect(isPathIgnored('index.js', 'node_modules/lodash/index.js', patterns)).toBe(true);
    expect(isPathIgnored('app.log', 'logs/app.log', patterns)).toBe(true);
    expect(isPathIgnored('app.ts', 'src/app.ts', patterns)).toBe(false);
  });
});

describe('GitChurnAnalyzer log parser', () => {
  it('parses semantic commit statistics and conventional commits', () => {
    const analyzer = new GitChurnAnalyzer();
    const statsMap = new Map<string, FileCommitStat>();

    const fakeLog = [
      'COMMIT:abc1234|1700000000|fix: resolve authentication leak',
      '15\t5\tsrc/auth/login.ts',
      'COMMIT:def5678|1700010000|feat: add treemap viewer',
      '120\t10\tsrc/ui/treemap.tsx',
      'COMMIT:ghi9012|1700020000|fix: crash on empty repository',
      '4\t2\tsrc/auth/login.ts',
    ].join('\n');

    analyzer.parseLogOutput(fakeLog, statsMap);

    const loginStats = statsMap.get('src/auth/login.ts');
    expect(loginStats).toBeDefined();
    expect(loginStats?.commitCount).toBe(2);
    expect(loginStats?.fixCount).toBe(2);
    expect(loginStats?.linesAdded).toBe(19);
    expect(loginStats?.linesDeleted).toBe(7);

    const treemapStats = statsMap.get('src/ui/treemap.tsx');
    expect(treemapStats).toBeDefined();
    expect(treemapStats?.commitCount).toBe(1);
    expect(treemapStats?.featCount).toBe(1);
    expect(treemapStats?.fixCount).toBe(0);
  });
});

describe('TreeAggregator hierarchy & metrics', () => {
  it('builds a 4-level tree and normalizes churn correctly', () => {
    const aggregator = new TreeAggregator();

    const files: ParsedFileInfo[] = [
      {
        filePath: 'src/services/api.ts',
        namespace: 'CoreService',
        loc: 100,
        fileHash: 'h1',
        classes: [
          {
            name: 'ApiClient',
            startLine: 10,
            endLine: 90,
            loc: 80,
            methods: [],
          },
        ],
        methods: [
          { name: 'fetchData()', startLine: 20, endLine: 50, loc: 30 },
        ],
      },
      {
        filePath: 'src/utils/calc.ts',
        loc: 40,
        fileHash: 'h2',
        classes: [],
        methods: [
          { name: 'sum()', startLine: 5, endLine: 15, loc: 10 },
        ],
      },
    ];

    const commitStats = new Map<string, FileCommitStat>();
    commitStats.set('src/services/api.ts', {
      commitCount: 10,
      fixCount: 4,
      featCount: 2,
      refactorCount: 1,
      linesAdded: 50,
      linesDeleted: 10,
      lastModifiedAt: 1700000000,
    });
    commitStats.set('src/utils/calc.ts', {
      commitCount: 2,
      fixCount: 0,
      featCount: 1,
      refactorCount: 0,
      linesAdded: 40,
      linesDeleted: 0,
      lastModifiedAt: 1699990000,
    });

    const { tree, hotspots } = aggregator.buildTree(files, commitStats);

    expect(tree).toBeDefined();
    expect(tree.type).toBe('folder');
    expect(tree.loc).toBe(140);

    // src folder
    const srcNode = tree.children?.find((c) => c.name === 'src');
    expect(srcNode).toBeDefined();

    // services folder
    const servicesNode = srcNode?.children?.find((c) => c.name === 'services');
    expect(servicesNode).toBeDefined();

    // namespace CoreService
    const nsNode = servicesNode?.children?.find((c) => c.name === 'CoreService');
    expect(nsNode).toBeDefined();
    expect(nsNode?.type).toBe('namespace');

    // api.ts file
    const fileNode = nsNode?.children?.find((c) => c.name === 'api.ts');
    expect(fileNode).toBeDefined();
    expect(fileNode?.type).toBe('file');
    expect(fileNode?.churnScore).toBe(1.0); // 10 / 10 = 1.0
    expect(fileNode?.defectRatio).toBe(0.4); // 4 fixes / 10 commits = 0.4

    // Hotspots list
    expect(hotspots.length).toBe(2);
    expect(hotspots[0].filePath).toBe('src/services/api.ts');
  });
});
