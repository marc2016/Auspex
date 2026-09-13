import * as vscode from 'vscode';
import path from 'path';
import { simpleGit } from 'simple-git';
import { resolveLanguage, EXT_STRINGS } from '../i18n';

export const AUSPEX_GIT_SCHEME = 'auspex-git';

export class AuspexGitContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    try {
      const filePath = uri.path.replace(/^\/+/, '');
      const params = new URLSearchParams(uri.query);
      const ref = params.get('ref');
      const ws = params.get('ws');

      if (!ref || ref === 'EMPTY' || !ws || !filePath) {
        return '';
      }

      const git = simpleGit(ws);
      const content = await git.show([`${ref}:${filePath}`]);
      return content;
    } catch {
      return '';
    }
  }
}

export async function openCommitDiffInEditor(
  workspacePath: string,
  commitHash: string,
  relativeFilePath?: string,
  baseCommitHash?: string
): Promise<void> {
  try {
    const git = simpleGit(workspacePath);
    let targetFile = relativeFilePath?.trim().replace(/\\/g, '/').replace(/^\/+/, '') || '';

    // Retrieve touched files in this commit or between the two commits
    const diffArgs = baseCommitHash
      ? ['diff', '--name-only', baseCommitHash, commitHash]
      : ['diff-tree', '--no-commit-id', '--name-only', '-r', commitHash];

    const touchedFilesRaw = await git.raw(diffArgs).catch(() => '');
    const touchedFiles = touchedFilesRaw
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    if (!targetFile || !touchedFiles.includes(targetFile)) {
      if (targetFile) {
        // Find first file in this commit matching the folder path
        const match = touchedFiles.find((f) => f.startsWith(targetFile));
        if (match) {
          targetFile = match;
        } else if (touchedFiles.length > 0) {
          targetFile = touchedFiles[0];
        }
      } else if (touchedFiles.length > 0) {
        targetFile = touchedFiles[0];
      }
    }

    if (!targetFile) {
      const t = EXT_STRINGS[resolveLanguage()];
      vscode.window.showInformationMessage(t.noChangedFilesFound);
      return;
    }

    let leftRef: string;
    let parentShort: string;

    if (baseCommitHash) {
      leftRef = baseCommitHash;
      parentShort = baseCommitHash.slice(0, 7);
    } else {
      // Determine parent commit
      const parent = await git
        .raw(['rev-parse', `${commitHash}^`])
        .then((s) => s.trim())
        .catch(() => null);

      leftRef = parent ?? 'EMPTY';
      parentShort = parent ? parent.slice(0, 7) : 'initial';
    }

    const rightRef = commitHash;

    const leftUri = vscode.Uri.from({
      scheme: AUSPEX_GIT_SCHEME,
      path: `/${targetFile}`,
      query: `ref=${encodeURIComponent(leftRef)}&ws=${encodeURIComponent(workspacePath)}`,
    });

    const rightUri = vscode.Uri.from({
      scheme: AUSPEX_GIT_SCHEME,
      path: `/${targetFile}`,
      query: `ref=${encodeURIComponent(rightRef)}&ws=${encodeURIComponent(workspacePath)}`,
    });

    const shortSha = commitHash.slice(0, 7);
    const fileName = path.basename(targetFile);
    const title = `${fileName} (${parentShort} ↔ ${shortSha})`;

    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
      preview: true,
      preserveFocus: false,
    });
  } catch (err) {
    const t = EXT_STRINGS[resolveLanguage()];
    vscode.window.showErrorMessage(
      t.diffOpenError(err instanceof Error ? err.message : String(err))
    );
    console.error('[Auspex] Diff error:', err);
  }
}
