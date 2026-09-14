import path from 'path';
import fs from 'fs';
import { simpleGit } from 'simple-git';
import type {
  AnalysisSnapshot,
  TreeNode,
  HotspotItem,
  CommitInfo,
  ContributorStat,
  AuspexScope,
  TimeframePreset,
  FileCommitStat,
  ProjectCouplingPair,
  CouplingGraphData,
  CouplingGraphNode,
  CouplingGraphLink,
  KnowledgeSummary,
  ParsedFileInfo,
} from './types';
import { isBugfixMessage } from './gitChurn';
import { TemporalCouplingAnalyzer } from './temporalCoupling';
import { KnowledgeAnalyzer } from './knowledgeAnalyzer';


export function getTimeframeBounds(
  preset?: TimeframePreset,
  startDateStr?: string,
  endDateStr?: string,
  now = Date.now()
): { startTime: number; endTime: number } {
  let startTime = 0;
  let endTime = now;

  if (startDateStr) {
    const parsedStart = Date.parse(`${startDateStr}T00:00:00`);
    if (!isNaN(parsedStart)) {
      startTime = parsedStart;
    }
  }

  if (endDateStr) {
    const parsedEnd = Date.parse(`${endDateStr}T23:59:59.999`);
    if (!isNaN(parsedEnd)) {
      endTime = parsedEnd;
    }
  }

  if (preset && preset !== 'custom') {
    switch (preset) {
      case '7d':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case '14d':
        startTime = now - 14 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case '90d':
        startTime = now - 90 * 24 * 60 * 60 * 1000;
        break;
      case '180d':
        startTime = now - 180 * 24 * 60 * 60 * 1000;
        break;
      case '1y':
        startTime = now - 365 * 24 * 60 * 60 * 1000;
        break;
    }
    endTime = now;
  }

  return { startTime, endTime };
}

export interface WorktreeFileChange {
  filePath: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  linesAdded: number;
  linesDeleted: number;
}

