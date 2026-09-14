import type { ClassInfo, MethodInfo } from '../types';

export interface ExtractedStructure {
  namespace?: string;
  classes: ClassInfo[];
  methods: MethodInfo[];
}

/**
 * Common interface for language-specific AST and structure extractors.
 * Implementing this interface allows adding new languages in a modular, decoupled way.
 */
export interface LanguageStructureExtractor {
  /** List of language identifiers handled by this extractor (e.g. ['javascript', 'typescript']) */
  readonly supportedLanguages: string[];

  /** Extracts package / namespace / module name from the top of the file */
  extractNamespace?(lines: string[]): string | undefined;

  /** Extracts classes/objects and functions/methods from file lines */
  extractStructures(lines: string[], lang: string): ExtractedStructure;
}

/**
 * Finds the 1-based end line of a curly-brace block starting at `startLineIdx` (0-based).
 */
export function findBraceBlockEnd(lines: string[], startLineIdx: number, maxLines: number = 5000): number {
  let braceCount = 0;
  let started = false;
  const limit = Math.min(lines.length, startLineIdx + maxLines);

  for (let j = startLineIdx; j < limit; j++) {
    const line = lines[j];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '{') {
        braceCount++;
        started = true;
      } else if (ch === '}') {
        braceCount--;
      }
    }
    if (started && braceCount <= 0) {
      return j + 1; // 1-based
    }
  }

  return limit;
}

/**
 * Check if a trimmed line is a comment or empty
 */
export function isCommentOrEmpty(trimmed: string): boolean {
  return (
    trimmed.length === 0 ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('#')
  );
}
