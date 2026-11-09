import { JavaScriptExtractor } from '../../src/analyzer/extractors/JavaScriptExtractor';
import { extractCallSites, extractAmdDependencies, extractImports } from '../../src/analyzer/calls/callSiteExtractor';
import type { ParsedFileInfo } from '../../src/analyzer/types';

const extractor = new JavaScriptExtractor();

/** Parses JS source like the analyzer does (structure only). */
export function parseJs(filePath: string, src: string[]): ParsedFileInfo {
  const { classes, methods } = extractor.extractStructures(src, 'javascript');
  return { filePath, classes, methods, loc: src.length, fileHash: 'h' };
}

/** Parses JS source including call sites and AMD dependencies. */
export function parseJsWithCalls(filePath: string, src: string[]): ParsedFileInfo {
  const file = parseJs(filePath, src);
  file.callSites = extractCallSites(src, file.methods);
  file.amdDependencies = extractAmdDependencies(src);
  const { imports, isModule } = extractImports(src);
  file.imports = imports;
  file.isModule = isModule;
  return file;
}
