import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import type { AnalysisSnapshot, PipelineProgress, TreeNode } from '../analyzer/types';
import { openFileInEditor } from '../utils/navigation';
import { openCommitDiffInEditor } from '../utils/gitDiff';
import { resolveLanguage } from '../i18n';

export class TreemapPanel {
  public static currentPanel: TreemapPanel | undefined;
  public static readonly viewType = 'auspexTreemap';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _workspacePath: string;
  private _disposables: vscode.Disposable[] = [];
  private _currentSnapshot: AnalysisSnapshot | null = null;
  private _onRescanRequested?: () => Promise<void>;
  private _onNodeSelected?: (node: TreeNode | null) => void;

  public static createOrShow(
    extensionUri: vscode.Uri,
    workspacePath: string,
    initialSnapshot: AnalysisSnapshot | null,
    onRescanRequested?: () => Promise<void>,
    onNodeSelected?: (node: TreeNode | null) => void
  ): TreemapPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TreemapPanel.currentPanel) {
      TreemapPanel.currentPanel._panel.reveal(column);
      if (onNodeSelected) {
        TreemapPanel.currentPanel._onNodeSelected = onNodeSelected;
      }
      if (initialSnapshot) {
        TreemapPanel.currentPanel.sendSnapshot(initialSnapshot);
      }
      return TreemapPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      TreemapPanel.viewType,
      'Auspex Treemap',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'webview'),
        ],
      }
    );

    TreemapPanel.currentPanel = new TreemapPanel(
      panel,
      extensionUri,
      workspacePath,
      initialSnapshot,
      onRescanRequested,
      onNodeSelected
    );
    return TreemapPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspacePath: string,
    initialSnapshot: AnalysisSnapshot | null,
    onRescanRequested?: () => Promise<void>,
    onNodeSelected?: (node: TreeNode | null) => void
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspacePath = workspacePath;
    this._currentSnapshot = initialSnapshot;
    this._onRescanRequested = onRescanRequested;
    this._onNodeSelected = onNodeSelected;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'ready':
            this._panel.webview.postMessage({
              type: 'language:set',
              payload: resolveLanguage(),
            });
            if (this._currentSnapshot) {
              this.sendSnapshot(this._currentSnapshot);
            }
            break;
          case 'nodeSelected':
            if (this._onNodeSelected) {
              this._onNodeSelected(message.node ?? null);
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
          case 'rescan':
            if (this._onRescanRequested) {
              await this._onRescanRequested();
            }
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
        }
      },
      null,
      this._disposables
    );
  }

  public sendSnapshot(snapshot: AnalysisSnapshot): void {
    this._currentSnapshot = snapshot;
    this._panel.webview.postMessage({
      type: 'snapshot:update',
      payload: snapshot,
    });
  }

  public sendProgress(progress: PipelineProgress): void {
    this._panel.webview.postMessage({
      type: 'progress:update',
      payload: progress,
    });
  }

  public dispose(): void {
    TreemapPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(): void {
    this._panel.title = 'Auspex Treemap';
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
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

      const lang = resolveLanguage();
      html = html.replace(/<html(\s+[^>]*)?>/i, `<html lang="${lang}">`);
      return html;
    }

    // Fallback if webview is not built yet
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Auspex</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
          .card { text-align: center; max-width: 400px; padding: 24px; border: 1px solid var(--vscode-widget-border); border-radius: 8px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Auspex Treemap</h2>
          <p>The Webview assets have not been built yet. Please run <code>npm run build</code> in the extension folder.</p>
        </div>
      </body>
      </html>`;
  }
}
