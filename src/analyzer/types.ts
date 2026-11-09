import type { CallSite, CallGraph, FileImport } from './calls/types';
import type { DeclarativeRef } from './declarative/references';

export interface UnresolvedDeclarativeRef {
  file: string;
  line: number;
  value: string;
}

export interface DeclarativeReport {
  warnings: string[];
  /** Per rule (in configuration order): matched files and found references. */
  rules: { files: string[]; matchedFiles: number; references: number }[];
  unresolved: UnresolvedDeclarativeRef[];
}

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
  parentMethod?: string;
  isNested?: boolean;
  codeHealth?: number;
  biomarkers?: BiomarkerFinding[];
}

export interface ClassInfo {
  name: string;
  startLine: number;
  endLine: number;
  loc: number;
  methods: MethodInfo[];
  kind?: 'class' | 'object_literal' | 'prototype' | 'module' | 'component' | 'constructor';
  codeHealth?: number;
  biomarkers?: BiomarkerFinding[];
}

/**
 * Version of the analysis output for unchanged source files.
 * Increment whenever extractor or analyzer changes alter results for unchanged files,
 * so cached file results and stored snapshots from older versions are re-analyzed.
 */
export const ANALYZER_VERSION = 5;

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
  /** ANALYZER_VERSION that produced this result; missing for results written before versioning. */
  analyzerVersion?: number;
  /** Calls found inside known functions (JS/TS only). */
  callSites?: CallSite[];
  /** AMD factory parameter -> dependency id, from `define([...], function (...) {})`. */
  amdDependencies?: Record<string, string>;
  /** ES imports and requires of relative modules (JS/TS only). */
  imports?: FileImport[];
  /** True if the file is an ES module (top-level `import`/`export`). */
  isModule?: boolean;
  /** References to JS functions found in XML-like files (`auspex.declarativeReferences`). */
  declarativeRefs?: DeclarativeRef[];
  /** Hash of the reference rules this result was produced with. */
  rulesHash?: string;
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
  detectedAuthors?: string[];
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
  authorAliases?: Record<string, string[]>;
  scope?: AuspexScope;
  scopeSummary?: string;
  /** ANALYZER_VERSION that produced this snapshot; missing for snapshots written before versioning. */
  analyzerVersion?: number;
  /** Call relationships between known functions. */
  callGraph?: CallGraph;
  /** Rule warnings and unresolved declarative references of the last scan. */
  declarativeReport?: DeclarativeReport;
}

export type ScopeMode = 'all' | 'worktree' | 'timeframe';

export type TimeframePreset = '7d' | '14d' | '30d' | '90d' | '180d' | '1y' | 'custom';

export interface AuspexScope {
  mode: ScopeMode;
  timeframePreset?: TimeframePreset;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface PipelineProgress {
  stage: 'churn' | 'ast' | 'tree' | 'done';
  message: string;
  percentage: number;
  processedFiles?: number;
  totalFiles?: number;
}

