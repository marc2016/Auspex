import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import type { TreeNode, AnalysisSnapshot } from '../analyzer/types';
import type { CallGraphService, LanguageServerMode } from '../analyzer/calls/callGraphService';
import type { CallFunctionRef } from '../analyzer/calls/types';
import { callEntriesFor, functionEntry, type CallDirection, type CallsViewState } from '../analyzer/calls/viewModel';
import { openFileInEditor } from '../utils/navigation';
import { resolveLanguage, EXT_STRINGS } from '../i18n';
import type { CurrentFunction } from '../analyzer/calls/currentFunction';

/** Language server access needed by the view (implemented with LspCallSource). */
export interface OnDemandLsp {
  queryDetailed(fn: CallFunctionRef): Promise<{ available: boolean; edges: import('../analyzer/calls/types').CallEdge[] }>;
}

export interface CallsViewDeps {
  service: CallGraphService;
  getMode: () => LanguageServerMode;
  createLsp: (functions: CallFunctionRef[]) => OnDemandLsp;
  startScan: () => void;
}

/** Sidebar view "Calls": incoming and outgoing calls of the selected function. */
export class AuspexCallsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'auspex.callsView';

  private _view?: vscode.WebviewView;
  private _selectedNode: TreeNode | null = null;
  /** Subject set from the text cursor (live mode); takes precedence over `_selectedNode` while set. */
  private _cursorSubject: CurrentFunction | null = null;
  /** Latest function at the text cursor (for the marker), independent of the subject. */
  private _currentFunction: CurrentFunction | null = null;
  private _live = false;
  private _pinned = false;
  private _snapshot: AnalysisSnapshot | null = null;
  private _lspLoading = false;
  private _nameOnly = false;
  private _queryToken = 0;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _workspacePath: string,
    private readonly _deps: CallsViewDeps
  ) {
    _deps.service.onDidChange(() => this.postState());
  }

  public get selectedNode(): TreeNode | null {
    return this._selectedNode;
  }

  public get pinned(): boolean {
    return this._pinned;
  }

  public updateSnapshot(snapshot: AnalysisSnapshot): void {
    this._snapshot = snapshot;
    this.postState();
  }

  /** Explicit selection (treemap, diagram, CodeLens). Ignored while pinned. */
  public setSelectedNode(node: TreeNode | null, reveal = true): void {
    if (this._pinned) return;
    const before = this.subjectKey();
    this._selectedNode = node;
    this._cursorSubject = null;
    this.afterSubjectChange(before);
    if (reveal && this._view) this._view.show?.(true);
  }

  /**
   * Selection distributed to all views: explicit selections set the subject; selections that only
   * follow the active editor (a file node) are ignored so the view keeps its function.
   */
  public applySelection(node: TreeNode | null, source: 'explicit' | 'editor'): void {
    if (source === 'editor') return;
    this.setSelectedNode(node, false);
  }

  /** Live mode switched on or off (the marker is shown only while live). */
  public setLive(live: boolean): void {
    if (this._live === live) return;
    this._live = live;
    if (!live) this._currentFunction = null;
    this.postState();
  }

  /** New function at the text cursor (live mode): becomes the subject unless pinned. */
  public setCurrentFunction(cf: CurrentFunction): void {
    this._live = true;
    this._currentFunction = cf;
    if (this._pinned) {
      this.postState();
      return;
    }
    const before = this.subjectKey();
    this._cursorSubject = cf;
    this.afterSubjectChange(before);
  }

  /** Pins or unpins the view; unpinning jumps to the function at the cursor while live. */
  public setPinned(pinned: boolean): void {
    if (this._pinned === pinned) return;
    this._pinned = pinned;
    void vscode.commands.executeCommand('setContext', 'auspex.callsPinned', pinned);
    if (!pinned && this._live && this._currentFunction) {
      this.setCurrentFunction(this._currentFunction);
      return;
    }
    this.postState();
  }

  private subjectKey(): string {
    if (this._cursorSubject) return `cursor:${this._cursorSubject.fnId ?? `${this._cursorSubject.file}#${this._cursorSubject.qualifiedName}?`}`;
    return `node:${this._selectedNode?.path}|${this._selectedNode?.startLine}`;
  }

  private afterSubjectChange(beforeKey: string): void {
    if (this.subjectKey() !== beforeKey) {
      this._nameOnly = false;
      void this.queryLanguageServer();
    }
    this.postState();
  }

  /** The function shown as subject, if the selected node is a known function. */
  public subjectFunction(): CallFunctionRef | undefined {
    if (this._cursorSubject) {
      return this._cursorSubject.fnId ? this._deps.service.getFunction(this._cursorSubject.fnId) : undefined;
    }
    const node = this._selectedNode;
    if (!node || node.type !== 'method' || node.startLine === undefined) return undefined;
    const file = (node.path || '').split('#')[0].replace(/\\/g, '/').replace(/^\/+/, '');
    const fn = this._deps.service.findFunctionAt(file, node.startLine);
    return fn && fn.startLine === node.startLine ? fn : undefined;
  }

  /** Current state for the webview. */
  public buildState(): CallsViewState {
    const graph = this._deps.service.graph;
    const flags = {
      pinned: this._pinned,
      live: this._live,
      currentFnId: this._live ? this._currentFunction?.fnId : undefined,
    };
    const empty = { incoming: [], outgoing: [], lspLoading: false, nameOnly: false, ...flags };
    if (!graph || !this._snapshot) return { status: 'noScan', ...empty };
    if (this._cursorSubject && !this._cursorSubject.fnId) {
      return { status: 'notAnalyzed', pendingLabel: this._cursorSubject.qualifiedName, ...empty };
    }
    const fn = this.subjectFunction();
    if (!fn) return { status: 'notFunction', ...empty };

    const tree = this._snapshot.tree ?? null;
    return {
      status: 'ready',
      subject: functionEntry(graph, tree, fn.id, null) ?? undefined,
      incoming: callEntriesFor(graph, tree, fn.id, 'incoming'),
      outgoing: callEntriesFor(graph, tree, fn.id, 'outgoing'),
      lspLoading: this._lspLoading,
      nameOnly: this._nameOnly || this._deps.getMode() === 'off',
      ...flags,
    };
  }

  private postState(): void {
    this._view?.webview.postMessage({ type: 'calls:update', payload: this.buildState() });
  }

  /** On-demand language server query for the subject; Auspex edges stay visible meanwhile. */
  private async queryLanguageServer(): Promise<void> {
    const fn = this.subjectFunction();
    const graph = this._deps.service.graph;
    if (!fn || !graph || this._deps.getMode() === 'off') {
      this._lspLoading = false;
      return;
    }
    const token = ++this._queryToken;
    this._lspLoading = true;
    this.postState();
    try {
      const result = await this._deps.createLsp(graph.functions).queryDetailed(fn);
      if (token !== this._queryToken) return;
      this._nameOnly = !result.available;
      this._deps.service.addEdges(result.edges);
    } catch {
      if (token === this._queryToken) this._nameOnly = true;
    } finally {
      if (token === this._queryToken) {
        this._lspLoading = false;
        this.postState();
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
    webviewView.webview.onDidReceiveMessage((message) => this.handleMessage(message));
  }

  /** Handles messages from the webview (exposed for tests). */
  public async handleMessage(message: any): Promise<void> {
    switch (message?.type) {
      case 'ready':
        this._view?.webview.postMessage({
          type: 'init',
          view: 'calls',
          language: resolveLanguage(),
          node: this._selectedNode,
        });
        this.postState();
        break;
      case 'calls:expand': {
        const graph = this._deps.service.graph;
        const direction: CallDirection = message.direction === 'incoming' ? 'incoming' : 'outgoing';
        const items = graph && message.id ? callEntriesFor(graph, this._snapshot?.tree ?? null, message.id, direction) : [];
        this._view?.webview.postMessage({
          type: 'calls:children',
          payload: { requestId: message.requestId, id: message.id, direction, items },
        });
        break;
      }
      case 'openFile':
        await openFileInEditor(this._workspacePath, message.filePath, message.startLine, message.endLine);
        break;
      case 'startScan':
        this._deps.startScan();
        break;
      case 'openCallDiagram':
        await vscode.commands.executeCommand(
          'auspex.openCallDiagram',
          message.focus ? { focus: message.focus } : message.scopePath ?? ''
        );
        break;
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const indexPath = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'index.html');
    const lang = resolveLanguage();
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf-8');
      html = html.replace(/(href|src)="\.\/assets\/([^"]+)"/g, (_m, attr, file) => {
        const fileUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', file));
        return `${attr}="${fileUri}"`;
      });
      html = html.replace('<head>', '<head><script>window.__AUSPEX_VIEW__ = "calls";</script>');
      return html.replace(/<html(\s+[^>]*)?>/i, `<html lang="${lang}">`);
    }
    const t = EXT_STRINGS[lang];
    const title = t.viewTitles.calls;
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><title>${title}</title></head>
      <body style="font-family: sans-serif; padding: 16px;"><h3>${title}</h3><p>${t.fallbackBuildNotice}</p></body></html>`;
  }
}