export async function getWorktreeChanges(workspacePath: string): Promise<WorktreeFileChange[]> {
  const changes: WorktreeFileChange[] = [];
  try {
    const git = simpleGit(workspacePath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return changes;

    const status = await git.status();

    // Map diff numstat against HEAD (staged + unstaged)
    const numstatMap = new Map<string, { added: number; deleted: number }>();
    try {
      const diffOutput = await git.diff(['HEAD', '--numstat']).catch(() => '');
      if (diffOutput) {
        for (const line of diffOutput.split('\n')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const added = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
            const deleted = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
            const filePath = parts.slice(2).join(' ').replace(/\\/g, '/');
            numstatMap.set(filePath, { added, deleted });
          }
        }
      }
    } catch {
      /* ignore diff failure */
    }

    // Also check cached/staged diff if HEAD wasn't available
    if (numstatMap.size === 0) {
      try {
        const diffUnstaged = await git.diff(['--numstat']).catch(() => '');
        const diffStaged = await git.diff(['--cached', '--numstat']).catch(() => '');
        for (const raw of [diffUnstaged, diffStaged]) {
          for (const line of raw.split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
              const added = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
              const deleted = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
              const filePath = parts.slice(2).join(' ').replace(/\\/g, '/');
              const prev = numstatMap.get(filePath) || { added: 0, deleted: 0 };
              numstatMap.set(filePath, {
                added: prev.added + added,
                deleted: prev.deleted + deleted,
              });
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    const seenPaths = new Set<string>();

    for (const f of status.files) {
      const normalizedPath = f.path.replace(/\\/g, '/');
      if (seenPaths.has(normalizedPath)) continue;
      seenPaths.add(normalizedPath);

      let changeStatus: WorktreeFileChange['status'] = 'modified';
      if (f.index === '?' && f.working_dir === '?') {
        changeStatus = 'untracked';
      } else if (f.index === 'A' || f.working_dir === 'A') {
        changeStatus = 'added';
      } else if (f.index === 'D' || f.working_dir === 'D') {
        changeStatus = 'deleted';
      }

      let numstat = numstatMap.get(normalizedPath);
      let linesAdded = numstat?.added ?? 0;
      let linesDeleted = numstat?.deleted ?? 0;

      if (changeStatus === 'untracked' && linesAdded === 0) {
        try {
          const abs = path.join(workspacePath, normalizedPath);
          if (fs.existsSync(abs)) {
            const content = fs.readFileSync(abs, 'utf-8');
            linesAdded = content.split('\n').length;
          }
        } catch {
          /* ignore */
        }
      }

      changes.push({
        filePath: normalizedPath,
        status: changeStatus,
        linesAdded,
        linesDeleted,
      });
    }
  } catch (err) {
    console.warn('[Auspex] Error getting worktree changes:', err);
  }

  return changes;
}

/**
 * Clones a tree node deeply so mutations do not affect the base snapshot.
 */
function cloneTreeNode(node: TreeNode): TreeNode {
  return {
    ...node,
    children: node.children ? node.children.map(cloneTreeNode) : undefined,
    contributors: node.contributors ? [...node.contributors] : undefined,
    commits: node.commits ? [...node.commits] : undefined,
    biomarkers: node.biomarkers ? [...node.biomarkers] : undefined,
  };
}

/**
 * Recursively filters TreeNode to only retain paths in the allowed set.
 */
function pruneTreeToFiles(node: TreeNode, allowedFiles: Set<string>): TreeNode | null {
  if (node.type === 'file') {
    const clean = node.path.replace(/^\//, '');
    return allowedFiles.has(clean) ? cloneTreeNode(node) : null;
  }

  if (node.children && node.children.length > 0) {
    const filteredChildren = node.children
      .map((child) => pruneTreeToFiles(child, allowedFiles))
      .filter((c): c is TreeNode => c !== null);

    if (filteredChildren.length === 0) {
      return null;
    }

    const cloned = cloneTreeNode(node);
    cloned.children = filteredChildren;
    return cloned;
  }

  return null;
}

/**
 * Recursively recalculates folder aggregations (LOC, linesAdded, linesDeleted, weighted codeHealth).
 */
function aggregateTreeMetrics(node: TreeNode): void {
  if (!node.children || node.children.length === 0) {
    node.value = node.loc;
    return;
  }

  let totalLoc = 0;
  let totalCommits = 0;
  let totalFixes = 0;
  let totalAdded = 0;
  let totalDeleted = 0;
  let latestTimestamp = 0;
  let weightedHealthSum = 0;
  let healthWeightTotal = 0;

  for (const child of node.children) {
    aggregateTreeMetrics(child);
    totalLoc += child.loc;
    totalCommits += child.commitCount;
    totalFixes += child.fixCount || 0;
    totalAdded += child.linesAdded || 0;
    totalDeleted += child.linesDeleted || 0;
    if (child.lastModifiedAt && child.lastModifiedAt > latestTimestamp) {
      latestTimestamp = child.lastModifiedAt;
    }

    if (typeof child.codeHealth === 'number') {
      const weight = Math.max(child.loc, 1);
      weightedHealthSum += child.codeHealth * weight;
      healthWeightTotal += weight;
    }
  }

  node.loc = totalLoc;
  node.value = totalLoc;
  node.commitCount = totalCommits;
  node.fixCount = totalFixes;
  node.linesAdded = totalAdded;
  node.linesDeleted = totalDeleted;
  node.defectRatio = totalCommits > 0 ? totalFixes / totalCommits : 0;
  if (latestTimestamp > 0) {
    node.lastModifiedAt = latestTimestamp;
  }

  if (healthWeightTotal > 0) {
    node.codeHealth = Number((weightedHealthSum / healthWeightTotal).toFixed(2));
  } else {
    node.codeHealth = 10.0;
  }
}

/**
 * Filters the snapshot by scope:
 * - 'all': returns base snapshot
 * - 'worktree': returns snapshot containing only uncommitted files with their worktree churn
 * - 'timeframe': returns snapshot with commits and metrics filtered to the given range
 */
export async function filterSnapshotByScope(
  baseSnapshot: AnalysisSnapshot,
  scope: AuspexScope,
  workspacePath: string
): Promise<AnalysisSnapshot> {
  if (scope.mode === 'all') {
    return {
      ...baseSnapshot,
      scope: { mode: 'all' },
      scopeSummary: undefined,
    };
  }

  if (scope.mode === 'worktree') {
    const changes = await getWorktreeChanges(workspacePath);
    const changedPaths = new Set(changes.map((c) => c.filePath.replace(/^\//, '')));
    const changeMap = new Map<string, WorktreeFileChange>();
    for (const c of changes) {
      changeMap.set(c.filePath.replace(/^\//, ''), c);
    }

    if (changedPaths.size === 0) {
      // Empty worktree
      const emptyTree: TreeNode = {
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
        codeHealth: 10.0,
        children: [],
      };

      return {
        ...baseSnapshot,
        totalFiles: 0,
        totalLoc: 0,
        tree: emptyTree,
        hotspots: [],
        projectCouplings: [],
        couplingGraph: { nodes: [], links: [] },
        scope: { mode: 'worktree' },
        scopeSummary: '0 worktree changes',
      };
    }

    // Prune base tree to only changed files
    const pruned = pruneTreeToFiles(baseSnapshot.tree, changedPaths);
    const tree: TreeNode = pruned || {
      name: 'root',
      path: '/',
      type: 'folder',
      value: 0,
      loc: 0,
      commitCount: 0,
      churnScore: 0,
      fixCount: 0,
      children: [],
    };

    // Update leaf files with worktree diff lines
    let maxWorktreeChurn = 1;
    function updateWorktreeFiles(n: TreeNode) {
      if (n.type === 'file') {
        const clean = n.path.replace(/^\//, '');
        const c = changeMap.get(clean);
        if (c) {
          n.linesAdded = c.linesAdded;
          n.linesDeleted = c.linesDeleted;
          const churn = c.linesAdded + c.linesDeleted;
          if (churn > maxWorktreeChurn) {
            maxWorktreeChurn = churn;
          }
          // In worktree view, commitCount reflects active uncommitted changes
          n.commitCount = churn > 0 ? 1 : 0;
        }
      }
      n.children?.forEach(updateWorktreeFiles);
    }
    updateWorktreeFiles(tree);

    function normalizeWorktreeChurn(n: TreeNode) {
      if (n.type === 'file') {
        const churn = (n.linesAdded || 0) + (n.linesDeleted || 0);
        n.churnScore = maxWorktreeChurn > 0 ? Math.min(churn / maxWorktreeChurn, 1) : 0;
      }
      n.children?.forEach(normalizeWorktreeChurn);
    }
    normalizeWorktreeChurn(tree);

    aggregateTreeMetrics(tree);

    // Build worktree hotspots
    const hotspots: HotspotItem[] = [];
    function collectHotspots(n: TreeNode) {
      if (n.type === 'file') {
        const churn = (n.linesAdded || 0) + (n.linesDeleted || 0);
        hotspots.push({
          filePath: n.path.replace(/^\//, ''),
          name: n.name,
          loc: n.loc,
          commitCount: n.commitCount,
          fixCount: n.fixCount || 0,
          churnScore: n.churnScore,
          defectRatio: n.defectRatio || 0,
          codeHealth: n.codeHealth,
        });
      }
      n.children?.forEach(collectHotspots);
    }
    collectHotspots(tree);

    // Sort hotspots by churn and low code health
    hotspots.sort((a, b) => {
      const healthA = a.codeHealth ?? 10;
      const healthB = b.codeHealth ?? 10;
      // High churn + low health first
      const scoreA = a.churnScore * 2 + (10 - healthA) / 10;
      const scoreB = b.churnScore * 2 + (10 - healthB) / 10;
      return scoreB - scoreA;
    });

    const totalAdded = changes.reduce((sum, c) => sum + c.linesAdded, 0);
    const totalDeleted = changes.reduce((sum, c) => sum + c.linesDeleted, 0);
    const summaryStr = `${changedPaths.size} files (+${totalAdded} / -${totalDeleted})`;

    return {
      ...baseSnapshot,
      totalFiles: changedPaths.size,
      totalLoc: tree.loc,
      tree,
      hotspots,
      projectCouplings: [],
      couplingGraph: { nodes: [], links: [] },
      scope: { mode: 'worktree' },
      scopeSummary: summaryStr,
    };
  }

  if (scope.mode === 'timeframe') {
    const { startTime, endTime } = getTimeframeBounds(
      scope.timeframePreset,
      scope.startDate,
      scope.endDate
    );

    function filterNodeByTime(node: TreeNode): TreeNode {
      const rawCommits = node.commits || [];
      const filteredCommits = rawCommits.filter(
        (c) => c.timestamp >= startTime && c.timestamp <= endTime
      );

      if (node.children && node.children.length > 0) {
        const filteredChildren = node.children.map(filterNodeByTime);

        if (node.type === 'folder' || node.type === 'namespace') {
          const totalCommits = filteredChildren.reduce((sum, c) => sum + c.commitCount, 0);
          const totalFixes = filteredChildren.reduce((sum, c) => sum + (c.fixCount || 0), 0);
          const totalFeats = filteredChildren.reduce((sum, c) => sum + (c.featCount || 0), 0);
          const totalRefactors = filteredChildren.reduce((sum, c) => sum + (c.refactorCount || 0), 0);
          const totalAdded = filteredChildren.reduce((sum, c) => sum + (c.linesAdded || 0), 0);
          const totalDeleted = filteredChildren.reduce((sum, c) => sum + (c.linesDeleted || 0), 0);
          const latestTimestamp = Math.max(0, ...filteredChildren.map((c) => c.lastModifiedAt || 0));

          // Aggregate unique commits
          const commitMap = new Map<string, CommitInfo>();
          for (const child of filteredChildren) {
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
          const mergedCommits = Array.from(commitMap.values()).sort(
            (a, b) => b.timestamp - a.timestamp
          );

          // Aggregate contributors
          const contribMap = new Map<
            string,
            { commits: number; linesAdded: number; linesDeleted: number }
          >();
          for (const c of mergedCommits) {
            const existing = contribMap.get(c.author) || {
              commits: 0,
              linesAdded: 0,
              linesDeleted: 0,
            };
            existing.commits += 1;
            existing.linesAdded += c.linesAdded || 0;
            existing.linesDeleted += c.linesDeleted || 0;
            contribMap.set(c.author, existing);
          }
          const contributors: ContributorStat[] = Array.from(contribMap.entries())
            .map(([name, c]) => ({
              name,
              commits: c.commits,
              linesAdded: c.linesAdded,
              linesDeleted: c.linesDeleted,
              percentage:
                totalCommits > 0 ? Number(((c.commits / totalCommits) * 100).toFixed(1)) : 0,
            }))
            .sort((a, b) => b.commits - a.commits);

          return {
            ...node,
            commitCount: totalCommits,
            fixCount: totalFixes,
            featCount: totalFeats,
            refactorCount: totalRefactors,
            linesAdded: totalAdded,
            linesDeleted: totalDeleted,
            defectRatio: totalCommits > 0 ? totalFixes / totalCommits : 0,
            lastModifiedAt: latestTimestamp > 0 ? latestTimestamp : undefined,
            contributors,
            commits: mergedCommits,
            children: filteredChildren,
          };
        }

        // File with classes/methods
        const commitCount = filteredCommits.length;
        const fixCount = filteredCommits.filter((c) => c.isFix || isBugfixMessage(c.message)).length;
        const linesAdded = filteredCommits.reduce((sum, c) => sum + (c.linesAdded || 0), 0);
        const linesDeleted = filteredCommits.reduce((sum, c) => sum + (c.linesDeleted || 0), 0);
        const lastModifiedAt =
          filteredCommits.length > 0 ? Math.max(...filteredCommits.map((c) => c.timestamp)) : undefined;
        const defectRatio = commitCount > 0 ? fixCount / commitCount : 0;

        const contribMap = new Map<
          string,
          { commits: number; linesAdded: number; linesDeleted: number }
        >();
        for (const c of filteredCommits) {
          const existing = contribMap.get(c.author) || {
            commits: 0,
            linesAdded: 0,
            linesDeleted: 0,
          };
          existing.commits += 1;
          existing.linesAdded += c.linesAdded || 0;
          existing.linesDeleted += c.linesDeleted || 0;
          contribMap.set(c.author, existing);
        }
        const contributors: ContributorStat[] = Array.from(contribMap.entries())
          .map(([name, c]) => ({
            name,
            commits: c.commits,
            linesAdded: c.linesAdded,
            linesDeleted: c.linesDeleted,
            percentage: commitCount > 0 ? Number(((c.commits / commitCount) * 100).toFixed(1)) : 0,
          }))
          .sort((a, b) => b.commits - a.commits);

        return {
          ...node,
          commitCount,
          fixCount,
          linesAdded,
          linesDeleted,
          defectRatio,
          lastModifiedAt,
          contributors,
          commits: filteredCommits,
          children: filteredChildren,
        };
      }

      // Leaf node
      const commitCount = filteredCommits.length;
      const fixCount = filteredCommits.filter((c) => c.isFix || isBugfixMessage(c.message)).length;
      const linesAdded = filteredCommits.reduce((sum, c) => sum + (c.linesAdded || 0), 0);
      const linesDeleted = filteredCommits.reduce((sum, c) => sum + (c.linesDeleted || 0), 0);
      const lastModifiedAt =
        filteredCommits.length > 0 ? Math.max(...filteredCommits.map((c) => c.timestamp)) : undefined;
      const defectRatio = commitCount > 0 ? fixCount / commitCount : 0;

      const contribMap = new Map<
        string,
        { commits: number; linesAdded: number; linesDeleted: number }
      >();
      for (const c of filteredCommits) {
        const existing = contribMap.get(c.author) || {
          commits: 0,
          linesAdded: 0,
          linesDeleted: 0,
        };
        existing.commits += 1;
        existing.linesAdded += c.linesAdded || 0;
        existing.linesDeleted += c.linesDeleted || 0;
        contribMap.set(c.author, existing);
      }
      const contributors: ContributorStat[] = Array.from(contribMap.entries())
        .map(([name, c]) => ({
          name,
          commits: c.commits,
          linesAdded: c.linesAdded,
          linesDeleted: c.linesDeleted,
          percentage: commitCount > 0 ? Number(((c.commits / commitCount) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.commits - a.commits);

      return {
        ...node,
        commitCount,
        fixCount,
        linesAdded,
        linesDeleted,
        defectRatio,
        lastModifiedAt,
        contributors,
        commits: filteredCommits,
      };
    }

    const filteredTree = filterNodeByTime(baseSnapshot.tree);

    // Re-normalize churn scores across the filtered tree
    let maxCommits = 1;
    function scanMax(n: TreeNode) {
      if (n.type === 'file' && n.commitCount > maxCommits) {
        maxCommits = n.commitCount;
      }
      n.children?.forEach(scanMax);
    }
    scanMax(filteredTree);

    function normalizeChurn(n: TreeNode) {
      if (n.type === 'file') {
        n.churnScore = maxCommits > 0 ? Math.min(n.commitCount / maxCommits, 1) : 0;
      }
      n.children?.forEach(normalizeChurn);
    }
    normalizeChurn(filteredTree);

    // Collect file nodes and reconstruct commit co-occurrences for temporal coupling & knowledge
    const commitFilesMap = new Map<string, string[]>();
    const fileNodeMap = new Map<string, TreeNode>();

    function gatherFileNodes(n: TreeNode) {
      if (n.type === 'file') {
        const clean = n.path.replace(/^\//, '');
        fileNodeMap.set(clean, n);
        if (n.commits) {
          for (const c of n.commits) {
            let list = commitFilesMap.get(c.hash);
            if (!list) {
              list = [];
              commitFilesMap.set(c.hash, list);
            }
            list.push(clean);
          }
        }
      }
      n.children?.forEach(gatherFileNodes);
    }
    gatherFileNodes(filteredTree);

    // Recompute hotspots for this timeframe
    const hotspots: HotspotItem[] = [];
    for (const [filePath, n] of fileNodeMap.entries()) {
      if (n.commitCount > 0) {
        hotspots.push({
          filePath,
          name: n.name,
          loc: n.loc,
          commitCount: n.commitCount,
          fixCount: n.fixCount || 0,
          churnScore: n.churnScore,
          defectRatio: n.defectRatio || 0,
          codeHealth: n.codeHealth,
        });
      }
    }
    hotspots.sort((a, b) => {
      const scoreA = a.churnScore * 0.7 + Math.min(a.loc / 1000, 1) * 0.3;
      const scoreB = b.churnScore * 0.7 + Math.min(b.loc / 1000, 1) * 0.3;
      return scoreB - scoreA;
    });

    // Run Temporal Coupling Analysis for this timeframe
    const couplingAnalyzer = new TemporalCouplingAnalyzer();
    for (const files of commitFilesMap.values()) {
      couplingAnalyzer.recordCommitFiles(files);
    }

    const statsMap = new Map<string, FileCommitStat>();
    for (const [filePath, fileNode] of fileNodeMap.entries()) {
      statsMap.set(filePath, {
        commitCount: fileNode.commitCount,
        fixCount: fileNode.fixCount || 0,
        featCount: fileNode.featCount || 0,
        refactorCount: fileNode.refactorCount || 0,
        linesAdded: fileNode.linesAdded || 0,
        linesDeleted: fileNode.linesDeleted || 0,
        lastModifiedAt: fileNode.lastModifiedAt || 0,
        contributors: fileNode.contributors,
        commits: fileNode.commits,
      });
    }

    const { fileCouplings, projectCouplings } = couplingAnalyzer.finalize(statsMap);

    // Attach temporal coupling to individual file nodes
    for (const [filePath, couplings] of fileCouplings.entries()) {
      const n = fileNodeMap.get(filePath);
      if (n) {
        n.temporalCoupling = couplings;
      }
    }

    // Build couplingGraph for D3 visualization
    let couplingGraph: CouplingGraphData | undefined;
    if (projectCouplings.length > 0) {
      const nodeSet = new Set<string>();
      const links: CouplingGraphLink[] = projectCouplings.map((p) => {
        nodeSet.add(p.fileA);
        nodeSet.add(p.fileB);
        return {
          source: p.fileA,
          target: p.fileB,
          coChanges: p.coChanges,
          degree: Math.max(p.degreeA, p.degreeB),
        };
      });

      const nodes: CouplingGraphNode[] = Array.from(nodeSet).map((filePath) => {
        const stat = statsMap.get(filePath);
        const fileNode = fileNodeMap.get(filePath);
        return {
          id: filePath,
          name: path.basename(filePath),
          loc: fileNode?.loc ?? 0,
          commitCount: stat?.commitCount ?? 0,
          codeHealth: fileNode?.codeHealth ?? 10.0,
          churnScore: maxCommits > 0 ? Math.min(1, (stat?.commitCount ?? 0) / maxCommits) : 0,
        };
      });

      couplingGraph = { nodes, links };
    }

    // Build Knowledge Summary and update author risk for this timeframe
    const knowledgeAnalyzer = new KnowledgeAnalyzer();
    const parsedFiles: ParsedFileInfo[] = Array.from(fileNodeMap.entries()).map(([filePath, n]) => ({
      filePath,
      loc: n.loc,
      fileHash: '',
      classes: [],
      methods: [],
      codeHealth: n.codeHealth,
    }));

    const knowledgeSummary = knowledgeAnalyzer.computeProjectSummary(
      parsedFiles,
      statsMap,
      maxCommits
    );

    for (const n of fileNodeMap.values()) {
      const k = knowledgeAnalyzer.assessNodeKnowledge(
        n.contributors,
        n.commitCount,
        n.loc,
        n.churnScore
      );
      n.primaryAuthor = k.primaryAuthor;
      n.primaryAuthorPercentage = k.primaryAuthorPercentage;
      n.knowledgeRisk = k.knowledgeRisk;
    }

    const totalCommitsInScope = filteredTree.commitCount || 0;
    const summaryStr = `${totalCommitsInScope} commits`;

    return {
      ...baseSnapshot,
      tree: filteredTree,
      hotspots,
      projectCouplings,
      couplingGraph,
      knowledgeSummary,
      scope: { ...scope },
      scopeSummary: summaryStr,
    };
  }

  return baseSnapshot;
}
