import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// Mock vscode module
vi.mock('vscode', () => {
  return {
    Uri: {
      file: vi.fn((filePath: string) => ({ fsPath: filePath })),
    },
    workspace: {
      openTextDocument: vi.fn(),
    },
    window: {
      showTextDocument: vi.fn(),
      showErrorMessage: vi.fn(),
    },
    Range: vi.fn().mockImplementation((start, end) => ({ start, end })),
    Position: vi.fn().mockImplementation((line, character) => ({ line, character })),
  };
});

import * as vscode from 'vscode';
import { openFileInEditor } from '../src/utils/navigation';

describe('openFileInEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a relative file path joined with workspace root', async () => {
    const mockDoc = { uri: { fsPath: '/workspace/src/foo.ts' } };
    (vscode.workspace.openTextDocument as any).mockResolvedValue(mockDoc);

    await openFileInEditor('/workspace', 'src/foo.ts', 10, 20);

    const expectedPath = path.join('/workspace', 'src/foo.ts');
    expect(vscode.Uri.file).toHaveBeenCalledWith(expectedPath);
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(mockDoc, expect.objectContaining({
      preview: true,
      preserveFocus: false,
    }));
  });

  it('opens an absolute file path directly without double-prefixing workspace', async () => {
    const mockDoc = { uri: { fsPath: '/workspace/other/file.ts' } };
    (vscode.workspace.openTextDocument as any).mockResolvedValue(mockDoc);

    await openFileInEditor('/workspace', '/workspace/other/file.ts', 5);

    expect(vscode.Uri.file).toHaveBeenCalledWith('/workspace/other/file.ts');
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
  });

  it('correctly maps 1-indexed startLine and endLine to 0-indexed positions', async () => {
    const mockDoc = { uri: { fsPath: '/workspace/main.ts' } };
    (vscode.workspace.openTextDocument as any).mockResolvedValue(mockDoc);

    await openFileInEditor('/workspace', 'main.ts', 15, 25);

    expect(vscode.Position).toHaveBeenCalledWith(14, 0);
    expect(vscode.Position).toHaveBeenCalledWith(24, 0);
  });

  it('shows error message and logs error when document fails to open', async () => {
    (vscode.workspace.openTextDocument as any).mockRejectedValue(new Error('File not found'));

    await openFileInEditor('/workspace', 'missing.ts');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Could not open file: missing.ts')
    );
  });
});
