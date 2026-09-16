import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ignore from 'ignore';
import type { ParsedFileInfo, ClassInfo, MethodInfo } from './types';

export interface CollectFilesOptions {
  respectGitIgnore?: boolean;
}

import { CodeHealthAnalyzer } from './codeHealth';
import { extractorRegistry } from './extractors/registry';

export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.gitignore',
  '.vscodeignore',
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
  'vendor',
  '.venv',
  'venv',
  'env',
  'site-packages',
  '.cache',
  '.turbo',
  'bower_components',
  'Pods',
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

const wildcardRegexCache = new Map<string, RegExp | null>();

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
      continue; // Handled extension pattern, avoid regex compilation
    }

    if (p.includes('*')) {
      let reg = wildcardRegexCache.get(p);
      if (reg === undefined) {
        try {
          const regexStr = '^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
          reg = new RegExp(regexStr);
        } catch {
          reg = null;
        }
        wildcardRegexCache.set(p, reg);
      }
      if (reg && (reg.test(lowerName) || reg.test(lowerRel))) return true;
    }
  }

  return false;
}

export class AstStructureAnalyzer {
  private codeHealthAnalyzer = new CodeHealthAnalyzer();

  collectFiles(
    dirPath: string,
    patterns: string[] = DEFAULT_IGNORE_PATTERNS,
    options: CollectFilesOptions = {}
  ): string[] {
    const respectGitIgnore = options.respectGitIgnore ?? true;
    const result: string[] = [];

    const rootIg = ignore();
    rootIg.add(patterns);

    if (respectGitIgnore) {
      const rootGitignore = path.join(dirPath, '.gitignore');
      if (fs.existsSync(rootGitignore)) {
        try {
          const content = fs.readFileSync(rootGitignore, 'utf8');
          rootIg.add(content);
        } catch {
          /* ignore read error */
        }
      }
    }

    interface IgnoreScope {
      dir: string;
      ig: ReturnType<typeof ignore>;
    }

    const initialStack: IgnoreScope[] = [{ dir: dirPath, ig: rootIg }];

    const checkIgnored = (
      entryName: string,
      fullPath: string,
      isDir: boolean,
      stack: IgnoreScope[]
    ): boolean => {
      const relFromRoot = path.relative(dirPath, fullPath).replace(/\\/g, '/');

      for (let i = stack.length - 1; i >= 0; i--) {
        const { dir: scopeDir, ig } = stack[i];
        const relFromScope = path.relative(scopeDir, fullPath).replace(/\\/g, '/');
        if (!relFromScope || relFromScope === '.') continue;

        const testPath = isDir
          ? (relFromScope.endsWith('/') ? relFromScope : `${relFromScope}/`)
          : relFromScope;
        const res = ig.test(testPath);
        if (res.unignored) {
          return false;
        }
        if (res.ignored) {
          return true;
        }

        if (isDir) {
          const resNoSlash = ig.test(relFromScope);
          if (resNoSlash.unignored) return false;
          if (resNoSlash.ignored) return true;
        }
      }

      return isPathIgnored(entryName, relFromRoot, patterns);
    };

    const walk = (dir: string, stack: IgnoreScope[]) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      let currentStack = stack;
      if (respectGitIgnore && dir !== dirPath) {
        const localGitignore = path.join(dir, '.gitignore');
        if (fs.existsSync(localGitignore)) {
          try {
            const content = fs.readFileSync(localGitignore, 'utf8');
            const localIg = ignore().add(content);
            currentStack = [...stack, { dir, ig: localIg }];
          } catch {
            /* ignore read error */
          }
        }
      }

      for (const entry of entries) {
        if (entry.name === '.git') continue;

        const fullPath = path.join(dir, entry.name);
        const isDir = entry.isDirectory();

        if (checkIgnored(entry.name, fullPath, isDir, currentStack)) {
          continue;
        }

        if (isDir) {
          walk(fullPath, currentStack);
        } else if (entry.isFile()) {
          result.push(fullPath);
        }
      }
    };

    walk(dirPath, initialStack);
    return result;
  }

  analyzeFile(absolutePath: string, relPath: string): ParsedFileInfo {
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      return {
        filePath: relPath,
        loc: 0,
        classes: [],
        methods: [],
        fileHash: '',
        codeHealth: 10.0,
        biomarkers: [],
      };
    }

    const lastModifiedAt = stat ? stat.mtimeMs : Date.now();
    const ext = path.extname(absolutePath).toLowerCase();
    const lang = CODE_EXTENSIONS[ext];

    // Fast-path: non-code files (docs, configs) don't need AST or biomarker extraction
    if (!lang) {
      let loc = 0;
      let fileHash = '';
      try {
        const buf = fs.readFileSync(absolutePath);
        if (buf.length > 0) {
          loc = 1;
          for (let i = 0; i < buf.length; i++) {
            if (buf[i] === 10) loc++;
          }
        }
        fileHash = crypto.createHash('sha256').update(buf).digest('hex');
      } catch {
        loc = 0;
      }
      return {
        filePath: relPath,
        loc,
        classes: [],
        methods: [],
        fileHash,
        lastModifiedAt,
        codeHealth: 10.0,
        biomarkers: [],
      };
    }

    // Large file guardrail (> 2MB): skip full AST extraction
    if (stat && stat.size > 2 * 1024 * 1024) {
      return {
        filePath: relPath,
        loc: Math.round(stat.size / 40),
        classes: [],
        methods: [],
        fileHash: '',
        lastModifiedAt,
        codeHealth: 5.0,
        biomarkers: [
          {
            type: 'brain_class',
            severity: 'high',
            details: `Oversized file (${(stat.size / (1024 * 1024)).toFixed(1)}MB). AST parsing skipped for performance.`,
          },
        ],
      };
    }

    let content = '';
    try {
      content = fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      return {
        filePath: relPath,
        loc: 0,
        classes: [],
        methods: [],
        fileHash: '',
        codeHealth: 10.0,
        biomarkers: [],
      };
    }

    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const lines = content.split('\n');
    const loc = lines.length;

    const { namespace, classes, methods } = this.extractStructure(lines, lang);
    const healthResult = this.codeHealthAnalyzer.analyzeFile(lines, methods, classes, lang);

    return {
      filePath: relPath,
      namespace,
      loc,
      classes,
      methods,
      fileHash,
      lastModifiedAt,
      codeHealth: healthResult.score,
      biomarkers: healthResult.biomarkers,
    };
  }

  private extractStructure(
    lines: string[],
    lang: string
  ): { namespace?: string; classes: ClassInfo[]; methods: MethodInfo[] } {
    const extractor = extractorRegistry.getExtractor(lang);
    const namespace = extractor.extractNamespace ? extractor.extractNamespace(lines) : undefined;
    const { classes, methods } = extractor.extractStructures(lines, lang);
    return { namespace, classes, methods };
  }
}
