/**
 * Repository configuration stored in the database.
 */
export interface RepositoryConfig {
  id: string;
  name: string;
  /** Local filesystem path or remote Git URL (HTTPS / SSH) */
  urlOrPath: string;
  isRemote: boolean;
  defaultBranch: string;
  /** ID of the associated auth token (PAT), if any */
  authTokenId?: string;
  ignorePatterns: string[];
  /** Use shallow clone (limited history) for performance on large repos */
  shallowClone: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Personal Access Token or SSH credential stored securely.
 */
export interface AuthToken {
  id: string;
  label: string;
  /** e.g. "github", "gitlab", "bitbucket" */
  provider: string;
  token: string;
  createdAt: string;
}

/**
 * Options passed to a scan operation.
 */
export interface ScanOptions {
  repositoryId: string;
  /** Force a full re-scan, ignoring any cached snapshots */
  forceFullScan?: boolean;
}

/**
 * Represents the result of a repository scan operation.
 */
export interface ScanResult {
  repositoryId: string;
  headCommitSha: string;
  isIncremental: boolean;
  totalFiles: number;
  totalLoc: number;
  scannedAt: string;
}
