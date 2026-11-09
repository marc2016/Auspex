import * as vscode from 'vscode';
import path from 'path';
import type { CallEdge, CallFunctionRef } from '../../analyzer/calls/types';

export type LspDirection = 'incoming' | 'outgoing' | 'both';

export interface LspQueryOptions {
  direction?: LspDirection;
  timeoutMs?: number;
  token?: vscode.CancellationToken;
}

/**
 * Queries VS Code's call hierarchy providers (language servers) for the calls of known functions
 * and maps the results back to Auspex FunctionIds. Results that do not map to a known function in
 * the workspace are dropped. All edges are `certain` with source kind `js`.
 */
export class LspCallSource {
  private readonly byFile = new Map<string, CallFunctionRef[]>();

  constructor(
    private readonly workspacePath: string,
    functions: CallFunctionRef[]
  ) {
    for (const fn of functions) {
      const list = this.byFile.get(fn.file);
      if (list) list.push(fn);
      else this.byFile.set(fn.file, [fn]);
    }
  }

  /** Innermost known function containing a 0-based line of a file URI. */
  mapToFunction(uri: vscode.Uri, line0: number): CallFunctionRef | undefined {
    if (uri.scheme !== 'file') return undefined;
    const rel = path.relative(this.workspacePath, uri.fsPath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
    const line = line0 + 1;
    let best: CallFunctionRef | undefined;
    for (const fn of this.byFile.get(rel) ?? []) {
      if (line < fn.startLine || line > fn.endLine) continue;
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
    return best;
  }

  /** Incoming and/or outgoing calls of one function; resolves to [] if no provider is available. */
  async query(fn: CallFunctionRef, options: LspQueryOptions = {}): Promise<CallEdge[]> {
    return (await this.queryDetailed(fn, options)).edges;
  }

  /**
   * Like `query`, but also reports whether a call hierarchy provider answered for the function
   * (`available: false` if none is registered for its language, it failed or timed out).
   */
  async queryDetailed(
    fn: CallFunctionRef,
    options: LspQueryOptions = {}
  ): Promise<{ available: boolean; edges: CallEdge[] }> {
    const { direction = 'both', timeoutMs = 5000, token } = options;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<{ available: boolean; edges: CallEdge[] }>((resolve) => {
      timer = setTimeout(() => resolve({ available: false, edges: [] }), timeoutMs);
    });
    try {
      return await Promise.race([this.queryUnbounded(fn, direction, token), timeout]);
    } catch {
      return { available: false, edges: [] };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async queryUnbounded(
    fn: CallFunctionRef,
    direction: LspDirection,
    token?: vscode.CancellationToken
  ): Promise<{ available: boolean; edges: CallEdge[] }> {
    const item = await this.prepare(fn);
    if (!item) return { available: false, edges: [] };
    if (token?.isCancellationRequested) return { available: true, edges: [] };

    const edges: CallEdge[] = [];
    if (direction === 'incoming' || direction === 'both') {
      const incoming =
        (await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
          'vscode.provideIncomingCalls',
          item
        )) ?? [];
      for (const call of incoming) {
        const caller = this.mapToFunction(call.from.uri, call.from.selectionRange.start.line);
        if (caller) edges.push({ from: caller.id, to: fn.id, confidence: 'certain', source: 'js' });
      }
    }
    if (token?.isCancellationRequested) return { available: true, edges };
    if (direction === 'outgoing' || direction === 'both') {
      const outgoing =
        (await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
          'vscode.provideOutgoingCalls',
          item
        )) ?? [];
      for (const call of outgoing) {
        const callee = this.mapToFunction(call.to.uri, call.to.selectionRange.start.line);
        if (callee) edges.push({ from: fn.id, to: callee.id, confidence: 'certain', source: 'js' });
      }
    }
    return { available: true, edges };
  }

  /** Call hierarchy item at the function's name on its start line. */
  private async prepare(fn: CallFunctionRef): Promise<vscode.CallHierarchyItem | undefined> {
    const uri = vscode.Uri.file(path.join(this.workspacePath, fn.file));
    const doc = await vscode.workspace.openTextDocument(uri);
    const line0 = fn.startLine - 1;
    if (line0 < 0 || line0 >= doc.lineCount) return undefined;
    const text = doc.lineAt(line0).text;
    const segments = fn.qualifiedName.split(' > ');
    const name = segments[segments.length - 1].split('.').pop() ?? '';
    const col = Math.max(0, findNameColumn(text, name));

    const items =
      (await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        'vscode.prepareCallHierarchy',
        uri,
        new vscode.Position(line0, col)
      )) ?? [];
    return items[0];
  }
}

/** Column of `name` as a whole word in a line (first occurrence), or -1. */
export function findNameColumn(text: string, name: string): number {
  if (!name) return -1;
  const re = new RegExp(`(^|[^\\w$])${name.replace(/[$]/g, '\\$')}(?![\\w$])`);
  const m = re.exec(text);
  return m ? m.index + m[1].length : -1;
}
