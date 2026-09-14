import * as vscode from 'vscode';
import path from 'path';
import type { TreeNode, BiomarkerFinding } from '../analyzer/types';
import { findFileNode } from '../utils/treeLookup';
import { resolveLanguage } from '../i18n';

const BIOMARKER_NAMES: Record<string, { de: string; en: string }> = {
  brain_method: { de: 'Brain Method (Gott-Methode)', en: 'Brain Method (God Function)' },
  bumpy_road: { de: 'Bumpy Road (Unruhiger Kontrollfluss)', en: 'Bumpy Road' },
  deep_nesting: { de: 'Tiefe Schachtelung', en: 'Deep Nesting' },
  complex_conditional: { de: 'Komplexe Bedingung', en: 'Complex Conditional' },
  nested_complexity: { de: 'Verschachtelte Komplexität', en: 'Nested Complexity' },
  large_method: { de: 'Große Methode', en: 'Large Method' },
  excess_parameters: { de: 'Zu viele Parameter', en: 'Excess Parameters' },
  brain_class: { de: 'Brain Class (Gott-Klasse)', en: 'Brain Class (God Class)' },
};

export class EditorHealthDecorator implements vscode.Disposable {
  private _healthyDecorationType: vscode.TextEditorDecorationType;
  private _warningDecorationType: vscode.TextEditorDecorationType;
  private _criticalDecorationType: vscode.TextEditorDecorationType;
  private _workspacePath: string;
  private _extensionUri: vscode.Uri;
  private _currentTree: TreeNode | null = null;

