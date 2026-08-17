/**
 * The type of a node in the analysis tree hierarchy:
 * folder -> namespace/package -> file -> class -> method
 */
export type NodeType = 'folder' | 'namespace' | 'class' | 'file' | 'method';

/**
 * A single node in the hierarchical analysis tree.
 * Used directly by the ECharts Treemap as input data.
 */
export interface TreeNode {
  /** Display name (folder name, filename, class name, method name, etc.) */
  name: string;
  /** Relative path from repository root */
  path: string;
  type: NodeType;
  /**
   * The "size" value for treemap tile sizing.
   * For methods/classes/files: Lines of Code (LOC).
   * For folders/namespaces: sum of all child LOC.
   */
  value: number;
  /** Lines of Code for this node specifically */
  loc: number;
  /**
   * Git commit count: how many times this file/folder
   * has been touched in the commit history.
   */
  commitCount: number;
  /**
   * Normalized churn score 0.0–1.0.
   * 0 = very stable (green), 1 = high churn hotspot (red).
   */
  churnScore: number;
  /** Start line in source file (methods & classes) */
  startLine?: number;
  /** End line in source file (methods & classes) */
  endLine?: number;
  /** Enclosing file path (useful when viewing flat methods/classes) */
  filePath?: string;
  /** Enclosing class name (for methods) */
  className?: string;
  /** Child nodes (folders contain files, files contain classes/methods, etc.) */
  children?: TreeNode[];
}

/**
 * The full analysis snapshot stored in the database and
 * returned by the /treemap API endpoint.
 */
export interface AnalysisSnapshot {
  id: string;
  repositoryId: string;
  headCommitSha: string;
  isIncremental: boolean;
  totalFiles: number;
  totalLoc: number;
  /** The root of the hierarchical tree */
  tree: TreeNode;
  scannedAt: string;
}
