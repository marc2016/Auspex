import * as vscode from 'vscode';
import path from 'path';
import type { ParsedFileInfo } from '../analyzer/types';
import type { CallFunctionRef } from '../analyzer/calls/types';
import { resolveCurrentFunction, sameCurrentFunction, type CurrentFunction } from '../analyzer/calls/currentFunction';

export const LIVE_MODE_SETTING = 'calls.liveMode';
export const LIVE_CONTEXT_KEY = 'auspex.liveCalls';

/** Live mode setting (`auspex.calls.liveMode`, default on). */
export function isLiveModeEnabled(): boolean {
  return vscode.workspace.getConfiguration('auspex').get<boolean>(LIVE_MODE_SETTING, true) !== false;
}

/** Sets live mode globally (persists across restarts). */
export async function setLiveMode(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration('auspex').update(LIVE_MODE_SETTING, enabled, vscode.ConfigurationTarget.Global);
}

export interface LiveCallTrackerDeps {
  workspacePath: string;
  /** Functions of the current call graph. */
  getGraphFunctions: () => readonly CallFunctionRef[];
  /** Debounce after the last cursor change (ms). */
  debounceMs?: number;
}

type Listener<T> = (value: T) => void;

/**
 * Determines the function at the text cursor of the active editor while live mode is on and
 * notifies listeners when it changes (debounced; moves within the same function are ignored; a
 * cursor outside every function keeps the last function).
 */
export class LiveCallTracker implements vscode.Disposable {
  private _enabled: boolean;
  private _current: CurrentFunction | undefined;
  private readonly _parsed = new Map<string, ParsedFileInfo>();
  private readonly _listeners = new Set<Listener<CurrentFunction>>();
  private readonly _enabledListeners = new Set<Listener<boolean>>();
  private readonly _disposables: vscode.Disposable[] = [];
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private readonly _debounceMs: number;

  constructor(private readonly _deps: LiveCallTrackerDeps) {
    this._debounceMs = _deps.debounceMs ?? 150;
    this._enabled = isLiveModeEnabled();
    void vscode.commands.executeCommand('setContext', LIVE_CONTEXT_KEY, this._enabled);
    this._disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor === vscode.window.activeTextEditor) this.schedule();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.schedule();
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(`auspex.${LIVE_MODE_SETTING}`)) this.setEnabled(isLiveModeEnabled());
      })
    );
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** Last function at the cursor (kept while the cursor is outside functions). */
  get current(): CurrentFunction | undefined {
    return this._current;
  }

  /** Called with the new current function whenever it changes. */
  onDidChangeCurrentFunction(listener: Listener<CurrentFunction>): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Called when live mode is switched on or off. */
  onDidChangeEnabled(listener: Listener<boolean>): () => void {
    this._enabledListeners.add(listener);
    return () => this._enabledListeners.delete(listener);
  }

  /** The structure of a document was re-parsed (current, possibly unsaved, lines). */
  notifyParsed(parsed: ParsedFileInfo): void {
    this._parsed.set(parsed.filePath, parsed);
    if (this.activeFile() === parsed.filePath) this.schedule();
  }

  /** The call graph changed (scan or save): a function may now have call data. */
  notifyGraphChanged(): void {
    this.schedule();
  }

  /** Resolves immediately (exposed for tests and for switching live mode on). */
  resolveNow(): void {
    this.clearTimer();
    if (!this._enabled) return;
    const editor = vscode.window.activeTextEditor;
    const file = this.activeFile();
    if (!editor || !file) return;
    const line = editor.selection.active.line + 1;
    const next = resolveCurrentFunction(file, line, this._parsed.get(file), this._deps.getGraphFunctions());
    if (!next || sameCurrentFunction(next, this._current)) return;
    this._current = next;
    for (const l of [...this._listeners]) l(next);
  }

  dispose(): void {
    this.clearTimer();
    this._listeners.clear();
    this._enabledListeners.clear();
    while (this._disposables.length) this._disposables.pop()?.dispose();
  }

  private setEnabled(enabled: boolean): void {
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    void vscode.commands.executeCommand('setContext', LIVE_CONTEXT_KEY, enabled);
    if (enabled) {
      this._current = undefined; // re-announce the function at the cursor
      this.resolveNow();
    } else {
      this.clearTimer();
    }
    for (const l of [...this._enabledListeners]) l(enabled);
  }

  private schedule(): void {
    if (!this._enabled) return;
    this.clearTimer();
    this._timer = setTimeout(() => this.resolveNow(), this._debounceMs);
  }

  private clearTimer(): void {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  /** Workspace-relative path of the active file editor, if any. */
  private activeFile(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') return undefined;
    const rel = path.relative(this._deps.workspacePath, editor.document.uri.fsPath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
    return rel;
  }
}
