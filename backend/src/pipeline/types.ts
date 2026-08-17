import type { TreeNode } from '@auspex/shared';

/**
 * Context object passed through every stage of the analysis pipeline.
 * Each stage reads from and enriches this context.
 */
export interface PipelineContext {
  repositoryId: string;
  /** Resolved local filesystem path to the repo (set by stage 01) */
  repoPath: string;
  /** Whether a temporary clone was created (needs cleanup) */
  isTemporaryClone: boolean;
  /** Current HEAD commit SHA (set by stage 01) */
  headCommitSha: string;
  /** SHA from the last cached scan, if any */
  previousHeadCommitSha?: string;
  /** Whether we are doing an incremental (delta) scan */
  isIncremental: boolean;
  /** Files changed since last scan (set by stage 01 for delta scans) */
  changedFiles: Set<string>;
  /** Files deleted since last scan */
  deletedFiles: Set<string>;
  /** Commit count per file path (set by stage 02) */
  commitCounts: Map<string, number>;
  /** The assembled tree (set by stage 04) */
  tree?: TreeNode;
  /** Total files in the analysis */
  totalFiles: number;
  /** Total LOC across all files */
  totalLoc: number;
  /** AbortController signal for cancellation support */
  signal: AbortSignal;
  /** Progress reporter – each stage calls this to push WS updates */
  reportProgress: (
    stage: string,
    message: string,
    percent: number,
    filesProcessed?: number,
    totalFiles?: number
  ) => void;
}

/**
 * A single stage in the analysis pipeline.
 */
export interface PipelineStage {
  readonly name: string;
  execute(ctx: PipelineContext): Promise<void>;
}

/**
 * Metadata about a parsed method/function extracted from AST.
 */
export interface MethodInfo {
  name: string;
  startLine: number;
  endLine: number;
  loc: number;
  className?: string;
}

/**
 * Metadata about a parsed class/interface/struct extracted from AST.
 */
export interface ClassInfo {
  name: string;
  startLine: number;
  endLine: number;
  loc: number;
  methods: MethodInfo[];
}

/**
 * Parsed file info from the AST stage.
 */
export interface ParsedFileInfo {
  /** Relative path from repo root */
  filePath: string;
  namespace?: string;
  loc: number;
  classes: ClassInfo[];
  methods: MethodInfo[];
  /** SHA256 hash of the file contents – used for cache invalidation */
  fileHash: string;
}
