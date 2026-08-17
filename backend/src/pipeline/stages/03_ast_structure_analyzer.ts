import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { PipelineContext, PipelineStage, ParsedFileInfo, MethodInfo } from '../types';
import { getDb } from '../../services/db';

const DEFAULT_IGNORE_DIRS = new Set([
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
]);

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

/**
 * Stage 03: AST & Code Structure Analyzer
 *
 * Extracts namespaces/packages and method/function declarations with start/end lines
 * and LOC across TypeScript/JavaScript, Java, C#, Python, Go, Rust, and C/C++.
 *
 * Supports incremental caching via SQLite `file_cache`.
 */
export class AstStructureAnalyzerStage implements PipelineStage {
  readonly name = 'ast_parsing';

  async execute(ctx: PipelineContext): Promise<void> {
    ctx.reportProgress('ast_parsing', 'Scanning repository files…', 22);

    const db = getDb();
    const ignorePatterns = this.getIgnorePatterns(ctx.repositoryId);

    const allFiles = this.collectFiles(ctx.repoPath, ignorePatterns);
    ctx.totalFiles = allFiles.length;

    ctx.reportProgress('ast_parsing', `Found ${allFiles.length} files. Starting structure analysis…`, 25);

    const results: ParsedFileInfo[] = [];
    let processed = 0;

    for (const absolutePath of allFiles) {
      if (ctx.signal.aborted) throw new Error('Scan cancelled.');

      const relPath = path.relative(ctx.repoPath, absolutePath).replace(/\\/g, '/');

      if (ctx.deletedFiles.has(relPath)) {
        continue;
      }

      // Incremental: check cache
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
            // Re-parse on cache parse error
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
      return { filePath: relPath, loc: 0, methods: [], fileHash: '' };
    }

    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const ext = path.extname(absolutePath).toLowerCase();
    const lines = content.split('\n');
    const loc = lines.length;

    const lang = CODE_EXTENSIONS[ext];
    if (!lang) {
      return { filePath: relPath, loc, methods: [], fileHash };
    }

    const { namespace, methods } = this.extractStructure(lines, lang);

    return { filePath: relPath, namespace, loc, methods, fileHash };
  }

  private extractStructure(
    lines: string[],
    lang: string
  ): { namespace?: string; methods: MethodInfo[] } {
    const methods: MethodInfo[] = [];
    let namespace: string | undefined;

    // ─── 1. Namespace & Package Extraction ────────────────────────────────────
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

    // ─── 2. Method & Function Extraction ──────────────────────────────────────
    if (lang === 'python') {
      this.extractPythonFunctions(lines, methods);
    } else {
      this.extractBraceFunctions(lines, lang, methods);
    }

    return { namespace, methods };
  }

  private extractPythonFunctions(lines: string[], methods: MethodInfo[]): void {
    const fnRegex = /^(\s*)(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(fnRegex);
      if (!match) continue;

      const indent = match[1].length;
      const name = match[2];
      const startLine = i + 1;
      let endLine = startLine;

      // Find where the function ends (next line with indent <= function indent)
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (nextLine.trim().length === 0 || nextLine.trim().startsWith('#')) {
          continue;
        }
        const nextIndent = nextLine.search(/\S/);
        if (nextIndent <= indent) {
          endLine = j;
          break;
        }
        endLine = j + 1;
      }

      methods.push({
        name: `${name}()`,
        startLine,
        endLine,
        loc: Math.max(endLine - startLine + 1, 1),
      });
    }
  }

  private extractBraceFunctions(
    lines: string[],
    lang: string,
    methods: MethodInfo[]
  ): void {
    // Regexes for function / method signatures
    const functionPatterns = [
      // function foo(...) or async function foo(...)
      /(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)\s*\(/,
      // const foo = (...) => or let foo = async (...) =>
      /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
      // const foo = function(...)
      /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?function/,
      // Class method / property: foo(...) { or async foo(...) {
      /^\s*(?:(?:public|private|protected|static|async|override|virtual|readonly)\s+)*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
      // Java / C# method: public void foo(...) {
      /^\s*(?:(?:public|private|protected|internal|static|final|abstract|async|override|virtual)\s+)+[a-zA-Z0-9_<>[\]?]+\s+([a-zA-Z0-9_]+)\s*\([^)]*\)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      let funcName: string | null = null;

      for (const pattern of functionPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const candidate = match[1];
          // Filter out keywords
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

      // Match braces to find end of function
      let braceCount = 0;
      let started = false;

      for (let j = i; j < lines.length; j++) {
        const curLine = lines[j];
        for (const ch of curLine) {
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

        // Limit function span search to 1000 lines
        if (j - i > 1000) {
          endLine = j + 1;
          break;
        }
      }

      methods.push({
        name: `${funcName}()`,
        startLine,
        endLine,
        loc: Math.max(endLine - startLine + 1, 1),
      });

      // Advance loop if endLine > startLine
      if (endLine > startLine + 1) {
        i = endLine - 1;
      }
    }
  }

  private collectFiles(dirPath: string, ignorePatterns: Set<string>): string[] {
    const result: string[] = [];

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (ignorePatterns.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
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

  private getIgnorePatterns(repoId: string): Set<string> {
    const db = getDb();
    const repo = db
      .prepare('SELECT ignore_patterns FROM repositories WHERE id = ?')
      .get(repoId) as { ignore_patterns: string } | undefined;

    const patterns = new Set(DEFAULT_IGNORE_DIRS);

    if (repo) {
      try {
        const custom = JSON.parse(repo.ignore_patterns) as string[];
        for (const p of custom) patterns.add(p);
      } catch {
        /* ignore */
      }
    }

    return patterns;
  }
}
