import type { ClassInfo, MethodInfo } from '../types';
import {
  type LanguageStructureExtractor,
  type ExtractedStructure,
  findBraceBlockEnd,
  isCommentOrEmpty,
} from './types';

export class GenericBraceExtractor implements LanguageStructureExtractor {
  readonly supportedLanguages = ['java', 'csharp', 'go', 'rust', 'c', 'cpp'];

  extractNamespace(lines: string[]): string | undefined {
    for (let i = 0; i < Math.min(lines.length, 60); i++) {
      const line = lines[i].trim();
      const pkgMatch = line.match(/^package\s+([a-zA-Z0-9_.]+)\s*;/);
      if (pkgMatch) {
        return pkgMatch[1];
      }
      const nsMatch = line.match(/^namespace\s+([a-zA-Z0-9_.]+)/);
      if (nsMatch) {
        return nsMatch[1];
      }
      // Go package
      const goPkgMatch = line.match(/^package\s+([a-zA-Z0-9_]+)/);
      if (goPkgMatch) {
        return goPkgMatch[1];
      }
    }
    return undefined;
  }

  extractStructures(lines: string[], _lang: string): ExtractedStructure {
    const classes: ClassInfo[] = [];
    const methods: MethodInfo[] = [];

    const classPattern =
      /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:pub(?:\([^)]*\))?|public|private|protected|internal|final)?\s*(?:class|interface|struct|record)\s+([a-zA-Z0-9_$]+)/;

    const functionPatterns = [
      /^\s*(?:(?:public|private|protected|internal|static|final|abstract|async|override|virtual)\s+)+[a-zA-Z0-9_<>[\]?*]+\s+([a-zA-Z0-9_]+)\s*\([^)]*\)/,
      /^\s*(?:(?:public|private|protected|static|async|override|virtual|readonly)\s+)*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
      // C / C++ functions with return types (e.g. int calculate(...), void execute(...) {)
      /^\s*(?:(?:static|inline|extern|virtual|explicit|const)\s+)*(?:[a-zA-Z0-9_*<>[\]:]+\s+)+([a-zA-Z0-9_]+)\s*\([^;)]*\)\s*(?:const)?\s*\{/,
      // Go func receiver or standard func
      /^\s*func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/,
      // Rust fn
      /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/,
      /^\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isCommentOrEmpty(trimmed)) {
        continue;
      }

      // Check class
      const classMatch = line.match(classPattern);
      if (classMatch && classMatch[1]) {
        const className = classMatch[1];
        const startLine = i + 1;
        const endLine = findBraceBlockEnd(lines, i);

        classes.push({
          name: className,
          startLine,
          endLine,
          loc: Math.max(endLine - startLine + 1, 1),
          methods: [],
        });
        continue;
      }

      // Fast filter: functions require '('
      if (!line.includes('(')) {
        continue;
      }

      let funcName: string | null = null;
      for (const pattern of functionPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const candidate = match[1];
          if (!['if', 'for', 'while', 'switch', 'catch'].includes(candidate)) {
            funcName = candidate;
            break;
          }
        }
      }

      if (!funcName) continue;

      const startLine = i + 1;
      const endLine = findBraceBlockEnd(lines, i);

      const enclosingClass = classes.find(
        (c) => startLine >= c.startLine && endLine <= c.endLine
      );

      const methodObj: MethodInfo = {
        name: `${funcName}()`,
        startLine,
        endLine,
        loc: Math.max(endLine - startLine + 1, 1),
      };

      methods.push(methodObj);
      enclosingClass?.methods.push(methodObj);

      if (endLine > startLine + 1) {
        i = endLine - 1;
      }
    }

    return { classes, methods };
  }
}
