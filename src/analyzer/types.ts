export type NodeType = 'folder' | 'namespace' | 'file' | 'class' | 'method';

export type BiomarkerType =
  | 'brain_method'
  | 'bumpy_road'
  | 'nested_complexity'
  | 'complex_conditional'
  | 'deep_nesting'
  | 'large_method'
  | 'excess_parameters'
  | 'brain_class';

export interface BiomarkerFinding {
  type: BiomarkerType;
  severity: 'low' | 'medium' | 'high';
  functionName?: string;
  startLine?: number;
  endLine?: number;
  details: string;
}

export interface CodeHealthResult {
  score: number; // 1.0 to 10.0
  biomarkers: BiomarkerFinding[];
}

export interface MethodInfo {
  name: string;
  startLine: number;
  endLine: number;
  loc: number;
  codeHealth?: number;
  biomarkers?: BiomarkerFinding[];
}

export interface ClassInfo {
  name: string;
  startLine: number;
  endLine: number;
  loc: number;
  methods: MethodInfo[];
  codeHealth?: number;
  biomarkers?: BiomarkerFinding[];
}

export interface ParsedFileInfo {
  filePath: string;
  namespace?: string;
  classes: ClassInfo[];
  methods: MethodInfo[];
  loc: number;
  fileHash: string;
  lastModifiedAt?: number;
  codeHealth?: number;
  biomarkers?: BiomarkerFinding[];
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
  temporalCoupling?: TemporalCoupling[];
}

export interface TemporalCoupling {
  filePath: string;
  coChanges: number;
  couplingDegree: number; // 0.0 to 1.0 (e.g. 0.85 = 85%)
  totalCommits: number;
}

export interface ProjectCouplingPair {
  fileA: string;
  fileB: string;
  coChanges: number;
  degreeA: number;
  degreeB: number;
  symmetricDegree: number;
}

export interface CouplingGraphNode {
  id: string;
  name: string;
  loc: number;
  commitCount: number;
  codeHealth?: number;
  churnScore?: number;
}

export interface CouplingGraphLink {
  source: string;
  target: string;
  coChanges: number;
  degree: number;
}

export interface CouplingGraphData {
  nodes: CouplingGraphNode[];
  links: CouplingGraphLink[];
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
  codeHealth?: number; // 1.0 to 10.0 (CodeScene scale)
  biomarkers?: BiomarkerFinding[];
  temporalCoupling?: TemporalCoupling[];
  primaryAuthor?: string;
  primaryAuthorPercentage?: number;
  knowledgeRisk?: KnowledgeRiskLevel;
}

export type KnowledgeRiskLevel = 'low' | 'medium' | 'high';

export interface KnowledgeAuthorStat {
  name: string;
  fileCount: number;
  linesAdded: number;
  linesDeleted: number;
  totalCommits: number;
  monopolyFileCount: number;
  percentageOfCodebase: number;
}

export interface KnowledgeRiskItem {
  filePath: string;
  name: string;
  loc: number;
  commitCount: number;
  primaryAuthor: string;
  ownershipPercentage: number;
  churnScore: number;
  riskLevel: KnowledgeRiskLevel;
}

export interface KnowledgeSummary {
  totalAuthors: number;
  truckFactor: number; // Minimal number of developers owning > 50% of the codebase
  monopolyFileCount: number;
  monopolyPercentage: number;
  topAuthors: KnowledgeAuthorStat[];
  highestRiskFiles: KnowledgeRiskItem[];
}

export interface HotspotItem {
  filePath: string;
  name: string;
  loc: number;
  commitCount: number;
  fixCount: number;
  churnScore: number;
  defectRatio: number;
  codeHealth?: number;
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
  projectCouplings?: ProjectCouplingPair[];
  couplingGraph?: CouplingGraphData;
  knowledgeSummary?: KnowledgeSummary;
}

export interface PipelineProgress {
  stage: 'churn' | 'ast' | 'tree' | 'done';
  message: string;
  percentage: number;
  processedFiles?: number;
  totalFiles?: number;
}
