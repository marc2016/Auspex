import type { ParsedFileInfo } from '../types';
import type { CallGraphBuilder } from './callGraphBuilder';
import type { CallGraph } from './types';

/**
 * Updates the call graph after a single file was re-parsed (e.g. on save), without a workspace scan:
 * the file's cached parse result is replaced and the graph is re-resolved from all cached results.
 * Global resolution only works on in-memory data, so this stays cheap.
 */
export function updateCallGraphForFile(
  fileCache: Record<string, ParsedFileInfo>,
  parsed: ParsedFileInfo,
  builder: CallGraphBuilder
): { fileCache: Record<string, ParsedFileInfo>; callGraph: CallGraph } {
  const updated = { ...fileCache, [parsed.filePath]: parsed };
  return { fileCache: updated, callGraph: builder.build(Object.values(updated)) };
}
