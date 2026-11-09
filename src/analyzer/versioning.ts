import { ANALYZER_VERSION, type AnalysisSnapshot, type ParsedFileInfo } from './types';

/**
 * A cached per-file result may be reused (subject to the file's modification time) only if it is
 * complete and was produced by the current analyzer version.
 */
export function isReusableFileResult(cached: ParsedFileInfo | undefined): cached is ParsedFileInfo {
  return (
    !!cached &&
    typeof cached.codeHealth === 'number' &&
    cached.analyzerVersion === ANALYZER_VERSION
  );
}

/**
 * A stored snapshot may be restored on startup only if it is complete and was produced by the
 * current analyzer version; otherwise it is treated as absent.
 */
export function isRestorableSnapshot(snapshot: AnalysisSnapshot | null | undefined): snapshot is AnalysisSnapshot {
  return (
    !!snapshot &&
    typeof snapshot.tree?.codeHealth === 'number' &&
    snapshot.analyzerVersion === ANALYZER_VERSION
  );
}
