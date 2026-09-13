import fs from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { GitChurnAnalyzer } from './gitChurn';
import { AstStructureAnalyzer, DEFAULT_IGNORE_PATTERNS } from './astAnalyzer';
import { TreeAggregator } from './treeAggregator';
import type {
  AnalysisSnapshot,
  PipelineProgress,
  ParsedFileInfo,
  JiraIssueInfo,
} from './types';
import type { AuspexStorage } from '../storage/cache';
import { extractJiraKeys } from '../integrations/jira/ticketExtractor';
import type { JiraClient } from '../integrations/jira/jiraClient';

export class AuspexPipeline {
  private churnAnalyzer = new GitChurnAnalyzer();
  private astAnalyzer = new AstStructureAnalyzer();
  private treeAggregator = new TreeAggregator();

  async run(
    workspacePath: string,
    storage: AuspexStorage | null,
    onProgress?: (progress: PipelineProgress) => void,
    customIgnorePatterns?: string[],
    jiraClient?: JiraClient | null,
    allowedProjectKeys?: string[],
    options?: { maxCommits?: number }
  ): Promise<AnalysisSnapshot> {
    const startTime = Date.now();

    // 1. Get HEAD commit SHA if available
    let headCommitSha = 'workspace';
    try {
      const git = simpleGit(workspacePath);
      const isRepo = await git.checkIsRepo();
      if (isRepo) {
        headCommitSha = (await git.revparse(['HEAD'])).trim();
      }
    } catch {
      /* ignore */
    }

    // 2. Churn Analysis Stage
    onProgress?.({
      stage: 'churn',
      message: 'Analyzing Git history & churn…',
      percentage: 10,
    });

    const commitStats = await this.churnAnalyzer.analyze(workspacePath, {
      maxCommits: options?.maxCommits,
    });

    // Optional Jira ticket enrichment
    if (jiraClient) {
      onProgress?.({
        stage: 'churn',
        message: 'Resolving Jira ticket metadata…',
        percentage: 18,
      });

      try {
        const allKeys: string[] = [];
        for (const stat of commitStats.values()) {
          if (stat.commits) {
            for (const commit of stat.commits) {
              const keys = extractJiraKeys(commit.message, allowedProjectKeys);
              allKeys.push(...keys);
            }
          }
        }

        if (allKeys.length > 0) {
          const issuesMap = await jiraClient.batchFetchIssues(allKeys);
          if (issuesMap.size > 0) {
            for (const stat of commitStats.values()) {
              if (!stat.commits) continue;
              for (const commit of stat.commits) {
                const keys = extractJiraKeys(commit.message, allowedProjectKeys);
                const matchedIssues: JiraIssueInfo[] = [];
                let hasJiraBug = false;

                for (const k of keys) {
                  const issue = issuesMap.get(k);
                  if (issue) {
                    matchedIssues.push(issue);
                    if (issue.isBug) {
                      hasJiraBug = true;
                    }
                  }
                }

                if (matchedIssues.length > 0) {
                  commit.jiraIssues = matchedIssues;
                }

                if (hasJiraBug && !commit.isFix) {
                  commit.isFix = true;
                  stat.fixCount += 1;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Auspex] Jira ticket resolution skipped on error:', err);
      }
    }

    // 3. AST Structure Analysis Stage
    onProgress?.({
      stage: 'ast',
      message: 'Collecting workspace files…',
      percentage: 25,
    });

    const patterns = customIgnorePatterns && customIgnorePatterns.length > 0
      ? Array.from(new Set([...DEFAULT_IGNORE_PATTERNS, ...customIgnorePatterns]))
      : DEFAULT_IGNORE_PATTERNS;

    const allFiles = this.astAnalyzer.collectFiles(workspacePath, patterns);

    onProgress?.({
      stage: 'ast',
      message: `Analyzing code structure (${allFiles.length} files)…`,
      percentage: 30,
      processedFiles: 0,
      totalFiles: allFiles.length,
    });

    const cachedFiles = storage ? storage.loadFileCache() : {};
    const parsedFiles: ParsedFileInfo[] = [];
    const updatedCache: Record<string, ParsedFileInfo> = {};

    let processed = 0;
    for (const absPath of allFiles) {
      const relPath = path.relative(workspacePath, absPath).replace(/\\/g, '/');

      let parsed: ParsedFileInfo;
      const cached = cachedFiles[relPath];
      if (cached && typeof cached.codeHealth === 'number') {
        let isStale = false;
        try {
          const stat = fs.statSync(absPath);
          if (cached.lastModifiedAt && stat.mtimeMs > cached.lastModifiedAt) {
            isStale = true;
          }
        } catch {
          isStale = true;
        }

        if (!isStale) {
          parsed = cached;
        } else {
          parsed = this.astAnalyzer.analyzeFile(absPath, relPath);
        }
      } else {
        parsed = this.astAnalyzer.analyzeFile(absPath, relPath);
      }

      parsedFiles.push(parsed);
      updatedCache[relPath] = parsed;
      processed++;

      if (processed % 20 === 0 || processed === allFiles.length) {
        const percent = 30 + Math.round((processed / Math.max(allFiles.length, 1)) * 40);
        onProgress?.({
          stage: 'ast',
          message: `Analyzing code structure (${processed}/${allFiles.length})…`,
          percentage: percent,
          processedFiles: processed,
          totalFiles: allFiles.length,
        });
      }
    }

    if (storage) {
      storage.saveFileCache(updatedCache);
    }

    // 4. Tree Aggregation Stage
    onProgress?.({
      stage: 'tree',
      message: 'Assembling hierarchical treemap & hotspots…',
      percentage: 75,
    });

    const { tree, hotspots, projectCouplings, couplingGraph, knowledgeSummary } =
      this.treeAggregator.buildTree(
        parsedFiles,
        commitStats,
        this.churnAnalyzer.lastProjectCouplings
      );

    const totalLoc = parsedFiles.reduce((sum, f) => sum + f.loc, 0);
    const durationMs = Date.now() - startTime;

    const snapshot: AnalysisSnapshot = {
      id: `${Date.now()}`,
      workspacePath,
      headCommitSha,
      totalFiles: parsedFiles.length,
      totalLoc,
      durationMs,
      scannedAt: new Date().toISOString(),
      tree,
      hotspots,
      projectCouplings,
      couplingGraph,
      knowledgeSummary,
    };

    if (storage) {
      storage.saveSnapshot(snapshot);
    }

    onProgress?.({
      stage: 'done',
      message: `Analysis complete in ${durationMs}ms (${parsedFiles.length} files, ${totalLoc} LOC).`,
      percentage: 100,
    });

    return snapshot;
  }
}
