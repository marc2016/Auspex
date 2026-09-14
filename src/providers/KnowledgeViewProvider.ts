import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import type { TreeNode, AnalysisSnapshot } from '../analyzer/types';
import { openFileInEditor } from '../utils/navigation';
import { openCommitDiffInEditor } from '../utils/gitDiff';
import { resolveLanguage, EXT_STRINGS } from '../i18n';
import { saveAuthorAliases } from '../utils/authorAliases';

export class AuspexKnowledgeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'auspex.knowledgeView';

  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private readonly _workspacePath: string;
  private readonly _onRescanRequested?: () => Promise<void>;
  private _selectedNode: TreeNode | null = null;
  private _currentSnapshot: AnalysisSnapshot | null = null;

  constructor(
    extensionUri: vscode.Uri,
    workspacePath: string,
    onRescanRequested?: () => Promise<void>
  ) {
    this._extensionUri = extensionUri;
    this._workspacePath = workspacePath;
    this._onRescanRequested = onRescanRequested;
  }

  public get selectedNode(): TreeNode | null {
    return this._selectedNode;
  }

  public updateSnapshot(snapshot: AnalysisSnapshot): void {
    this._currentSnapshot = snapshot;
    if (this._view) {
      this._view.webview.postMessage({
        type: 'snapshot:update',
        payload: snapshot,
      });
    }
  }

  public setSelectedNode(node: TreeNode | null, reveal = true): void {
    this._selectedNode = node;
    if (this._view) {
      this._view.webview.postMessage({
        type: 'node:set',
        payload: node,
      });
      if (reveal) {
        this._view.show?.(true);
      }
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this._extensionUri, 'webview'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          webviewView.webview.postMessage({
            type: 'init',
            view: 'knowledge',
            language: resolveLanguage(),
            node: this._selectedNode,
          });
          if (this._currentSnapshot) {
            webviewView.webview.postMessage({
              type: 'snapshot:update',
              payload: this._currentSnapshot,
            });
          }
          break;
        case 'openFile':
          await openFileInEditor(
            this._workspacePath,
            message.filePath,
            message.startLine,
            message.endLine
          );
          break;
        case 'openCommitDiff':
          await openCommitDiffInEditor(
            this._workspacePath,
            message.commitHash,
            message.filePath,
            message.baseCommitHash
          );
          break;
        case 'clearSelection':
          this._selectedNode = null;
          webviewView.webview.postMessage({
            type: 'node:set',
            payload: null,
          });
          break;
        case 'openExternal':
          if (message.url) {
            try {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            } catch {
              /* ignore */
            }
          }
          break;
        case 'saveAuthorAliases':
          await saveAuthorAliases(
            this._workspacePath,
            message.target,
            message.aliases,
            this._onRescanRequested
          );
          break;
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const distWebview = path.join(this._extensionUri.fsPath, 'dist', 'webview');
    const indexPath = path.join(distWebview, 'index.html');

    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf-8');

      // Replace relative links with webview URIs
      html = html.replace(/(href|src)="\.\/assets\/([^"]+)"/g, (_match, attr, file) => {
        const fileUri = webview.asWebviewUri(
          vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', file)
        );
        return `${attr}="${fileUri}"`;
      });

      // Inject view mode marker into head
      html = html.replace(
        '<head>',
        '<head><script>window.__AUSPEX_VIEW__ = "knowledge";</script>'
      );

      const lang = resolveLanguage();
      html = html.replace(/<html(\s+[^>]*)?>/i, `<html lang="${lang}">`);
      return html;
    }

    const lang = resolveLanguage();
    const t = EXT_STRINGS[lang];
    const title = t.viewTitles.knowledge;

    return `<!DOCTYPE html>
      <html lang="${lang}">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 16px; box-sizing: border-box; }
          .card { text-align: center; max-width: 320px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h3>${title}</h3>
          <p>${t.fallbackBuildNotice}</p>
        </div>
      </body>
      </html>`;
  }
}
