import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ParsedFileInfo, ClassInfo, MethodInfo } from './types';

export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'bin',
  'obj',
  '.next',
  '.nuxt',
  'coverage',
  '__pycache__',
  '.gradle',
  'target',
  '.idea',
  '.vscode',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.bundle.js',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.woff',
  '*.woff2',
  '*.wasm',
  '*.sqlite',
  '*.db',
];

const CODE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.java': 'java',
  '.cs': 'csharp',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
};

export function isPathIgnored(name: string, relPath: string, patterns: string[]): boolean {
  const normalizedRel = relPath.replace(/\\/g, '/');
  const lowerName = name.toLowerCase();
  const lowerRel = normalizedRel.toLowerCase();

  for (const pattern of patterns) {
    const p = pattern.trim().toLowerCase();
    if (!p) continue;

    if (lowerName === p) return true;
    if (lowerRel === p || lowerRel.startsWith(`${p}/`) || lowerRel.includes(`/${p}/`)) return true;

    if (p.startsWith('*.')) {
      const ext = p.slice(1);
      if (lowerName.endsWith(ext)) return true;
    }

    if (p.includes('*')) {
      const regexStr = '^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      try {
        const reg = new RegExp(regexStr);
        if (reg.test(lowerName) || reg.test(lowerRel)) return true;
      } catch {
        /* ignore */
      }
    }
  }

  return false;
}

export class AstStructureAnalyzer {
  collectFiles(dirPath: string, patterns: string[] = DEFAULT_IGNORE_PATTERNS): string[] {
    const result: string[] = [];

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');

        if (isPathIgnored(entry.name, relPath, patterns)) {
          continue;
        }

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          result.push(fullPath);
        }
      }
    };

    walk(dirPath);
    return result;
  }

  analyzeFile(absolutePath: string, relPath: string): ParsedFileInfo {
    let content = '';
    let stat: fs.Stats | undefined;
    try {
      content = fs.readFileSync(absolutePath, 'utf-8');
      stat = fs.statSync(absolutePath);
    } catch {
      return {
        filePath: relPath,
        loc: 0,
        classes: [],
        methods: [],
        fileHash: '',
      };
    }

    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const ext = path.extname(absolutePath).toLowerCase();
    const lines = content.split('\n');
    const loc = lines.length;
    const lastModifiedAt = stat ? stat.mtimeMs : Date.now();

    const lang = CODE_EXTENSIONS[ext];
    if (!lang) {
      return { filePath: relPath, loc, classes: [], methods: [], fileHash, lastModifiedAt };
    }

    const { namespace, classes, methods } = this.extractStructure(lines, lang);

    return { filePath: relPath, namespace, loc, classes, methods, fileHash, lastModifiedAt };
  }

  private extractStructure(
    lines: string[],
    lang: string
  ): { namespace?: string; classes: ClassInfo[]; methods: MethodInfo[] } {
    const classes: ClassInfo[] = [];
    const methods: MethodInfo[] = [];
    let namespace: string | undefined;

    // 1. Namespace & Package
    for (let i = 0; i < Math.min(lines.length, 60); i++) {
      const line = lines[i].trim();
      if (lang === 'java' || lang === 'csharp') {
        const pkgMatch = line.match(/^package\s+([a-zA-Z0-9_.]+)\s*;/);
        if (pkgMatch) {
          namespace = pkgMatch[1];
          break;
        }
        const nsMatch = line.match(/^namespace\s+([a-zA-Z0-9_.]+)/);
        if (nsMatch) {
          namespace = nsMatch[1];
          break;
        }
      } else if (lang === 'typescript' || lang === 'javascript') {
        const nsMatch = line.match(/^(?:export\s+)?(?:namespace|module)\s+([a-zA-Z0-9_.]+)/);
        if (nsMatch) {
          namespace = nsMatch[1];
          break;
        }
      }
    }

    // 2. Classes & Functions
    if (lang === 'python') {
      this.extractPythonStructures(lines, classes, methods);
    } else {
      this.extractBraceStructures(lines, lang, classes, methods);
    }

    return { namespace, classes, methods };
  }

  private extractPythonStructures(
    lines: string[],
    classes: ClassInfo[],
    methods: MethodInfo[]
  ): void {
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
  }

  private extractBraceStructures(
    lines: string[],
    _lang: string,
    classes: ClassInfo[],
    methods: MethodInfo[]
  ): void {
    const classPattern =
      /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:public|private|protected|internal|final)?\s*(?:class|interface|struct|record)\s+([a-zA-Z0-9_$]+)/;

    const functionPatterns = [
      /(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)\s*\(/,
      /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
      /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?function/,
      /^\s*(?:(?:public|private|protected|readonly|static)\s+)*([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
      /^\s*(?:(?:public|private|protected|static|async|override|virtual|readonly)\s+)*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
      /^\s*(?:(?:public|private|protected|internal|static|final|abstract|async|override|virtual)\s+)+[a-zA-Z0-9_<>[\]?]+\s+([a-zA-Z0-9_]+)\s*\([^)]*\)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      const classMatch = line.match(classPattern);
      if (classMatch && classMatch[1]) {
        const className = classMatch[1];
        const startLine = i + 1;
        let endLine = startLine;
        let braceCount = 0;
        let started = false;

        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') {
              braceCount++;
              started = true;
            } else if (ch === '}') {
              braceCount--;
            }
          }
          if (started && braceCount <= 0) {
            endLine = j + 1;
            break;
          }
        }

        classes.push({
          name: className,
          startLine,
          endLine,
          loc: Math.max(endLine - startLine + 1, 1),
          methods: [],
        });
      }

      let funcName: string | null = null;
      for (const pattern of functionPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const candidate = match[1];
          if (!['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(candidate)) {
            funcName = candidate;
            break;
          } else if (candidate === 'constructor') {
            funcName = 'constructor';
            break;
          }
        }
      }

      if (!funcName) continue;

      const startLine = i + 1;
      let endLine = startLine;
      let braceCount = 0;
      let started = false;

      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') {
            braceCount++;
            started = true;
          } else if (ch === '}') {
            braceCount--;
          }
        }
        if (started && braceCount <= 0) {
          endLine = j + 1;
          break;
        }
        if (j - i > 1000) {
          endLine = j + 1;
          break;
        }
      }

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
  }
}
