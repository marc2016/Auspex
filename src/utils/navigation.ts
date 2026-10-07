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
    const rawEnd = Math.max((endLine ?? startLine ?? 1) - 1, line);
    const end = document.lineCount ? Math.min(rawEnd, document.lineCount - 1) : rawEnd;

    const endChar =
      typeof (document as any).lineAt === 'function'
        ? (document as any).lineAt(end).text.length
        : 0;

    const selection = new vscode.Range(
      new vscode.Position(line, 0),
      new vscode.Position(end, endChar)
    );

    const editor = await vscode.window.showTextDocument(document, {
      selection,
      preview: true,
      preserveFocus: false,
    });

    if (editor && typeof editor.revealRange === 'function') {
      const revealType =
        vscode.TextEditorRevealType?.InCenterIfOutsideViewport ??
        vscode.TextEditorRevealType?.InCenter ??
        2;
      editor.revealRange(selection, revealType);
    }
  } catch (err) {
    const t = EXT_STRINGS[resolveLanguage()];
    vscode.window.showErrorMessage(t.fileOpenError(relativeOrAbsolutePath));
    console.error('[Auspex] Navigation error:', err);
  }
}
