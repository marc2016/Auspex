import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import type { AnalysisSnapshot } from '../analyzer/types';
import { buildCallDiagramData, normalizeScopePath } from '../analyzer/calls/diagramData';
import { openFileInEditor } from '../utils/navigation';
import { resolveLanguage, EXT_STRINGS } from '../i18n';
import type { CurrentFunction } from '../analyzer/calls/currentFunction';

/** Function a tab is focused on when it opens. */
export interface CallDiagramFocusTarget {
  fnId: string;
  /** Qualified function name, shown in the title and focus bar. */
  label: string;
}

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
    callbacks: CallDiagramCallbacks = {},
    focus?: CallDiagramFocusTarget
  ): CallDiagramPanel {
    const scope = normalizeScopePath(scopePath);
    const panel = vscode.window.createWebviewPanel(
      CallDiagramPanel.viewType,
      focus ? CallDiagramPanel.titleForFocus(focus.label) : CallDiagramPanel.titleFor(workspacePath, scope),
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
    const instance = new CallDiagramPanel(panel, extensionUri, workspacePath, scope, snapshot, callbacks, focus);
    CallDiagramPanel.instances.add(instance);
    return instance;
  }

  /** Delay before an unpinned focus tab re-focuses on a new function at the cursor (ms). */
  public static refocusDelayMs = 400;
  /** Live mode state and function at the cursor, shared by all tabs (also for tabs opened later). */
  private static _live = false;
  private static _current: CurrentFunction | null = null;

  /** Sends a new analysis result to every open diagram tab. */
  public static broadcastSnapshot(snapshot: AnalysisSnapshot): void {
    for (const instance of CallDiagramPanel.instances) instance.sendSnapshot(snapshot);
  }

  /** New function at the text cursor (live mode). */
  public static broadcastCurrentFunction(cf: CurrentFunction): void {
    CallDiagramPanel._live = true;
    CallDiagramPanel._current = cf;
    for (const instance of CallDiagramPanel.instances) instance.onCurrentFunction(cf);
  }

  /** Live mode switched on or off; off removes the cursor markers. */
  public static broadcastLive(live: boolean): void {
    CallDiagramPanel._live = live;
    if (!live) CallDiagramPanel._current = null;
    for (const instance of CallDiagramPanel.instances) instance.onLive(live);
  }

  public static titleFor(workspacePath: string, scope: string): string {
    const t = EXT_STRINGS[resolveLanguage()];
    return `${t.callDiagramTitle}: ${scope || path.basename(workspacePath)}`;
  }

  public static titleForFocus(label: string): string {
    return `${EXT_STRINGS[resolveLanguage()].callDiagramTitle}: ${label}`;
  }

  /** Whether the webview is in focus mode (needs workspace-wide data). */
  private _focused = false;
  /** Pinned tabs keep scope, focus and layout; only the cursor marker follows. */
  private _pinned = false;
  private _refocusTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    private readonly _workspacePath: string,
    public readonly scopePath: string,
    snapshot: AnalysisSnapshot | null,
    private readonly _callbacks: CallDiagramCallbacks,
    private readonly _initialFocus?: CallDiagramFocusTarget
  ) {
    this._snapshot = snapshot;
    this._panel.webview.html = this._getHtml(this._panel.webview);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((m) => this.handleMessage(m), null, this._disposables);
  }

  public get title(): string {
    return this._panel.title;
  }

  public get pinned(): boolean {
    return this._pinned;
  }

  private postCursor(cf: CurrentFunction | null): void {
    this._panel.webview.postMessage({
      type: 'diagram:cursor',
      payload: cf ? { fnId: cf.fnId ?? null, label: cf.qualifiedName } : { fnId: null, label: null },
    });
  }

  private postFocus(fnId: string, label: string): void {
    this._panel.webview.postMessage({ type: 'diagram:focus', payload: { fnId, label, keepDepths: true } });
  }

  private onCurrentFunction(cf: CurrentFunction): void {
    this.postCursor(cf);
    if (this._pinned || !this._focused || !cf.fnId) return;
    this.cancelRefocus();
    const fnId = cf.fnId;
    this._refocusTimer = setTimeout(() => {
      this._refocusTimer = null;
      this.postFocus(fnId, cf.qualifiedName);
    }, CallDiagramPanel.refocusDelayMs);
  }

  private onLive(live: boolean): void {
    if (live) return;
    this.cancelRefocus();
    this.postCursor(null);
  }

  private cancelRefocus(): void {
    if (this._refocusTimer) clearTimeout(this._refocusTimer);
    this._refocusTimer = null;
  }

  public sendSnapshot(snapshot: AnalysisSnapshot): void {
    this._snapshot = snapshot;
    this._panel.webview.postMessage({ type: 'diagram:data', payload: buildCallDiagramData(snapshot, this.scopePath) });
    if (this._focused) this.sendFocusData();
  }

  /** Workspace-wide data for focus mode (the traversal may leave the tab's folder scope). */
  private sendFocusData(): void {
    if (!this._snapshot) return;
    this._panel.webview.postMessage({ type: 'diagram:focusData', payload: buildCallDiagramData(this._snapshot, '') });
  }

  /** Handles messages from the webview (exposed for tests). */
  public async handleMessage(message: any): Promise<void> {
    switch (message?.type) {
      case 'ready':
        this._panel.webview.postMessage({ type: 'language:set', payload: resolveLanguage() });
        if (this._initialFocus) this._focused = true;
        if (this._snapshot) this.sendSnapshot(this._snapshot);
        else this._callbacks.onScanRequested?.();
        if (this._initialFocus) {
          this._panel.webview.postMessage({ type: 'diagram:focus', payload: this._initialFocus });
        }
        if (CallDiagramPanel._live && CallDiagramPanel._current) this.postCursor(CallDiagramPanel._current);
        break;
      case 'setPinned': {
        this._pinned = !!message.pinned;
        const cf = CallDiagramPanel._current;
        if (this._pinned) this.cancelRefocus();
        else if (CallDiagramPanel._live && this._focused && cf?.fnId) this.postFocus(cf.fnId, cf.qualifiedName);
        break;
      }
      case 'focusHere': {
        const cf = CallDiagramPanel._current;
        if (cf?.fnId) {
          this._focused = true;
          this.postFocus(cf.fnId, cf.qualifiedName);
        }
        break;
      }
      case 'requestFocusData':
        this._focused = true;
        this.sendFocusData();
        break;
      case 'focusClosed':
        this._focused = false;
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
        await vscode.commands.executeCommand('auspex.openCallDiagram', message.focus ? { focus: message.focus } : message.scopePath ?? '');
        break;
    }
  }

  public dispose(): void {
    if (!CallDiagramPanel.instances.delete(this)) return;
    this.cancelRefocus();
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
