import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeCommand = vi.fn();
const openTextDocument = vi.fn();

vi.mock('vscode', () => ({
  Uri: { file: vi.fn((p: string) => ({ scheme: 'file', fsPath: p })) },
  Position: vi.fn().mockImplementation((line: number, character: number) => ({ line, character })),
  commands: { executeCommand: (...args: any[]) => executeCommand(...args) },
  workspace: { openTextDocument: (...args: any[]) => openTextDocument(...args) },
}));

import { LspCallSource, findNameColumn } from '../../src/integrations/callHierarchy/lspCallSource';
import type { CallFunctionRef } from '../../src/analyzer/calls/types';

const WS = '/ws';
const fns: CallFunctionRef[] = [
  { id: 'src/a.ts#save', file: 'src/a.ts', qualifiedName: 'save', startLine: 1, endLine: 5 },
  { id: 'src/b.ts#Store.persist', file: 'src/b.ts', qualifiedName: 'Store.persist', startLine: 3, endLine: 8 },
  { id: 'src/c.ts#submit', file: 'src/c.ts', qualifiedName: 'submit', startLine: 10, endLine: 20 },
];
const item = (file: string, line0: number) => ({
  uri: { scheme: 'file', fsPath: file },
  selectionRange: { start: { line: line0, character: 0 } },
});

describe('LspCallSource', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    openTextDocument.mockReset();
    openTextDocument.mockResolvedValue({ lineCount: 50, lineAt: () => ({ text: 'export function save() {' }) });
  });

  it('maps incoming and outgoing call hierarchy items to known functions', async () => {
    const prepared = item('/ws/src/a.ts', 0);
    executeCommand.mockImplementation(async (cmd: string, ...args: any[]) => {
      if (cmd === 'vscode.prepareCallHierarchy') {
        expect(args[1]).toEqual({ line: 0, character: 16 });
        return [prepared];
      }
      if (cmd === 'vscode.provideIncomingCalls') return [{ from: item('/ws/src/c.ts', 11) }];
      if (cmd === 'vscode.provideOutgoingCalls') return [{ to: item('/ws/src/b.ts', 4) }];
      return undefined;
    });

    const source = new LspCallSource(WS, fns);
    const edges = await source.query(fns[0]);
    expect(edges).toEqual([
      { from: 'src/c.ts#submit', to: 'src/a.ts#save', confidence: 'certain', source: 'js' },
      { from: 'src/a.ts#save', to: 'src/b.ts#Store.persist', confidence: 'certain', source: 'js' },
    ]);
  });

  it('drops items outside the workspace or outside known functions', async () => {
    executeCommand.mockImplementation(async (cmd: string) => {
      if (cmd === 'vscode.prepareCallHierarchy') return [item('/ws/src/a.ts', 0)];
      if (cmd === 'vscode.provideIncomingCalls') {
        return [{ from: item('/other/lib.ts', 3) }, { from: item('/ws/src/c.ts', 40) }];
      }
      return [{ to: item('/ws/node_modules/x/index.d.ts', 1) }];
    });
    const edges = await new LspCallSource(WS, fns).query(fns[0]);
    expect(edges).toEqual([]);
  });

  it('returns no edges when no call hierarchy provider is available', async () => {
    executeCommand.mockResolvedValue(undefined);
    expect(await new LspCallSource(WS, fns).query(fns[0])).toEqual([]);
  });

  it('returns no edges when the provider fails or times out', async () => {
    executeCommand.mockRejectedValueOnce(new Error('provider crashed'));
    expect(await new LspCallSource(WS, fns).query(fns[0])).toEqual([]);

    executeCommand.mockImplementation(() => new Promise(() => {}));
    expect(await new LspCallSource(WS, fns).query(fns[0], { timeoutMs: 20 })).toEqual([]);
  });

  it('stops after preparing when cancelled', async () => {
    executeCommand.mockResolvedValue([item('/ws/src/a.ts', 0)]);
    const edges = await new LspCallSource(WS, fns).query(fns[0], { token: { isCancellationRequested: true } as any });
    expect(edges).toEqual([]);
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  it('queries only the requested direction', async () => {
    executeCommand.mockImplementation(async (cmd: string) =>
      cmd === 'vscode.prepareCallHierarchy' ? [item('/ws/src/a.ts', 0)] : []
    );
    await new LspCallSource(WS, fns).query(fns[0], { direction: 'outgoing' });
    expect(executeCommand.mock.calls.map((c) => c[0])).toEqual([
      'vscode.prepareCallHierarchy',
      'vscode.provideOutgoingCalls',
    ]);
  });
});

describe('findNameColumn', () => {
  it('finds whole-word names', () => {
    expect(findNameColumn('  this.add = function () {', 'add')).toBe(7);
    expect(findNameColumn('function readd() { add(); }', 'add')).toBe(19);
    expect(findNameColumn('x', 'missing')).toBe(-1);
  });
});
