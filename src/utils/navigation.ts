import * as vscode from 'vscode';
import path from 'path';

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
    vscode.window.showErrorMessage(`[Auspex] Could not open file: ${relativeOrAbsolutePath}`);
    console.error('[Auspex] Navigation error:', err);
  }
}
