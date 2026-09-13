import * as vscode from 'vscode';
import path from 'path';
import { resolveLanguage, EXT_STRINGS } from '../i18n';

export async function openFileInEditor(
  workspacePath: string,
  relativeOrAbsolutePath: string,
  startLine?: number,
  endLine?: number
): Promise<void> {
  try {
    const fullPath = path.isAbsolute(relativeOrAbsolutePath)
      ? relativeOrAbsolutePath
      : path.join(workspacePath, relativeOrAbsolutePath);

    const uri = vscode.Uri.file(fullPath);
    const document = await vscode.workspace.openTextDocument(uri);

    const line = Math.max((startLine ?? 1) - 1, 0);
    const end = Math.max((endLine ?? startLine ?? 1) - 1, line);

    const selection = new vscode.Range(
      new vscode.Position(line, 0),
      new vscode.Position(end, 0)
    );

    await vscode.window.showTextDocument(document, {
      selection,
      preview: true,
      preserveFocus: false,
    });
  } catch (err) {
    const t = EXT_STRINGS[resolveLanguage()];
    vscode.window.showErrorMessage(t.fileOpenError(relativeOrAbsolutePath));
    console.error('[Auspex] Navigation error:', err);
  }
}