  constructor(extensionUri: vscode.Uri, workspacePath: string) {
    this._extensionUri = extensionUri;
    this._workspacePath = workspacePath;

    const healthyIconUri = vscode.Uri.joinPath(this._extensionUri, 'assets', 'gutter', 'health-healthy.svg');
    const warningIconUri = vscode.Uri.joinPath(this._extensionUri, 'assets', 'gutter', 'health-warning.svg');
    const criticalIconUri = vscode.Uri.joinPath(this._extensionUri, 'assets', 'gutter', 'health-critical.svg');

    this._healthyDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: healthyIconUri,
      gutterIconSize: 'contain',
    });

    this._warningDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: warningIconUri,
      gutterIconSize: 'contain',
    });

    this._criticalDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: criticalIconUri,
      gutterIconSize: 'contain',
    });
  }

  public updateTree(tree: TreeNode | null): void {
    this._currentTree = tree;
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateEditor(editor);
    }
  }

  public updateEditor(editor: vscode.TextEditor): void {
    if (!editor || !editor.document || editor.document.uri.scheme !== 'file') {
      return;
    }

    const config = vscode.workspace.getConfiguration('auspex');
    const gutterEnabled = config.get<boolean>('editorGutter.enabled', true);
    const showHealthy = config.get<boolean>('editorGutter.showHealthy', false);

    if (!gutterEnabled || !this._currentTree) {
      this.clearEditor(editor);
      return;
    }

    const fsPath = editor.document.uri.fsPath;
    const relPath = path.relative(this._workspacePath, fsPath).replace(/\\/g, '/');
    if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) {
      this.clearEditor(editor);
      return;
    }

    const fileNode = findFileNode(this._currentTree, relPath);
    if (!fileNode) {
      this.clearEditor(editor);
      return;
    }

    const lang = resolveLanguage();
    const isDe = lang === 'de';

    const healthyDecorations: vscode.DecorationOptions[] = [];
    const warningDecorations: vscode.DecorationOptions[] = [];
    const criticalDecorations: vscode.DecorationOptions[] = [];

    const decoratedLines = new Set<number>();

    // Collect all functions/methods (including methods in classes)
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
      if (!startLine || startLine < 1 || startLine > editor.document.lineCount) {
        continue;
      }
      const lineIdx = startLine - 1;
      decoratedLines.add(startLine);

      const score = typeof m.codeHealth === 'number' ? m.codeHealth : 10.0;
      const biomarkers = m.biomarkers || [];

      const isHealthy = score >= 9.0;
      const isProblematic = score >= 6.0 && score < 9.0;
      const statusLabel = isHealthy
        ? (isDe ? 'Gesund' : 'Healthy')
        : isProblematic
        ? (isDe ? 'Problematisch' : 'Problematic')
        : (isDe ? 'Ungesund' : 'Unhealthy');

      const statusIcon = isHealthy ? '$(heart)' : isProblematic ? '$(warning)' : '$(error)';
      const md = new vscode.MarkdownString();
      md.isTrusted = true;
      md.appendMarkdown(`### ${statusIcon}&nbsp;&nbsp;Auspex Code Health: **${score.toFixed(1)} / 10.0** (${statusLabel})\n\n`);
      md.appendMarkdown(`**${isDe ? 'Funktion' : 'Function'}:** \`${m.name}()\`\n\n`);
      md.appendMarkdown(`*${m.loc} LOC (Z. ${m.startLine}–${m.endLine})*\n\n`);

      if (biomarkers.length > 0) {
        md.appendMarkdown(`---\n\n**${isDe ? 'Erkannte Biomarker' : 'Detected Biomarkers'} (${biomarkers.length}):**\n\n`);
        for (const b of biomarkers) {
          const typeName = BIOMARKER_NAMES[b.type]?.[lang] || b.type;
          const icon = b.severity === 'high' ? '$(error)' : b.severity === 'medium' ? '$(warning)' : '$(info)';
          md.appendMarkdown(`- ${icon}&nbsp;&nbsp;**${typeName}**: ${b.details}\n`);
        }
      } else {
        md.appendMarkdown(`---\n\n*${isDe ? 'Keine Code-Biomarker erkannt (Sehr sauberer Code).' : 'No code biomarkers detected (Clean code).'}*\n`);
      }

      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(lineIdx, 0, lineIdx, 0),
        hoverMessage: md,
      };

      if (score < 6.0) {
        criticalDecorations.push(decoration);
      } else if (score < 9.0) {
        warningDecorations.push(decoration);
      } else if (showHealthy) {
        healthyDecorations.push(decoration);
      }
    }

    // Also decorate any file-level biomarkers that have specific start lines not yet decorated
    const fileBiomarkers = fileNode.biomarkers || [];
    for (const b of fileBiomarkers) {
      if (b.startLine && b.startLine >= 1 && b.startLine <= editor.document.lineCount && !decoratedLines.has(b.startLine)) {
        decoratedLines.add(b.startLine);
        const lineIdx = b.startLine - 1;
        const typeName = BIOMARKER_NAMES[b.type]?.[lang] || b.type;
        const icon = b.severity === 'high' ? '$(error)' : b.severity === 'medium' ? '$(warning)' : '$(info)';

        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.appendMarkdown(`### ${icon}&nbsp;&nbsp;Auspex Biomarker: **${typeName}**\n\n`);
        md.appendMarkdown(`${b.details}\n`);

        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(lineIdx, 0, lineIdx, 0),
          hoverMessage: md,
        };

        if (b.severity === 'high') {
          criticalDecorations.push(decoration);
        } else {
          warningDecorations.push(decoration);
        }
      }
    }

    editor.setDecorations(this._healthyDecorationType, healthyDecorations);
    editor.setDecorations(this._warningDecorationType, warningDecorations);
    editor.setDecorations(this._criticalDecorationType, criticalDecorations);
  }

  public clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this._healthyDecorationType, []);
    editor.setDecorations(this._warningDecorationType, []);
    editor.setDecorations(this._criticalDecorationType, []);
  }

  public dispose(): void {
    this._healthyDecorationType.dispose();
    this._warningDecorationType.dispose();
    this._criticalDecorationType.dispose();
  }
}
