import path from 'path';
import type {
  ContributorStat,
  FileCommitStat,
  KnowledgeAuthorStat,
  KnowledgeRiskItem,
  KnowledgeRiskLevel,
  KnowledgeSummary,
  ParsedFileInfo,
} from './types';

export class KnowledgeAnalyzer {
  /**
   * Assesses knowledge ownership and monopoly risk for an individual node or file.
   */
  public assessNodeKnowledge(
    contributors: ContributorStat[] | undefined,
    commitCount: number,
    loc: number,
    churnScore: number
  ): {
    primaryAuthor?: string;
    primaryAuthorPercentage?: number;
    knowledgeRisk: KnowledgeRiskLevel;
  } {
    if (!contributors || contributors.length === 0 || commitCount === 0) {
      return { knowledgeRisk: 'low' };
    }

    const primary = contributors[0];
    const percentage =
      primary.percentage ??
      (commitCount > 0 ? Number(((primary.commits / commitCount) * 100).toFixed(1)) : 100);

    let knowledgeRisk: KnowledgeRiskLevel = 'low';

    // A single developer owning >= 75% indicates a knowledge monopoly
    if (percentage >= 75 && commitCount >= 2) {
      if (churnScore >= 0.25 || loc >= 150 || contributors.length === 1) {
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

  /**
   * Computes project-wide knowledge distribution, truck factor, and high-risk monopoly hotspots.
   */
  public computeProjectSummary(
    files: ParsedFileInfo[],
    commitStats: Map<string, FileCommitStat>,
    maxCommits: number
  ): KnowledgeSummary {
    const authorMap = new Map<
      string,
      {
        name: string;
        fileCount: number;
        linesAdded: number;
        linesDeleted: number;
        totalCommits: number;
        monopolyFileCount: number;
      }
    >();

    let totalTrackedFiles = 0;
    let monopolyFileCount = 0;
    const riskCandidates: { item: KnowledgeRiskItem; score: number }[] = [];

    for (const file of files) {
      const stats = commitStats.get(file.filePath);
      const commitCount = stats?.commitCount ?? 0;
      if (commitCount === 0) continue;

      totalTrackedFiles++;
      const contributors = stats?.contributors ?? [];
      const churnScore = maxCommits > 0 ? commitCount / maxCommits : 0;
      const knowledge = this.assessNodeKnowledge(
        contributors,
        commitCount,
        file.loc,
        churnScore
      );

      const primaryName = knowledge.primaryAuthor || 'Unknown';
      const ownership = knowledge.primaryAuthorPercentage ?? 100;

      // Accumulate author stats
      let authorEntry = authorMap.get(primaryName);
      if (!authorEntry) {
        authorEntry = {
          name: primaryName,
          fileCount: 0,
          linesAdded: 0,
          linesDeleted: 0,
          totalCommits: 0,
          monopolyFileCount: 0,
        };
        authorMap.set(primaryName, authorEntry);
      }

      authorEntry.fileCount++;
      authorEntry.linesAdded += stats?.linesAdded ?? 0;
      authorEntry.linesDeleted += stats?.linesDeleted ?? 0;
      authorEntry.totalCommits += commitCount;

      const isMonopoly = ownership >= 75;
      if (isMonopoly) {
        monopolyFileCount++;
        authorEntry.monopolyFileCount++;
      }

      // Calculate risk score for ranking hotspots
      // Higher churn + high LOC + concentrated ownership = dangerous bottleneck
      const riskScore =
        churnScore * 0.4 +
        (ownership / 100) * 0.4 +
        (Math.min(file.loc, 1500) / 1500) * 0.2;

      riskCandidates.push({
        item: {
          filePath: file.filePath,
          name: path.basename(file.filePath),
          loc: file.loc,
          commitCount,
          primaryAuthor: primaryName,
          ownershipPercentage: Number(ownership.toFixed(1)),
          churnScore,
          riskLevel: knowledge.knowledgeRisk,
        },
        score: riskScore,
      });
    }

    const topAuthors: KnowledgeAuthorStat[] = Array.from(authorMap.values())
      .map((a) => ({
        ...a,
        percentageOfCodebase:
          totalTrackedFiles > 0
            ? Number(((a.fileCount / totalTrackedFiles) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.fileCount - a.fileCount || b.totalCommits - a.totalCommits);

    // Truck Factor calculation:
    // Minimum number of developers whose combined owned files exceed 50% of tracked files
    let accumulatedFiles = 0;
    let truckFactor = 0;
    const targetMajority = totalTrackedFiles * 0.5;

    for (const author of topAuthors) {
      accumulatedFiles += author.fileCount;
      truckFactor++;
      if (accumulatedFiles >= targetMajority) {
        break;
      }
    }

    if (totalTrackedFiles === 0 || topAuthors.length === 0) {
      truckFactor = 0;
    }

    // Top 20 highest risk monopoly files
    const highestRiskFiles: KnowledgeRiskItem[] = riskCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((c) => c.item);

    const monopolyPercentage =
      totalTrackedFiles > 0
        ? Number(((monopolyFileCount / totalTrackedFiles) * 100).toFixed(1))
        : 0;

    return {
      totalAuthors: topAuthors.length,
      truckFactor,
      monopolyFileCount,
      monopolyPercentage,
      topAuthors,
      highestRiskFiles,
    };
  }
}
