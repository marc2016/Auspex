import type { TreeNode, CommitInfo, ContributorStat } from '../../../src/analyzer/types';
import { isBugfixCommit } from '../components/TreemapDetailsPanel';

export type TimeframeOption = 'all' | '1w' | '1m' | '6m' | '1y' | '2y';

/**
 * Calculates the cutoff timestamp (in milliseconds) for a given timeframe option.
 * If 'all', returns 0.
 */
export function getTimeframeCutoff(option: TimeframeOption, now = Date.now()): number {
  switch (option) {
    case '1w':
      return now - 7 * 24 * 60 * 60 * 1000;
    case '1m':
      return now - 30 * 24 * 60 * 60 * 1000;
    case '6m':
      return now - 182 * 24 * 60 * 60 * 1000;
    case '1y':
      return now - 365 * 24 * 60 * 60 * 1000;
    case '2y':
      return now - 730 * 24 * 60 * 60 * 1000;
    case 'all':
    default:
      return 0;
  }
}

function computeTimeframeKnowledge(
  contributors: ContributorStat[],
  commitCount: number,
  loc: number,
  fallbackNode: TreeNode
) {
  if (contributors.length > 0) {
    const primary = contributors[0];
    const percentage = primary.percentage ?? 100;
    let knowledgeRisk: 'high' | 'medium' | 'low' = 'low';
    if (percentage >= 75 && commitCount >= 2) {
      if (loc >= 150 || contributors.length === 1) {
        knowledgeRisk = 'high';
      } else {
        knowledgeRisk = 'medium';
      }
    } else if (percentage >= 50 || contributors.length <= 2) {
      knowledgeRisk = 'medium';
    } else {
      knowledgeRisk = 'low';
    }
    return {
      primaryAuthor: primary.name,
      primaryAuthorPercentage: percentage,
      knowledgeRisk,
    };
  }
  return {
    primaryAuthor: fallbackNode.primaryAuthor,
    primaryAuthorPercentage: fallbackNode.primaryAuthorPercentage,
    knowledgeRisk: fallbackNode.knowledgeRisk,
  };
}

/**
 * Recursively filters a TreeNode hierarchy by timeframe, recalculating
 * commitCount, fixCount, linesAdded, linesDeleted, defectRatio, lastModifiedAt,
 * contributors and normalized churnScore within the selected time period.
 */
export function filterTreeByTimeframe(
  root: TreeNode,
  timeframe: TimeframeOption,
  now = Date.now()
): TreeNode {
  if (timeframe === 'all') {
    return root;
  }

  const cutoff = getTimeframeCutoff(timeframe, now);
  if (cutoff <= 0) {
    return root;
  }

  function filterNode(node: TreeNode): TreeNode {
    const rawCommits = node.commits || [];
    const filteredCommits = rawCommits.filter((c) => c.timestamp >= cutoff);

    if (node.children && node.children.length > 0) {
      const filteredChildren = node.children.map(filterNode);

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
        const mergedCommits = Array.from(commitMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        // Aggregate contributors
        const contribMap = new Map<string, { commits: number; linesAdded: number; linesDeleted: number }>();
        for (const c of mergedCommits) {
          const existing = contribMap.get(c.author) || { commits: 0, linesAdded: 0, linesDeleted: 0 };
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
            percentage: totalCommits > 0 ? Number(((c.commits / totalCommits) * 100).toFixed(1)) : 0,
          }))
          .sort((a, b) => b.commits - a.commits);

        const knowledge = computeTimeframeKnowledge(contributors, totalCommits, node.loc, node);

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
          primaryAuthor: knowledge.primaryAuthor,
          primaryAuthorPercentage: knowledge.primaryAuthorPercentage,
          knowledgeRisk: knowledge.knowledgeRisk,
        };
      }

      // File with classes/methods children
      const commitCount = filteredCommits.length;
      const fixCount = filteredCommits.filter(isBugfixCommit).length;
      const linesAdded = filteredCommits.reduce((sum, c) => sum + (c.linesAdded || 0), 0);
      const linesDeleted = filteredCommits.reduce((sum, c) => sum + (c.linesDeleted || 0), 0);
      const lastModifiedAt =
        filteredCommits.length > 0 ? Math.max(...filteredCommits.map((c) => c.timestamp)) : undefined;
      const defectRatio = commitCount > 0 ? fixCount / commitCount : 0;

      const contribMap = new Map<string, { commits: number; linesAdded: number; linesDeleted: number }>();
      for (const c of filteredCommits) {
        const existing = contribMap.get(c.author) || { commits: 0, linesAdded: 0, linesDeleted: 0 };
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

      const knowledge = computeTimeframeKnowledge(contributors, commitCount, node.loc, node);

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
        primaryAuthor: knowledge.primaryAuthor,
        primaryAuthorPercentage: knowledge.primaryAuthorPercentage,
        knowledgeRisk: knowledge.knowledgeRisk,
      };
    }

    // Leaf nodes (file without children, or class/method)
    const commitCount = filteredCommits.length;
    const fixCount = filteredCommits.filter(isBugfixCommit).length;
    const linesAdded = filteredCommits.reduce((sum, c) => sum + (c.linesAdded || 0), 0);
    const linesDeleted = filteredCommits.reduce((sum, c) => sum + (c.linesDeleted || 0), 0);
    const lastModifiedAt =
      filteredCommits.length > 0 ? Math.max(...filteredCommits.map((c) => c.timestamp)) : undefined;
    const defectRatio = commitCount > 0 ? fixCount / commitCount : 0;

    const contribMap = new Map<string, { commits: number; linesAdded: number; linesDeleted: number }>();
    for (const c of filteredCommits) {
      const existing = contribMap.get(c.author) || { commits: 0, linesAdded: 0, linesDeleted: 0 };
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

    const knowledge = computeTimeframeKnowledge(contributors, commitCount, node.loc, node);

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
      primaryAuthor: knowledge.primaryAuthor,
      primaryAuthorPercentage: knowledge.primaryAuthorPercentage,
      knowledgeRisk: knowledge.knowledgeRisk,
    };
  }

  const filteredTree = filterNode(root);

  // Re-normalize churn scores across the filtered tree so the heatmap scales properly
  let maxCommits = 1;
  function scanMax(n: TreeNode) {
    if (n.type === 'file' && n.commitCount > maxCommits) {
      maxCommits = n.commitCount;
    }
    n.children?.forEach(scanMax);
  }
  scanMax(filteredTree);

  function normalizeChurn(n: TreeNode) {
    n.churnScore = maxCommits > 0 ? Math.min(n.commitCount / maxCommits, 1) : 0;
    n.children?.forEach(normalizeChurn);
  }
  normalizeChurn(filteredTree);

  return filteredTree;
}
