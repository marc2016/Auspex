import path from 'path';
import type { PipelineContext, PipelineStage, ParsedFileInfo } from '../types';
import type { TreeNode } from '@auspex/shared';
import { getDb } from '../../services/db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Stage 04: Tree Aggregator
 *
 * Builds the final 4-level hierarchical JSON tree:
 *   Folder -> Namespace/Package -> File (with commit count) -> Method (with LOC)
 *
 * Also normalizes churn scores (0.0–1.0) across all nodes,
 * then persists the result as a new scan_snapshot in SQLite.
 */
export class TreeAggregatorStage implements PipelineStage {
  readonly name = 'aggregating';

  async execute(ctx: PipelineContext): Promise<void> {
    ctx.reportProgress('aggregating', 'Building hierarchical tree…', 72);

    const parsedFiles = (ctx as unknown as Record<string, unknown>)[
      'parsedFiles'
    ] as ParsedFileInfo[];

    if (!parsedFiles || parsedFiles.length === 0) {
      throw new Error('No parsed files available for tree aggregation.');
    }

    // Build folder/namespace/file/method tree
    const root = this.buildTree(parsedFiles, ctx);

    // Normalize churn scores across the entire tree
    const maxCommits = this.getMaxCommitCount(parsedFiles, ctx);
    this.normalizeChurn(root, maxCommits);

    // Calculate totals
    ctx.totalLoc = parsedFiles.reduce((sum, f) => sum + f.loc, 0);
    ctx.tree = root;

    ctx.reportProgress('saving', 'Persisting snapshot to database…', 90);
    this.persistSnapshot(ctx, root);

    ctx.reportProgress('saving', 'Snapshot saved.', 98);
  }

  private buildTree(files: ParsedFileInfo[], ctx: PipelineContext): TreeNode {
    const root: TreeNode = {
      name: 'root',
      path: '/',
      type: 'folder',
      value: 0,
      loc: 0,
      commitCount: 0,
      churnScore: 0,
      children: [],
    };

    const folderMap = new Map<string, TreeNode>();
    folderMap.set('/', root);

    const getOrCreateFolder = (dirPath: string): TreeNode => {
      const normalized = dirPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalized || normalized === '.') {
        return root;
      }
      if (folderMap.has(normalized)) {
        return folderMap.get(normalized)!;
      }
      const parts = normalized.split('/');
      let current = root;
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (folderMap.has(currentPath)) {
          current = folderMap.get(currentPath)!;
        } else {
          let folderNode = current.children?.find((c) => c.type === 'folder' && c.name === part);
          if (!folderNode) {
            folderNode = {
              name: part,
              path: `/${currentPath}`,
              type: 'folder',
              value: 0,
              loc: 0,
              commitCount: 0,
              churnScore: 0,
              children: [],
            };
            if (!current.children) {
              current.children = [];
            }
            current.children.push(folderNode);
          }
          folderMap.set(currentPath, folderNode);
          current = folderNode;
        }
      }
      return current;
    };

    for (const file of files) {
      const dirName = path.dirname(file.filePath);
      const parentFolder = getOrCreateFolder(dirName);
      const commitCount = ctx.commitCounts.get(file.filePath) ?? 0;

      let targetParent = parentFolder;

      // Handle namespace if present
      if (file.namespace) {
        if (!targetParent.children) {
          targetParent.children = [];
        }
        let nsNode = targetParent.children.find(
          (c) => c.type === 'namespace' && c.name === file.namespace
        );
        if (!nsNode) {
          nsNode = {
            name: file.namespace,
            path: `${targetParent.path}/${file.namespace}`,
            type: 'namespace',
            value: 0,
            loc: 0,
            commitCount: 0,
            churnScore: 0,
            children: [],
          };
          targetParent.children.push(nsNode);
        }
        targetParent = nsNode;
      }

      const methodNodes: TreeNode[] = file.methods.map((m) => ({
        name: m.name,
        path: `${file.filePath}#${m.name}`,
        type: 'method' as const,
        value: m.loc,
        loc: m.loc,
        commitCount,
        churnScore: 0,
        startLine: m.startLine,
        endLine: m.endLine,
      }));

      const fileNode: TreeNode = {
        name: path.basename(file.filePath),
        path: file.filePath,
        type: 'file',
        value: file.loc,
        loc: file.loc,
        commitCount,
        churnScore: 0,
        children: methodNodes.length > 0 ? methodNodes : undefined,
      };

      if (!targetParent.children) {
        targetParent.children = [];
      }
      targetParent.children.push(fileNode);
    }

    this.aggregateLoc(root);
    return root;
  }

  private aggregateLoc(node: TreeNode): number {
    if (!node.children || node.children.length === 0) {
      node.value = node.loc;
      return node.loc;
    }
    let total = 0;
    let totalCommits = 0;
    for (const child of node.children) {
      total += this.aggregateLoc(child);
      totalCommits += child.commitCount;
    }
    node.loc = total;
    node.value = total;
    if (node.type === 'folder' || node.type === 'namespace') {
      node.commitCount = totalCommits;
    }
    return total;
  }

  private getMaxCommitCount(files: ParsedFileInfo[], ctx: PipelineContext): number {
    let max = 1;
    for (const file of files) {
      const count = ctx.commitCounts.get(file.filePath) ?? 0;
      if (count > max) max = count;
    }
    return max;
  }

  private normalizeChurn(node: TreeNode, maxCommits: number): void {
    node.churnScore = maxCommits > 0 ? Math.min(node.commitCount / maxCommits, 1) : 0;
    if (node.children) {
      for (const child of node.children) {
        this.normalizeChurn(child, maxCommits);
      }
    }
  }

  private persistSnapshot(ctx: PipelineContext, tree: TreeNode): void {
    const db = getDb();
    const id = uuidv4();
    const durationMs = Date.now();

    db.prepare(`
      INSERT INTO scan_snapshots
        (id, repo_id, head_commit_sha, is_incremental, total_files, total_loc, tree_data, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      ctx.repositoryId,
      ctx.headCommitSha,
      ctx.isIncremental ? 1 : 0,
      ctx.totalFiles,
      ctx.totalLoc,
      JSON.stringify(tree),
      durationMs,
    );

    // Update commit counts in file_cache
    const updateStmt = db.prepare(`
      UPDATE file_cache SET commit_count = ? WHERE repo_id = ? AND file_path = ?
    `);
    const updateMany = db.transaction((entries: [number, string, string][]) => {
      for (const [count, repoId, filePath] of entries) {
        updateStmt.run(count, repoId, filePath);
      }
    });
    const entries: [number, string, string][] = Array.from(ctx.commitCounts.entries()).map(
      ([filePath, count]) => [count, ctx.repositoryId, filePath]
    );
    updateMany(entries);
  }
}
