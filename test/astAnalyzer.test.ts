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
  });
});
