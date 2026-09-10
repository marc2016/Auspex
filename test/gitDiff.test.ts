import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => {
  return {
    Uri: {
      file: vi.fn((filePath: string) => ({ fsPath: filePath })),
      from: vi.fn((components: any) => ({
        scheme: components.scheme,
        path: components.path,
        query: components.query,
        toString: () => `${components.scheme}:${components.path}?${components.query}`,
      })),
      parse: vi.fn((str: string) => {
        const [schemePath, query = ''] = str.split('?');
        const [scheme, ...rest] = schemePath.split(':');
        return {
          scheme,
          path: rest.join(':'),
          query,
        };
      }),
    },
    commands: {
      executeCommand: vi.fn(),
    },
    window: {
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
    },
  };
});

// Mock simple-git module
const mockGitShow = vi.fn();
const mockGitRaw = vi.fn();

vi.mock('simple-git', () => {
  return {
    simpleGit: vi.fn(() => ({
      show: mockGitShow,
      raw: mockGitRaw,
    })),
  };
});

import * as vscode from 'vscode';
import {
  AuspexGitContentProvider,
  openCommitDiffInEditor,
  AUSPEX_GIT_SCHEME,
} from '../src/utils/gitDiff';

describe('gitDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AuspexGitContentProvider', () => {
    const provider = new AuspexGitContentProvider();

    it('returns empty string for EMPTY ref', async () => {
      const uri = {
        path: '/src/file.ts',
        query: 'ref=EMPTY&ws=/workspace',
      } as vscode.Uri;

      const content = await provider.provideTextDocumentContent(uri);
      expect(content).toBe('');
      expect(mockGitShow).not.toHaveBeenCalled();
    });

    it('returns empty string if ref or workspace is missing', async () => {
      const uri1 = { path: '/src/file.ts', query: 'ref=&ws=' } as vscode.Uri;
      expect(await provider.provideTextDocumentContent(uri1)).toBe('');

      const uri2 = { path: '', query: 'ref=sha1&ws=/workspace' } as vscode.Uri;
      expect(await provider.provideTextDocumentContent(uri2)).toBe('');
    });

    it('fetches file content via simpleGit when ref is valid', async () => {
      mockGitShow.mockResolvedValueOnce('export const test = 42;\n');

      const uri = {
        path: '/src/file.ts',
        query: 'ref=c1a2b3c&ws=%2Fworkspace',
      } as vscode.Uri;

      const content = await provider.provideTextDocumentContent(uri);
      expect(content).toBe('export const test = 42;\n');
      expect(mockGitShow).toHaveBeenCalledWith(['c1a2b3c:src/file.ts']);
    });

    it('handles git show errors gracefully by returning empty string', async () => {
      mockGitShow.mockRejectedValueOnce(new Error('fatal: Path not found'));

      const uri = {
        path: '/src/missing.ts',
        query: 'ref=c1a2b3c&ws=/workspace',
      } as vscode.Uri;

      const content = await provider.provideTextDocumentContent(uri);
      expect(content).toBe('');
    });
  });

  describe('openCommitDiffInEditor', () => {
    it('opens diff editor with parent and commit URIs for a file', async () => {
      // diff-tree output
      mockGitRaw.mockImplementation((args: string[]) => {
        if (args[0] === 'diff-tree') {
          return Promise.resolve('src/file.ts\n');
        }
        if (args[0] === 'rev-parse') {
          return Promise.resolve('parent1234567\n');
        }
        return Promise.resolve('');
      });

      await openCommitDiffInEditor('/workspace', 'commit9876543', 'src/file.ts');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.objectContaining({
          scheme: AUSPEX_GIT_SCHEME,
          path: '/src/file.ts',
          query: expect.stringContaining('ref=parent1234567'),
        }),
        expect.objectContaining({
          scheme: AUSPEX_GIT_SCHEME,
          path: '/src/file.ts',
          query: expect.stringContaining('ref=commit9876543'),
        }),
        expect.stringContaining('file.ts'),
        expect.objectContaining({ preview: true, preserveFocus: false })
      );
    });

    it('handles initial commit with no parent using EMPTY ref', async () => {
      mockGitRaw.mockImplementation((args: string[]) => {
        if (args[0] === 'diff-tree') {
          return Promise.resolve('src/init.ts\n');
        }
        if (args[0] === 'rev-parse') {
          return Promise.reject(new Error('fatal: ambiguous argument HEAD^'));
        }
        return Promise.resolve('');
      });

      await openCommitDiffInEditor('/workspace', 'initcommit123', 'src/init.ts');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.objectContaining({
          query: expect.stringContaining('ref=EMPTY'),
        }),
        expect.objectContaining({
          query: expect.stringContaining('ref=initcommit123'),
        }),
        expect.stringContaining('(initial ↔ initcom)'),
        expect.anything()
      );
    });

    it('finds touched file in commit when relativeFilePath is a folder or empty', async () => {
      mockGitRaw.mockImplementation((args: string[]) => {
        if (args[0] === 'diff-tree') {
          return Promise.resolve('packages/core/index.ts\npackages/ui/button.tsx\n');
        }
        if (args[0] === 'rev-parse') {
          return Promise.resolve('parent000\n');
        }
        return Promise.resolve('');
      });

      await openCommitDiffInEditor('/workspace', 'feat123', 'packages/core');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.objectContaining({ path: '/packages/core/index.ts' }),
        expect.objectContaining({ path: '/packages/core/index.ts' }),
        expect.stringContaining('index.ts'),
        expect.anything()
      );
    });

    it('compares two arbitrary commits when baseCommitHash is provided', async () => {
      mockGitRaw.mockImplementation((args: string[]) => {
        if (args[0] === 'diff') {
          return Promise.resolve('src/logic.ts\n');
        }
        return Promise.resolve('');
      });

      await openCommitDiffInEditor(
        '/workspace',
        'targetSha111',
        'src/logic.ts',
        'baseSha000'
      );

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.objectContaining({
          scheme: AUSPEX_GIT_SCHEME,
          path: '/src/logic.ts',
          query: expect.stringContaining('ref=baseSha000'),
        }),
        expect.objectContaining({
          scheme: AUSPEX_GIT_SCHEME,
          path: '/src/logic.ts',
          query: expect.stringContaining('ref=targetSha111'),
        }),
        expect.stringContaining('logic.ts (baseSha ↔ targetS)'),
        expect.objectContaining({ preview: true, preserveFocus: false })
      );
    });
  });
});
