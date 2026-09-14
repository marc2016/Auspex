import type { ClassInfo, MethodInfo } from '../types';
import { type LanguageStructureExtractor, type ExtractedStructure } from './types';

export class PythonExtractor implements LanguageStructureExtractor {
  readonly supportedLanguages = ['python'];

  extractStructures(lines: string[], _lang: string): ExtractedStructure {
    const classes: ClassInfo[] = [];
    const methods: MethodInfo[] = [];

    const classRegex = /^(\s*)class\s+([a-zA-Z0-9_]+)/;
    const fnRegex = /^(\s*)(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const clsMatch = line.match(classRegex);
      if (clsMatch) {
        const indent = clsMatch[1].length;
        const name = clsMatch[2];
        const startLine = i + 1;
        let endLine = startLine;

        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.trim().length === 0 || nextLine.trim().startsWith('#')) continue;
          const nextIndent = nextLine.search(/\S/);
          if (nextIndent <= indent) {
            endLine = j;
            break;
          }
          endLine = j + 1;
        }

        classes.push({
          name,
          startLine,
          endLine,
          loc: Math.max(endLine - startLine + 1, 1),
          methods: [],
        });
      }

      const fnMatch = line.match(fnRegex);
      if (fnMatch) {
        const indent = fnMatch[1].length;
        const name = fnMatch[2];
        const startLine = i + 1;
        let endLine = startLine;

        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.trim().length === 0 || nextLine.trim().startsWith('#')) continue;
          const nextIndent = nextLine.search(/\S/);
          if (nextIndent <= indent) {
            endLine = j;
            break;
          }
          endLine = j + 1;
        }

        const enclosingClass = classes.find(
          (c) => startLine >= c.startLine && endLine <= c.endLine
        );

        const methodObj: MethodInfo = {
          name: `${name}()`,
          startLine,
          endLine,
          loc: Math.max(endLine - startLine + 1, 1),
        };

        methods.push(methodObj);
        enclosingClass?.methods.push(methodObj);
      }
    }

    return { classes, methods };
  }
}
