export type NodeType = 'folder' | 'namespace' | 'file' | 'class' | 'method';

export interface MethodInfo {
  name: string;
  startLine: number;
  endLine: number;
  loc: number;
}

export interface ClassInfo {
  name: string;
  startLine: number;
  endLine: number;
  loc: number;
  methods: MethodInfo[];
}

export interface ParsedFileInfo {
  filePath: string;
  namespace?: string;
  classes: ClassInfo[];
  methods: MethodInfo[];
  loc: number;
  fileHash: string;
  lastModifiedAt?: number;
}

export interface ContributorStat {
  name: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  percentage?: number;
}

export interface JiraIssueInfo {
  key: string;
  issueType: string;
  summary?: string;
  status?: string;
  isBug: boolean;
  url?: string;
}

export interface CommitInfo {
  hash: string;
  author: string;
  timestamp: number;
  message: string;
  linesAdded: number;
  linesDeleted: number;
  isFix?: boolean;
  jiraIssues?: JiraIssueInfo[];
}

export interface FileCommitStat {
  commitCount: number;
  fixCount: number;
  featCount: number;
  refactorCount: number;
  linesAdded: number;
  linesDeleted: number;
  lastModifiedAt: number;
  contributors?: ContributorStat[];
  commits?: CommitInfo[];
}

export interface TreeNode {
  name: string;
  path: string;
  type: NodeType;
  value: number; // LOC
  loc: number;
  commitCount: number;
  churnScore: number; // Normalized 0.0 to 1.0
  fixCount: number;
  featCount: number;
  refactorCount: number;
  linesAdded: number;
  linesDeleted: number;
  defectRatio?: number; // fixCount / commitCount
  lastModifiedAt?: number;
  startLine?: number;
  endLine?: number;
  children?: TreeNode[];
  contributors?: ContributorStat[];
  commits?: CommitInfo[];
}

export interface HotspotItem {
  filePath: string;
  name: string;
  loc: number;
  commitCount: number;
  fixCount: number;
  churnScore: number;
  defectRatio: number;
}

export interface AnalysisSnapshot {
  id: string;
  workspacePath: string;
  headCommitSha: string;
  totalFiles: number;
  totalLoc: number;
  durationMs: number;
  scannedAt: string;
  tree: TreeNode;
  hotspots: HotspotItem[];
}

export interface PipelineProgress {
  stage: 'churn' | 'ast' | 'tree' | 'done';
  message: string;
  percentage: number;
  processedFiles?: number;
  totalFiles?: number;
}
