/**
 * WebSocket message types for real-time scan communication.
 *
 * Client -> Server: scan:start, scan:cancel
 * Server -> Client: scan:progress, scan:complete, scan:error
 */

export type WsMessageType =
  | 'scan:start'
  | 'scan:cancel'
  | 'scan:progress'
  | 'scan:complete'
  | 'scan:error';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
}

/** Client sends this to kick off a scan */
export interface WsScanStartPayload {
  repositoryId: string;
  forceFullScan?: boolean;
}

/** Client sends this to abort a running scan */
export interface WsScanCancelPayload {
  repositoryId: string;
}

export type ScanStage =
  | 'resolving'
  | 'cloning'
  | 'git_churn'
  | 'ast_parsing'
  | 'aggregating'
  | 'saving';

/** Server sends progress updates during a scan */
export interface WsScanProgressPayload {
  repositoryId: string;
  stage: ScanStage;
  message: string;
  /** 0–100 */
  percent: number;
  /** Number of files processed so far */
  filesProcessed?: number;
  totalFiles?: number;
}

/** Server sends this when the scan completes successfully */
export interface WsScanCompletePayload {
  repositoryId: string;
  snapshotId: string;
  isIncremental: boolean;
  totalFiles: number;
  totalLoc: number;
  durationMs: number;
}

/** Server sends this on scan failure */
export interface WsScanErrorPayload {
  repositoryId: string;
  message: string;
  stage?: ScanStage;
}
