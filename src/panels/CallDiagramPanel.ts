import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import type { AnalysisSnapshot } from '../analyzer/types';
import { buildCallDiagramData, normalizeScopePath } from '../analyzer/calls/diagramData';
import { openFileInEditor } from '../utils/navigation';
import { resolveLanguage, EXT_STRINGS } from '../i18n';

export interface CallDiagramCallbacks {
  /** A function box was selected in the diagram (file + start line). */
  onFunctionSelected?: (filePath: string, startLine: number) => void;
  /** The diagram has no data yet and asks for a scan. */
  onScanRequested?: () => void;
}

/** Editor tab "Call Diagram": functions in nested structure frames connected by calls. Multi-instance. */
export class CallDiagramPanel {
  public static readonly viewType = 'auspexCallDiagram';
  public static readonly instances = new Set<CallDiagramPanel>();

  private readonly _disposables: vscode.Disposable[] = [];
  private _snapshot: AnalysisSnapshot | null;

  /** Opens a new diagram tab for a folder scope ('' = whole workspace). */
  public static open(
    extensionUri: vscode.Uri,
    workspacePath: string,
    scopePath: string,
    snapshot: AnalysisSnapshot | null,
    callbacks: CallDiagramCallbacks = {}
  ): CallDiagramPanel {
    const scope = normalizeScopePath(scopePath);
    const panel = vscode.window.createWebviewPanel(
      CallDiagramPanel.viewType,
      CallDiagramPanel.titleFor(workspacePath, scope),
      vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'webview'),
        ],
      }
    );
    const instance = new CallDiagramPanel(panel, extensionUri, workspacePath, scope, snapshot, callbacks);
    CallDiagramPanel.instances.add(instance);
    return instance;
  }

  /** Sends a new analysis result to every open diagram tab. */
  public static broadcastSnapshot(snapshot: AnalysisSnapshot): void {
    for (const instance of CallDiagramPanel.instances) instance.sendSnapshot(snapshot);
  }

  public static titleFor(workspacePath: string, scope: string): string {
    const t = EXT_STRINGS[resolveLanguage()];
    return `${t.callDiagramTitle}: ${scope || path.basename(workspacePath)}`;
  }

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    private readonly _workspacePath: string,
    public readonly scopePath: string,
    snapshot: AnalysisSnapshot | null,
    private readonly _callbacks: CallDiagramCallbacks
  ) {
    this._snapshot = snapshot;
    this._panel.webview.html = this._getHtml(this._panel.webview);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((m) => this.handleMessage(m), null, this._disposables);
  }

  public get title(): string {
    return this._panel.title;
  }

  public sendSnapshot(snapshot: AnalysisSnapshot): void {
    this._snapshot = snapshot;
    this._panel.webview.postMessage({ type: 'diagram:data', payload: buildCallDiagramData(snapshot, this.scopePath) });
  }

  /** Handles messages from the webview (exposed for tests). */
  public async handleMessage(message: any): Promise<void> {
    switch (message?.type) {
      case 'ready':
        this._panel.webview.postMessage({ type: 'language:set', payload: resolveLanguage() });
        if (this._snapshot) this.sendSnapshot(this._snapshot);
        else this._callbacks.onScanRequested?.();
        break;
      case 'functionSelected':
        if (typeof message.filePath === 'string' && typeof message.startLine === 'number') {
          this._callbacks.onFunctionSelected?.(message.filePath, message.startLine);
        }
        break;
      case 'openFile':
        await openFileInEditor(this._workspacePath, message.filePath, message.startLine, message.endLine);
        break;
      case 'openCallDiagram':
        await vscode.commands.executeCommand('auspex.openCallDiagram', message.scopePath ?? '');
        break;
    }
  }

  public dispose(): void {
    if (!CallDiagramPanel.instances.delete(this)) return;
    this._panel.dispose();
    while (this._disposables.length) this._disposables.pop()?.dispose();
  }

  private _getHtml(webview: vscode.Webview): string {
    const indexPath = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'index.html');
    const lang = resolveLanguage();
    const marker = `<script>window.__AUSPEX_VIEW__ = "callDiagram"; window.__AUSPEX_SCOPE__ = ${JSON.stringify(this.scopePath)};</script>`;
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf-8');
      html = html.replace(/(href|src)="\.\/assets\/([^"]+)"/g, (_m, attr, file) => {
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', file));
        return `${attr}="${uri}"`;
      });
      html = html.replace('<head>', `<head>${marker}`);
      return html.replace(/<html(\s+[^>]*)?>/i, `<html lang="${lang}">`);
    }
    const t = EXT_STRINGS[lang];
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">${marker}</head>
      <body style="font-family: sans-serif; padding: 16px;"><h3>${t.callDiagramTitle}</h3><p>${t.fallbackBuildNotice}</p></body></html>`;
  }
}
