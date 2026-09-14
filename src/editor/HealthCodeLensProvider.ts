import * as vscode from 'vscode';
import path from 'path';
import type { TreeNode } from '../analyzer/types';
import { findFileNode } from '../utils/treeLookup';

export class HealthCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private _workspacePath: string;
  private _currentTree: TreeNode | null = null;

  constructor(workspacePath: string) {
    this._workspacePath = workspacePath;
  }

  public updateTree(tree: TreeNode | null): void {
    this._currentTree = tree;
    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (!this._currentTree || document.uri.scheme !== 'file') {
      return [];
    }

    const config = vscode.workspace.getConfiguration('auspex');
    const enabled = config.get<boolean>('codeLens.enabled', true);
    if (!enabled) {
      return [];
    }

    const fsPath = document.uri.fsPath;
    const relPath = path.relative(this._workspacePath, fsPath).replace(/\\/g, '/');
    if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) {
      return [];
    }

    const fileNode = findFileNode(this._currentTree, relPath);
    if (!fileNode) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];

    const collectMethods = (node: TreeNode): TreeNode[] => {
      const result: TreeNode[] = [];
      if (node.type === 'method' && node.startLine !== undefined) {
        result.push(node);
      }
      if (node.children) {
        for (const child of node.children) {
          result.push(...collectMethods(child));
        }
      }
      return result;
    };

    const methods = collectMethods(fileNode);

    for (const m of methods) {
      const startLine = m.startLine;
      if (!startLine || startLine < 1 || startLine > document.lineCount) {
        continue;
      }

      const score = typeof m.codeHealth === 'number' ? m.codeHealth : 10.0;
      const biomarkers = m.biomarkers || [];

      const icon = score >= 9.0 ? '$(heart)' : score >= 6.0 ? '$(warning)' : '$(error)';
      const bioInfo = biomarkers.length > 0 ? ` (${biomarkers.length} Biomarker)` : '';
      const title = `${icon}   Health: ${score.toFixed(1)}/10${bioInfo}`;

      const range = new vscode.Range(startLine - 1, 0, startLine - 1, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title,
          command: 'auspex.focusDetailsView',
          tooltip: 'Auspex Details öffnen',
        })
      );
    }

    return lenses;
  }

  public dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
