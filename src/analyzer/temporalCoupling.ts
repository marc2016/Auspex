import path from 'path';
import type {
  TemporalCoupling,
  ProjectCouplingPair,
  CouplingGraphData,
  CouplingGraphNode,
  CouplingGraphLink,
  FileCommitStat,
} from './types';

export interface TemporalCouplingConfig {
  maxCommitFiles?: number;       // Ignore mass commits with > N files (e.g. formatting)
  minCoChanges?: number;          // Minimum shared commits to consider coupling
  minCouplingDegree?: number;     // Minimum coupling percentage (0.0 to 1.0)
  maxPairsPerFile?: number;       // Top coupled files to store per file
  maxProjectPairs?: number;       // Top project pairs to store in snapshot
}

export class TemporalCouplingAnalyzer {
  private pairCoChanges = new Map<string, number>();
  private fileCommitsCount = new Map<string, number>();
  private readonly config: Required<TemporalCouplingConfig>;

  constructor(config?: TemporalCouplingConfig) {
    this.config = {
      maxCommitFiles: config?.maxCommitFiles ?? 50,
      minCoChanges: config?.minCoChanges ?? 2,
      minCouplingDegree: config?.minCouplingDegree ?? 0.2,
      maxPairsPerFile: config?.maxPairsPerFile ?? 15,
      maxProjectPairs: config?.maxProjectPairs ?? 30,
    };
  }

  /**
   * Records files modified in a single commit.
   */
  public recordCommitFiles(files: string[]): void {
    if (files.length === 0) return;

    // Fast deduplication & normalization
    let uniqueFiles: string[];
    if (files.length === 1) {
      const f = files[0].trim().replace(/\\/g, '/');
      if (!f) return;
      uniqueFiles = [f];
    } else {
      const seen = new Set<string>();
      uniqueFiles = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i].trim().replace(/\\/g, '/');
        if (f && !seen.has(f)) {
          seen.add(f);
          uniqueFiles.push(f);
        }
      }
    }

    if (uniqueFiles.length === 0) return;

    // Track commit count per file
    for (let i = 0; i < uniqueFiles.length; i++) {
      const file = uniqueFiles[i];
      this.fileCommitsCount.set(file, (this.fileCommitsCount.get(file) ?? 0) + 1);
    }

    // Mass-commit guardrail: skip co-change pairing if too many files were touched
    if (uniqueFiles.length > this.config.maxCommitFiles) {
      return;
    }

    // Pre-sort once alphabetically so uniqueFiles[i] is guaranteed < uniqueFiles[j]
    uniqueFiles.sort();

    // Record all file pairs (fileA < fileB guaranteed)
    for (let i = 0; i < uniqueFiles.length; i++) {
      const fileA = uniqueFiles[i];
      for (let j = i + 1; j < uniqueFiles.length; j++) {
        const pairKey = `${fileA}|||${uniqueFiles[j]}`;
        this.pairCoChanges.set(pairKey, (this.pairCoChanges.get(pairKey) ?? 0) + 1);
      }
    }
  }

  /**
   * Computes file-specific temporal couplings and project-wide top coupled pairs.
   */
  public finalize(commitStatsMap?: Map<string, FileCommitStat>): {
    fileCouplings: Map<string, TemporalCoupling[]>;
    projectCouplings: ProjectCouplingPair[];
  } {
    const fileCouplings = new Map<string, TemporalCoupling[]>();
    const projectPairs: ProjectCouplingPair[] = [];

    const getCommits = (file: string): number => {
      const fromStat = commitStatsMap?.get(file)?.commitCount;
      if (typeof fromStat === 'number' && fromStat > 0) return fromStat;
      return this.fileCommitsCount.get(file) ?? 0;
    };

    for (const [pairKey, coChanges] of this.pairCoChanges.entries()) {
      if (coChanges < this.config.minCoChanges) continue;

      const [fileA, fileB] = pairKey.split('|||');
      const commitsA = getCommits(fileA);
      const commitsB = getCommits(fileB);

      if (commitsA === 0 || commitsB === 0) continue;

      const degreeA = coChanges / commitsA;
      const degreeB = coChanges / commitsB;
      const unionCommits = commitsA + commitsB - coChanges;
      const symmetricDegree = unionCommits > 0 ? coChanges / unionCommits : 0;

      // Project-level coupling pair if either degree passes threshold
      if (degreeA >= this.config.minCouplingDegree || degreeB >= this.config.minCouplingDegree) {
        projectPairs.push({
          fileA,
          fileB,
          coChanges,
          degreeA,
          degreeB,
          symmetricDegree,
        });
      }

      // File A perspective
      if (degreeA >= this.config.minCouplingDegree) {
        let listA = fileCouplings.get(fileA);
        if (!listA) {
          listA = [];
          fileCouplings.set(fileA, listA);
        }
        listA.push({
          filePath: fileB,
          coChanges,
          couplingDegree: degreeA,
          totalCommits: commitsB,
        });
      }

      // File B perspective
      if (degreeB >= this.config.minCouplingDegree) {
        let listB = fileCouplings.get(fileB);
        if (!listB) {
          listB = [];
          fileCouplings.set(fileB, listB);
        }
        listB.push({
          filePath: fileA,
          coChanges,
          couplingDegree: degreeB,
          totalCommits: commitsA,
        });
      }
    }

    // Sort and limit couplings per file
    for (const [file, list] of fileCouplings.entries()) {
      list.sort((a, b) => b.couplingDegree - a.couplingDegree || b.coChanges - a.coChanges);
      if (list.length > this.config.maxPairsPerFile) {
        fileCouplings.set(file, list.slice(0, this.config.maxPairsPerFile));
      }
    }

    // Sort project pairs by symmetric Jaccard or max degree
    projectPairs.sort((a, b) => b.symmetricDegree - a.symmetricDegree || b.coChanges - a.coChanges);
    const topProjectCouplings = projectPairs.slice(0, this.config.maxProjectPairs);

    return {
      fileCouplings,
      projectCouplings: topProjectCouplings,
    };
  }

  /**
   * Generates graph nodes and links for D3 network visualization.
   */
  public generateGraphData(
    projectCouplings: ProjectCouplingPair[],
    commitStatsMap?: Map<string, FileCommitStat>
  ): CouplingGraphData {
    const nodeSet = new Set<string>();
    const links: CouplingGraphLink[] = [];

    for (const pair of projectCouplings) {
      nodeSet.add(pair.fileA);
      nodeSet.add(pair.fileB);
      links.push({
        source: pair.fileA,
        target: pair.fileB,
        coChanges: pair.coChanges,
        degree: Math.max(pair.degreeA, pair.degreeB),
      });
    }

    const nodes: CouplingGraphNode[] = Array.from(nodeSet).map((filePath) => {
      const stats = commitStatsMap?.get(filePath);
      return {
        id: filePath,
        name: path.basename(filePath),
        loc: 0,
        commitCount: stats?.commitCount ?? this.fileCommitsCount.get(filePath) ?? 0,
        churnScore: 0,
      };
    });

    return { nodes, links };
  }
}
