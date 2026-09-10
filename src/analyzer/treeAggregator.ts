import path from 'path';
import type {
  ParsedFileInfo,
  FileCommitStat,
  TreeNode,
  HotspotItem,
  CommitInfo,
  ContributorStat,
} from './types';

export class TreeAggregator {
  buildTree(
    files: ParsedFileInfo[],
    commitStats: Map<string, FileCommitStat>
  ): { tree: TreeNode; hotspots: HotspotItem[] } {
    const root: TreeNode = {
      name: 'root',
      path: '/',
      type: 'folder',
      value: 0,
      loc: 0,
      commitCount: 0,
      churnScore: 0,
      fixCount: 0,
      featCount: 0,
      refactorCount: 0,
      linesAdded: 0,
      linesDeleted: 0,
      defectRatio: 0,
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
              fixCount: 0,
              featCount: 0,
              refactorCount: 0,
              linesAdded: 0,
              linesDeleted: 0,
              defectRatio: 0,
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
      const fileStats = commitStats.get(file.filePath);

      const commitCount = fileStats?.commitCount ?? 0;
      const fixCount = fileStats?.fixCount ?? 0;
      const featCount = fileStats?.featCount ?? 0;
      const refactorCount = fileStats?.refactorCount ?? 0;
      const linesAdded = fileStats?.linesAdded ?? 0;
      const linesDeleted = fileStats?.linesDeleted ?? 0;
      const defectRatio = commitCount > 0 ? fixCount / commitCount : 0;
      const lastModifiedAt = fileStats?.lastModifiedAt ?? file.lastModifiedAt;

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
            fixCount: 0,
            featCount: 0,
            refactorCount: 0,
            linesAdded: 0,
            linesDeleted: 0,
            defectRatio: 0,
            children: [],
          };
          targetParent.children.push(nsNode);
        }
        targetParent = nsNode;
      }

      const fileContributors = fileStats?.contributors ?? [];
      const fileCommits = fileStats?.commits ?? [];

      // Build classes and methods under the file
      const fileChildren: TreeNode[] = [];
      const classMap = new Map<string, TreeNode>();

      if (file.classes && file.classes.length > 0) {
        for (const cls of file.classes) {
          const classNode: TreeNode = {
            name: cls.name,
            path: `${file.filePath}#${cls.name}`,
            type: 'class',
            value: cls.loc,
            loc: cls.loc,
            commitCount,
            churnScore: 0,
            fixCount,
            featCount,
            refactorCount,
            linesAdded,
            linesDeleted,
            defectRatio,
            lastModifiedAt,
            startLine: cls.startLine,
            endLine: cls.endLine,
            contributors: fileContributors,
            commits: fileCommits,
            children: [],
          };
          classMap.set(cls.name, classNode);
          fileChildren.push(classNode);
        }
      }

      for (const m of file.methods) {
        const methodNode: TreeNode = {
          name: m.name,
          path: `${file.filePath}#${m.name}`,
          type: 'method',
          value: m.loc,
          loc: m.loc,
          commitCount,
          churnScore: 0,
          fixCount,
          featCount,
          refactorCount,
          linesAdded,
          linesDeleted,
          defectRatio,
          lastModifiedAt,
          startLine: m.startLine,
          endLine: m.endLine,
          contributors: fileContributors,
          commits: fileCommits,
        };

        const enclosingClass = file.classes.find(
          (c) => m.startLine >= c.startLine && m.endLine <= c.endLine
        );

        if (enclosingClass && classMap.has(enclosingClass.name)) {
          const parentCls = classMap.get(enclosingClass.name)!;
          if (!parentCls.children) parentCls.children = [];
          parentCls.children.push(methodNode);
        } else {
          fileChildren.push(methodNode);
        }
      }

      const fileNode: TreeNode = {
        name: path.basename(file.filePath),
        path: file.filePath,
        type: 'file',
        value: file.loc,
        loc: file.loc,
        commitCount,
        churnScore: 0,
        fixCount,
        featCount,
        refactorCount,
        linesAdded,
        linesDeleted,
        defectRatio,
        lastModifiedAt,
        contributors: fileContributors,
        commits: fileCommits,
        children: fileChildren.length > 0 ? fileChildren : undefined,
      };

      if (!targetParent.children) {
        targetParent.children = [];
      }
      targetParent.children.push(fileNode);
    }

    this.aggregateLoc(root);

    let maxCommits = 1;
    for (const file of files) {
      const c = commitStats.get(file.filePath)?.commitCount ?? 0;
      if (c > maxCommits) maxCommits = c;
    }

    this.normalizeChurn(root, maxCommits);

    // Compute hotspot ranking (files with high churn and high loc)
    const hotspots = this.extractHotspots(files, commitStats, maxCommits);

    return { tree: root, hotspots };
  }

  private aggregateLoc(node: TreeNode): number {
    if (!node.children || node.children.length === 0) {
      node.value = node.loc;
      return node.loc;
    }

    let totalLoc = 0;
    let totalCommits = 0;
    let totalFixes = 0;
    let totalFeats = 0;
    let totalRefactors = 0;
    let totalAdded = 0;
    let totalDeleted = 0;
    let latestTimestamp = 0;

    const folderContribMap = new Map<
      string,
      { commits: number; linesAdded: number; linesDeleted: number }
    >();
    const commitMap = new Map<string, CommitInfo>();

    for (const child of node.children) {
      totalLoc += this.aggregateLoc(child);
      totalCommits += child.commitCount;
      totalFixes += child.fixCount ?? 0;
      totalFeats += child.featCount ?? 0;
      totalRefactors += child.refactorCount ?? 0;
      totalAdded += child.linesAdded ?? 0;
      totalDeleted += child.linesDeleted ?? 0;
      if (child.lastModifiedAt && child.lastModifiedAt > latestTimestamp) {
        latestTimestamp = child.lastModifiedAt;
      }

      if (child.contributors) {
        for (const c of child.contributors) {
          const existing = folderContribMap.get(c.name) || {
            commits: 0,
            linesAdded: 0,
            linesDeleted: 0,
          };
          existing.commits += c.commits;
          existing.linesAdded += c.linesAdded;
          existing.linesDeleted += c.linesDeleted;
          folderContribMap.set(c.name, existing);
        }
      }

      if (child.commits) {
        for (const c of child.commits) {
          const existing = commitMap.get(c.hash);
          if (existing) {
            existing.linesAdded += c.linesAdded;
            existing.linesDeleted += c.linesDeleted;
          } else {
            commitMap.set(c.hash, { ...c });
          }
        }
      }
    }

    if (node.type === 'folder' || node.type === 'namespace') {
      node.loc = totalLoc;
      node.value = totalLoc;
      node.commitCount = totalCommits;
      node.fixCount = totalFixes;
      node.featCount = totalFeats;
      node.refactorCount = totalRefactors;
      node.linesAdded = totalAdded;
      node.linesDeleted = totalDeleted;
      node.defectRatio = totalCommits > 0 ? totalFixes / totalCommits : 0;
      if (latestTimestamp > 0) node.lastModifiedAt = latestTimestamp;

      // Populate aggregated contributors for folder/namespace
      const contributors: ContributorStat[] = [];
      for (const [name, c] of folderContribMap.entries()) {
        const percentage =
          totalCommits > 0 ? Number(((c.commits / totalCommits) * 100).toFixed(1)) : 0;
        contributors.push({
          name,
          commits: c.commits,
          linesAdded: c.linesAdded,
          linesDeleted: c.linesDeleted,
          percentage,
        });
      }
      contributors.sort(
        (a, b) =>
          b.commits - a.commits || b.linesAdded + b.linesDeleted - (a.linesAdded + a.linesDeleted)
      );
      node.contributors = contributors;

      // Populate aggregated commits for folder/namespace
      const commits = Array.from(commitMap.values());
      commits.sort((a, b) => b.timestamp - a.timestamp);
      node.commits = commits;
    } else {
      node.value = node.loc;
    }

    return node.loc;
  }

  private normalizeChurn(node: TreeNode, maxCommits: number): void {
    node.churnScore = maxCommits > 0 ? Math.min(node.commitCount / maxCommits, 1) : 0;
    if (node.children) {
      for (const child of node.children) {
        this.normalizeChurn(child, maxCommits);
      }
    }
  }

  private extractHotspots(
    files: ParsedFileInfo[],
    commitStats: Map<string, FileCommitStat>,
    maxCommits: number
  ): HotspotItem[] {
    const list: HotspotItem[] = files.map((f) => {
      const stats = commitStats.get(f.filePath);
      const commitCount = stats?.commitCount ?? 0;
      const fixCount = stats?.fixCount ?? 0;
      const churnScore = maxCommits > 0 ? commitCount / maxCommits : 0;
      const defectRatio = commitCount > 0 ? fixCount / commitCount : 0;

      return {
        filePath: f.filePath,
        name: path.basename(f.filePath),
        loc: f.loc,
        commitCount,
        fixCount,
        churnScore,
        defectRatio,
      };
    });

    // Score hotspot by combination of churnScore and LOC
    return list
      .sort((a, b) => {
        const scoreA = a.churnScore * 0.7 + (Math.min(a.loc, 1000) / 1000) * 0.3;
        const scoreB = b.churnScore * 0.7 + (Math.min(b.loc, 1000) / 1000) * 0.3;
        return scoreB - scoreA;
      })
      .slice(0, 20);
  }
}
