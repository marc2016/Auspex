import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AstStructureAnalyzer, isPathIgnored } from '../src/analyzer/astAnalyzer';

describe('AstStructureAnalyzer', () => {
  let tempDir: string;
  const analyzer = new AstStructureAnalyzer();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auspex-ast-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('isPathIgnored', () => {
    const patterns = ['node_modules', 'dist', '*.min.js', '*.log', '.git', 'coverage'];

    it('matches exact directory and file names', () => {
      expect(isPathIgnored('node_modules', 'node_modules', patterns)).toBe(true);
      expect(isPathIgnored('dist', 'dist', patterns)).toBe(true);
      expect(isPathIgnored('.git', '.git', patterns)).toBe(true);
    });

    it('matches nested paths inside ignored folders', () => {
      expect(isPathIgnored('index.js', 'node_modules/pkg/index.js', patterns)).toBe(true);
      expect(isPathIgnored('bundle.js', 'dist/assets/bundle.js', patterns)).toBe(true);
      expect(isPathIgnored('config', 'src/node_modules/config', patterns)).toBe(true);
    });

    it('matches wildcard extension patterns', () => {
      expect(isPathIgnored('vendor.min.js', 'src/vendor.min.js', patterns)).toBe(true);
      expect(isPathIgnored('app.log', 'logs/2026-09-10/app.log', patterns)).toBe(true);
      expect(isPathIgnored('normal.js', 'src/normal.js', patterns)).toBe(false);
    });

    it('allows non-ignored source files', () => {
      expect(isPathIgnored('index.ts', 'src/index.ts', patterns)).toBe(false);
      expect(isPathIgnored('App.tsx', 'src/components/App.tsx', patterns)).toBe(false);
      expect(isPathIgnored('utils.py', 'scripts/utils.py', patterns)).toBe(false);
    });
  });

  describe('collectFiles', () => {
    it('recursively gathers files while skipping ignored patterns', () => {
      fs.mkdirSync(path.join(tempDir, 'src', 'components'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'node_modules', 'fake-pkg'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'dist'), { recursive: true });

      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const a = 1;');
      fs.writeFileSync(path.join(tempDir, 'src', 'components', 'Button.tsx'), 'export const Button = () => null;');
      fs.writeFileSync(path.join(tempDir, 'node_modules', 'fake-pkg', 'index.js'), 'module.exports = {};');
      fs.writeFileSync(path.join(tempDir, 'dist', 'bundle.js'), 'console.log("bundle");');

      const collected = analyzer.collectFiles(tempDir, ['node_modules', 'dist']);
      const relPaths = collected.map((p) => path.relative(tempDir, p).replace(/\\/g, '/')).sort();

      expect(relPaths).toEqual(['src/components/Button.tsx', 'src/index.ts']);
    });

    it('respects root .gitignore file by default', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'build'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'logs'), { recursive: true });

      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'build/\n*.log\nsecret.env\n');
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const a = 1;');
      fs.writeFileSync(path.join(tempDir, 'build', 'bundle.js'), 'console.log(1);');
      fs.writeFileSync(path.join(tempDir, 'logs', 'error.log'), 'err');
      fs.writeFileSync(path.join(tempDir, 'secret.env'), 'API_KEY=123');

      const collected = analyzer.collectFiles(tempDir, []);
      const relPaths = collected.map((p) => path.relative(tempDir, p).replace(/\\/g, '/')).sort();

      expect(relPaths).toEqual(['.gitignore', 'src/index.ts']);
    });

    it('supports negation rules in .gitignore (!pattern)', () => {
      fs.mkdirSync(path.join(tempDir, 'logs'), { recursive: true });

      fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\n!logs/important.log\n');
      fs.writeFileSync(path.join(tempDir, 'logs', 'test.log'), 'test');
      fs.writeFileSync(path.join(tempDir, 'logs', 'important.log'), 'keep this');
      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'console.log(1);');

      const collected = analyzer.collectFiles(tempDir, []);
      const relPaths = collected.map((p) => path.relative(tempDir, p).replace(/\\/g, '/')).sort();

      expect(relPaths).toEqual(['.gitignore', 'logs/important.log', 'main.ts']);
    });

    it('ignores .gitignore rules when respectGitIgnore is false', () => {
      fs.mkdirSync(path.join(tempDir, 'build'), { recursive: true });

      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'build/\n');
      fs.writeFileSync(path.join(tempDir, 'build', 'out.js'), 'console.log("built");');
      fs.writeFileSync(path.join(tempDir, 'app.ts'), 'export const x = 1;');

      const collected = analyzer.collectFiles(tempDir, [], { respectGitIgnore: false });
      const relPaths = collected.map((p) => path.relative(tempDir, p).replace(/\\/g, '/')).sort();

      expect(relPaths).toEqual(['.gitignore', 'app.ts', 'build/out.js']);
    });

    it('respects nested .gitignore in subdirectories', () => {
      fs.mkdirSync(path.join(tempDir, 'packages', 'client', 'gen'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'packages', 'server', 'gen'), { recursive: true });

      fs.writeFileSync(
        path.join(tempDir, 'packages', 'client', '.gitignore'),
        'gen/\n'
      );
      fs.writeFileSync(path.join(tempDir, 'packages', 'client', 'gen', 'clientGen.ts'), 'export const c = 1;');
      fs.writeFileSync(path.join(tempDir, 'packages', 'client', 'index.ts'), 'export const c = 2;');
      fs.writeFileSync(path.join(tempDir, 'packages', 'server', 'gen', 'serverGen.ts'), 'export const s = 1;');

      const collected = analyzer.collectFiles(tempDir, []);
      const relPaths = collected.map((p) => path.relative(tempDir, p).replace(/\\/g, '/')).sort();

      expect(relPaths).toEqual([
        'packages/client/.gitignore',
        'packages/client/index.ts',
        'packages/server/gen/serverGen.ts',
      ]);
    });
  });

  describe('analyzeFile TypeScript/JavaScript', () => {
    it('extracts namespaces, classes, and methods', () => {
      const code = [
        'namespace AuthModule {',
        '  export class UserService {',
        '    constructor() {',
        '      console.log("init");',
        '    }',
        '    public async login(username: string): Promise<boolean> {',
        '      return true;',
        '    }',
        '    logout = () => {',
        '      return false;',
        '    };',
        '  }',
        '}',
        'export function standaloneHelper() {',
        '  return 42;',
        '}',
      ].join('\n');

      const filePath = path.join(tempDir, 'auth.ts');
      fs.writeFileSync(filePath, code);

      const parsed = analyzer.analyzeFile(filePath, 'src/auth.ts');

      expect(parsed.filePath).toBe('src/auth.ts');
      expect(parsed.loc).toBe(16);
      expect(parsed.namespace).toBe('AuthModule');
      expect(parsed.classes.length).toBe(1);
      expect(parsed.classes[0].name).toBe('UserService');

      // Methods inside class + standalone helper
      const methodNames = parsed.methods.map((m) => m.name);
      expect(methodNames).toContain('constructor()');
      expect(methodNames).toContain('login()');
      expect(methodNames).toContain('logout()');
      expect(methodNames).toContain('standaloneHelper()');
    });
  });

  describe('analyzeFile Python', () => {
    it('extracts Python classes and methods based on indentation', () => {
      const pyCode = [
        'class DatabaseManager:',
        '    def __init__(self, conn_str):',
        '        self.conn = conn_str',
        '',
        '    async def query(self, sql):',
        '        return []',
        '',
        'def standalone_calc(a, b):',
        '    return a + b',
      ].join('\n');

      const pyPath = path.join(tempDir, 'db.py');
      fs.writeFileSync(pyPath, pyCode);

      const parsed = analyzer.analyzeFile(pyPath, 'db.py');

      expect(parsed.classes.length).toBe(1);
      expect(parsed.classes[0].name).toBe('DatabaseManager');
      expect(parsed.methods.length).toBe(3);

      const methodNames = parsed.methods.map((m) => m.name);
      expect(methodNames).toContain('__init__()');
      expect(methodNames).toContain('query()');
      expect(methodNames).toContain('standalone_calc()');
    });
  });

  describe('analyzeFile Java & C#', () => {
    it('extracts Java package and classes', () => {
      const javaCode = [
        'package com.auspex.service;',
        '',
        'public class OrderService {',
        '    public void processOrder(int id) {',
        '        System.out.println(id);',
        '    }',
        '}',
      ].join('\n');

      const javaPath = path.join(tempDir, 'OrderService.java');
      fs.writeFileSync(javaPath, javaCode);

      const parsed = analyzer.analyzeFile(javaPath, 'OrderService.java');
      expect(parsed.namespace).toBe('com.auspex.service');
      expect(parsed.classes.length).toBe(1);
      expect(parsed.classes[0].name).toBe('OrderService');
      expect(parsed.methods.length).toBe(1);
      expect(parsed.methods[0].name).toBe('processOrder()');
    });
  });

  describe('analyzeFile Fallback', () => {
    it('calculates LOC for unknown or markdown files without AST crash', () => {
      const mdPath = path.join(tempDir, 'README.md');
      fs.writeFileSync(mdPath, '# Header\n\nSome text\nAnother line.');

      const parsed = analyzer.analyzeFile(mdPath, 'README.md');
      expect(parsed.loc).toBe(4);
      expect(parsed.classes).toEqual([]);
      expect(parsed.methods).toEqual([]);
      expect(parsed.fileHash.length).toBe(64); // SHA-256
    });

    it('returns 0 LOC for unreadable/missing file', () => {
      const parsed = analyzer.analyzeFile('/non/existent/file.ts', 'file.ts');
      expect(parsed.loc).toBe(0);
      expect(parsed.fileHash).toBe('');
    });

    it('applies the 2MB guardrail to skip AST parsing on oversized files to prevent OOM', () => {
      const largeFilePath = path.join(tempDir, 'giant_bundle.ts');
      // Create a file > 2MB (2.1 MB)
      const chunk = 'console.log("data block of 100 bytes length for filling up memory safely for test! 0123456789");\n';
      const repeatCount = Math.ceil((2.1 * 1024 * 1024) / chunk.length);
      const fd = fs.openSync(largeFilePath, 'w');
      for (let i = 0; i < repeatCount; i++) {
        fs.writeSync(fd, chunk);
      }
      fs.closeSync(fd);

      const parsed = analyzer.analyzeFile(largeFilePath, 'src/giant_bundle.ts');
      expect(parsed.filePath).toBe('src/giant_bundle.ts');
      expect(parsed.classes.length).toBe(0);
      expect(parsed.methods.length).toBe(0);
      expect(parsed.codeHealth).toBe(5.0);
      const biomarker = parsed.biomarkers.find((b) => b.type === 'brain_class');
      expect(biomarker).toBeDefined();
      expect(biomarker?.details).toContain('Oversized file');
    });

    it('caches wildcard regex patterns efficiently across multiple calls', () => {
      const customPatterns = ['*.spec.js', 'vendor/*', '.cache'];
      expect(isPathIgnored('app.spec.js', 'test/app.spec.js', customPatterns)).toBe(true);
      // Repeated check hits wildcardRegexCache
      expect(isPathIgnored('other.spec.js', 'test/other.spec.js', customPatterns)).toBe(true);
      expect(isPathIgnored('main.js', 'src/main.js', customPatterns)).toBe(false);
      expect(isPathIgnored('.cache', '.cache', customPatterns)).toBe(true);
    });
  });
});

