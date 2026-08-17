import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  PipelineContext,
  PipelineStage,
  ParsedFileInfo,
  MethodInfo,
  ClassInfo,
} from '../types';
import { getDb } from '../../services/db';

export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'bin',
  'obj',
  '.next',
  'coverage',
  '__pycache__',
  '.gradle',
  'target',
  '.idea',
  '.vscode',
  '.temp_clones',
  'temp_clones',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
  'packages.lock.json',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.bundle.js',
  '*.chunk.js',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.wasm',
  '*.sqlite',
  '*.sqlite3',
  '*.db',
  '*.db-journal',
  '*.db-wal',
  '*.log',
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

export class AstStructureAnalyzerStage implements PipelineStage {
  readonly name = 'ast_parsing';

  async execute(ctx: PipelineContext): Promise<void> {
    ctx.reportProgress('ast_parsing', 'Scanning repository files…', 22);

    const patterns = this.getIgnorePatterns(ctx.repositoryId);
    const allFiles = this.collectFiles(ctx.repoPath, patterns);
    ctx.totalFiles = allFiles.length;

    ctx.reportProgress(
      'ast_parsing',
      `Found ${allFiles.length} source/config files. Starting structure analysis…`,
      25
    );

    const db = getDb();
    const results: ParsedFileInfo[] = [];
    let processed = 0;

    for (const absolutePath of allFiles) {
      if (ctx.signal.aborted) throw new Error('Scan cancelled.');

      const relPath = path.relative(ctx.repoPath, absolutePath).replace(/\\/g, '/');

      if (ctx.deletedFiles.has(relPath)) {
        continue;
      }

      if (ctx.isIncremental && !ctx.changedFiles.has(relPath)) {
        const cached = db
          .prepare('SELECT ast_data FROM file_cache WHERE repo_id = ? AND file_path = ?')
          .get(ctx.repositoryId, relPath) as { ast_data: string } | undefined;

        if (cached) {
          try {
            results.push(JSON.parse(cached.ast_data) as ParsedFileInfo);
            processed++;
            continue;
          } catch {
            /* re-parse on error */
          }
        }
      }

      const info = this.analyzeFile(absolutePath, relPath);
      results.push(info);

      db.prepare(`
        INSERT INTO file_cache (repo_id, file_path, file_hash, ast_data, loc, commit_count, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(repo_id, file_path) DO UPDATE SET
          file_hash = excluded.file_hash,
          ast_data = excluded.ast_data,
          loc = excluded.loc,
          commit_count = excluded.commit_count,
          updated_at = excluded.updated_at
      `).run(
        ctx.repositoryId,
        relPath,
        info.fileHash,
        JSON.stringify(info),
        info.loc,
        ctx.commitCounts.get(relPath) ?? 0
      );

      processed++;

      if (processed % 25 === 0 || processed === allFiles.length) {
        const percent = 25 + Math.round((processed / Math.max(allFiles.length, 1)) * 45);
        ctx.reportProgress(
          'ast_parsing',
          `Analyzing code… (${processed}/${allFiles.length})`,
          percent,
          processed,
          allFiles.length
        );
      }
    }

    for (const deletedPath of ctx.deletedFiles) {
      db.prepare('DELETE FROM file_cache WHERE repo_id = ? AND file_path = ?').run(
        ctx.repositoryId,
        deletedPath
      );
    }

    (ctx as unknown as Record<string, unknown>)['parsedFiles'] = results;
    ctx.reportProgress('ast_parsing', `Analysis complete (${results.length} files).`, 70);
  }

  private analyzeFile(absolutePath: string, relPath: string): ParsedFileInfo {
    let content = '';
    try {
      content = fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      return { filePath: relPath, loc: 0, classes: [], methods: [], fileHash: '' };
    }

    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const ext = path.extname(absolutePath).toLowerCase();
    const lines = content.split('\n');
    const loc = lines.length;

    const lang = CODE_EXTENSIONS[ext];
    if (!lang) {
      return { filePath: relPath, loc, classes: [], methods: [], fileHash };
    }

    const { namespace, classes, methods } = this.extractStructure(lines, lang);

    return { filePath: relPath, namespace, loc, classes, methods, fileHash };
  }

  private extractStructure(
    lines: string[],
    lang: string
  ): { namespace?: string; classes: ClassInfo[]; methods: MethodInfo[] } {
    const classes: ClassInfo[] = [];
    const methods: MethodInfo[] = [];
    let namespace: string | undefined;

    // ─── 1. Namespace & Package ───────────────────────────────────────────────
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

    // ─── 2. Classes & Functions ───────────────────────────────────────────────
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

      // Match Class
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

      // Match Function / Method
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

        // Find enclosing class if indent > 0
        const enclosingClass = classes.find(
          (c) => startLine >= c.startLine && endLine <= c.endLine
        );

        const methodObj: MethodInfo = {
          name: `${name}()`,
          startLine,
          endLine,
          loc: Math.max(endLine - startLine + 1, 1),
          className: enclosingClass?.name,
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
    // Class regex
    const classPattern =
      /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:public|private|protected|internal|final)?\s*(?:class|interface|struct|record)\s+([a-zA-Z0-9_$]+)/;

    // Function regexes
    const functionPatterns = [
      /(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)\s*\(/,
      /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
      /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?function/,
      /^\s*(?:(?:public|private|protected|static|async|override|virtual|readonly)\s+)*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
      /^\s*(?:(?:public|private|protected|internal|static|final|abstract|async|override|virtual)\s+)+[a-zA-Z0-9_<>[\]?]+\s+([a-zA-Z0-9_]+)\s*\([^)]*\)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      // Check for Class
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

      // Check for Function / Method
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

      // Check if inside a class
      const enclosingClass = classes.find(
        (c) => startLine >= c.startLine && endLine <= c.endLine
      );

      const methodObj: MethodInfo = {
        name: `${funcName}()`,
        startLine,
        endLine,
        loc: Math.max(endLine - startLine + 1, 1),
        className: enclosingClass?.name,
      };

      methods.push(methodObj);
      enclosingClass?.methods.push(methodObj);

      if (endLine > startLine + 1) {
        i = endLine - 1;
      }
    }
  }

  private collectFiles(dirPath: string, patterns: string[]): string[] {
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

  private getIgnorePatterns(repoId: string): string[] {
    const db = getDb();
    const repo = db
      .prepare('SELECT ignore_patterns FROM repositories WHERE id = ?')
      .get(repoId) as { ignore_patterns: string } | undefined;

    const patternSet = new Set(DEFAULT_IGNORE_PATTERNS);

    if (repo) {
      try {
        const custom = JSON.parse(repo.ignore_patterns) as string[];
        for (const p of custom) patternSet.add(p);
      } catch {
        /* ignore */
      }
    }

    return Array.from(patternSet);
  }
}
