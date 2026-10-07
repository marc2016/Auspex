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
  let inBlockComment = false;
  let inTemplate = false;
  const templateBraces: number[] = [];
  let parenDepth = 0;
  let angleDepth = 0;
  let hasArrow = false;
  let typeBraceDepth = 0;

  let prevNonWs = '';
  const limit = Math.min(lines.length, startLineIdx + maxLines);

  for (let j = startLineIdx; j < limit; j++) {
    const line = lines[j];
    const trimmed = line.trim();

    // If an arrow function had an expression body without braces and this is a subsequent statement:
    if (hasArrow && !started && j > startLineIdx) {
      if (
        trimmed.length === 0 ||
        /^(?:export|import|const|let|var|function|class|type|interface)\b/.test(trimmed)
      ) {
        return j; // Ended on previous line
      }
    }

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];

      // 1. Multi-line Block Comment
      if (inBlockComment) {
        if (ch === '*' && line[c + 1] === '/') {
          inBlockComment = false;
          c++;
        }
        continue;
      }

      // 2. Template Literals
      if (inTemplate) {
        if (templateBraces.length === 0) {
          // Inside raw template text
          if (ch === '\\') {
            c++; // skip escaped character
            continue;
          }
          if (ch === '$' && line[c + 1] === '{') {
            templateBraces.push(1);
            c++; // skip '{'
            continue;
          }
          if (ch === '`') {
            inTemplate = false;
            prevNonWs = '`';
            continue;
          }
          // Any other character in raw template literal (including '{' or '}') is ignored
          continue;
        }
        // If templateBraces.length > 0, we are inside an interpolated `${ ... }` expression.
        // It will be parsed as code below, but '}' balances the interpolation instead of the outer block.
      }

      // 3. Comments (line comment and block comment start)
      if (ch === '/' && line[c + 1] === '/') {
        break; // skip rest of line
      }
      if (ch === '/' && line[c + 1] === '*') {
        inBlockComment = true;
        c++;
        continue;
      }

      // 4. String Literals ('...' and "...")
      if (ch === '\'' || ch === '"') {
        const quote = ch;
        c++;
        while (c < line.length) {
          if (line[c] === '\\') {
            c += 2;
            continue;
          }
          if (line[c] === quote) {
            break;
          }
          c++;
        }
        prevNonWs = quote;
        continue;
      }

      // 5. Template Literal Start (when not already in template)
      if (ch === '`') {
        inTemplate = true;
        prevNonWs = '`';
        continue;
      }

      // 6. Regular Expression Literal (/.../)
      if (ch === '/') {
        const isRegexStart = !prevNonWs || /[=(:;,!&|?+\-*~^<>{}[\]]/.test(prevNonWs);
        if (isRegexStart) {
          c++;
          let inCharClass = false;
          while (c < line.length) {
            if (line[c] === '\\') {
              c += 2;
              continue;
            }
            if (line[c] === '[') inCharClass = true;
            else if (line[c] === ']') inCharClass = false;
            else if (line[c] === '/' && !inCharClass) {
              break;
            }
            c++;
          }
          prevNonWs = '/';
          continue;
        }
      }


      // 7. Template Expression Braces (${ ... })
      if (templateBraces.length > 0) {
        if (ch === '{') {
          templateBraces[templateBraces.length - 1]++;
        } else if (ch === '}') {
          templateBraces[templateBraces.length - 1]--;
          if (templateBraces[templateBraces.length - 1] === 0) {
            templateBraces.pop(); // exited ${...} expression, back to raw template
          }
        }
        continue;
      }

      // 8. Normal Code: track block start and brace depth
      if (!started) {
        if (ch === '=' && line[c + 1] === '>') {
          hasArrow = true;
          c++;
          prevNonWs = '>';
          continue;
        }

        if (ch === '(') {
          parenDepth++;
          prevNonWs = '(';
          continue;
        }
        if (ch === ')') {
          parenDepth = Math.max(0, parenDepth - 1);
          prevNonWs = ')';
          continue;
        }
        if (ch === '<') {
          angleDepth++;
          prevNonWs = '<';
          continue;
        }
        if (ch === '>') {
          angleDepth = Math.max(0, angleDepth - 1);
          prevNonWs = '>';
          continue;
        }

        // Tracking object return type annotations directly after colon: e.g. fn(): { a: number } { ... }
        if (typeBraceDepth > 0) {
          if (ch === '{') {
            typeBraceDepth++;
          } else if (ch === '}') {
            typeBraceDepth--;
          }
          if (ch !== ' ' && ch !== '\t' && ch !== '\r') {
            prevNonWs = ch;
          }
          continue;
        }

        // Semicolon before any brace block opened -> non-brace statement (abstract, overload, or arrow)
        if (ch === ';' && parenDepth === 0 && typeBraceDepth === 0) {
          return j + 1;
        }

        if (ch === '{') {
          // If { directly follows ':' (outside parens), it is an object return type annotation: fn(): { ... }
          if (prevNonWs === ':' && parenDepth === 0 && !hasArrow) {
            typeBraceDepth = 1;
            prevNonWs = '{';
            continue;
          }

          // If arrow was seen or we are outside parameters and type arguments, start the block
          if (hasArrow || (parenDepth === 0 && angleDepth === 0)) {
            started = true;
            braceCount = 1;
          }
          prevNonWs = '{';
          continue;
        }
      } else {
        // Block has started!
        if (ch === '{') {
          braceCount++;
        } else if (ch === '}') {
          braceCount--;
          if (braceCount <= 0) {
            return j + 1; // 1-based line of closing brace
          }
        }
      }

      if (ch !== ' ' && ch !== '\t' && ch !== '\r') {
        prevNonWs = ch;
      }
    }

    if (started && braceCount <= 0) {
      return j + 1;
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
