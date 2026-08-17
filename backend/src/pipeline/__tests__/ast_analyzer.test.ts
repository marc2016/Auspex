import { describe, it, expect, beforeEach } from 'vitest';
import { AstStructureAnalyzerStage } from '../stages/03_ast_structure_analyzer';
import type { PipelineContext, ParsedFileInfo } from '../types';
import { getDb } from '../../services/db';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('AstStructureAnalyzerStage', () => {
  const tempDir = path.join(os.tmpdir(), 'auspex_ast_test');

  beforeEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    const db = getDb();
    db.exec(`
      DELETE FROM scan_snapshots;
      DELETE FROM file_cache;
      DELETE FROM repositories;
      INSERT INTO repositories (id, name, url_or_path, is_remote)
      VALUES ('test-repo', 'Test Repo', '${tempDir}', 0);
    `);
  });

  it('parses TypeScript files and extracts methods and LOC', async () => {
    const tsCode = `
export class UserService {
  private count: number = 0;

  public async getUser(id: string) {
    console.log('Fetching user', id);
    return { id, name: 'Alice' };
  }

  deleteUser(id: string) {
    this.count--;
  }
}

export const helper = () => {
  return true;
};
`;
    fs.writeFileSync(path.join(tempDir, 'user.ts'), tsCode);

    const stage = new AstStructureAnalyzerStage();
    const ctx: PipelineContext = {
      repositoryId: 'test-repo',
      repoPath: tempDir,
      isTemporaryClone: false,
      headCommitSha: 'test123',
      isIncremental: false,
      changedFiles: new Set(),
      deletedFiles: new Set(),
      commitCounts: new Map(),
      totalFiles: 0,
      totalLoc: 0,
      signal: new AbortController().signal,
      reportProgress: () => {},
    };

    await stage.execute(ctx);

    const parsedFiles = (ctx as unknown as Record<string, unknown>)[
      'parsedFiles'
    ] as ParsedFileInfo[];

    expect(parsedFiles).toBeDefined();
    expect(parsedFiles.length).toBe(1);

    const file = parsedFiles[0];
    expect(file.filePath).toBe('user.ts');
    expect(file.loc).toBeGreaterThan(10);
    expect(file.methods.length).toBeGreaterThanOrEqual(2);

    const methodNames = file.methods.map((m) => m.name);
    expect(methodNames).toContain('getUser()');
    expect(methodNames).toContain('deleteUser()');
  });
});
