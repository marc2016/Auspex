import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const executeCommand = vi.fn();
const handlers: Record<string, (e: any) => void> = {};
let liveSetting = true;
const update = vi.fn(async (_key: string, value: boolean) => {
  liveSetting = value;
});
const state: { editor: any } = { editor: undefined };

vi.mock('vscode', () => ({
  commands: { executeCommand: (...a: any[]) => executeCommand(...a) },
  ConfigurationTarget: { Global: 1 },
  window: {
    get activeTextEditor() {
      return state.editor;
    },
    onDidChangeTextEditorSelection: (cb: any) => ((handlers.selection = cb), { dispose: vi.fn() }),
    onDidChangeActiveTextEditor: (cb: any) => ((handlers.active = cb), { dispose: vi.fn() }),
  },
  workspace: {
    getConfiguration: () => ({ get: (_k: string, d: any) => liveSetting ?? d, update }),
    onDidChangeConfiguration: (cb: any) => ((handlers.config = cb), { dispose: vi.fn() }),
  },
}));

import { LiveCallTracker, setLiveMode } from '../src/editor/liveCallTracker';
import { CallGraphBuilder } from '../src/analyzer/calls/callGraphBuilder';
import { parseJs, parseJsWithCalls } from './calls/helpers';

const src = [
  'function a() {', // 1
  '  return 1;', //    2
  '}', //              3
  'function b() {', // 4
  '  return 2;', //    5
  '}', //              6
  'function c() {', // 7
  '  return 3;', //    8
  '}', //              9
];
const functions = new CallGraphBuilder().build([parseJsWithCalls('src/x.js', src)]).functions;

const editorAt = (line: number, fsPath = '/ws/src/x.js') => ({
  document: { uri: { scheme: 'file', fsPath } },
  selection: { active: { line: line - 1 } },
});

function moveTo(line: number) {
  state.editor = editorAt(line);
  handlers.selection({ textEditor: state.editor });
}

describe('LiveCallTracker', () => {
  let tracker: LiveCallTracker;
  let events: any[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    liveSetting = true;
    state.editor = undefined;
    tracker = new LiveCallTracker({ workspacePath: '/ws', getGraphFunctions: () => functions, debounceMs: 150 });
    tracker.notifyParsed(parseJs('src/x.js', src));
    events = [];
    tracker.onDidChangeCurrentFunction((cf) => events.push(cf.fnId));
  });

  afterEach(() => {
    tracker.dispose();
    vi.useRealTimers();
  });

  it('emits the function at the cursor after the debounce', () => {
    moveTo(2);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(events).toEqual(['src/x.js#a']);
    expect(executeCommand).toHaveBeenCalledWith('setContext', 'auspex.liveCalls', true);
  });

  it('does not emit for moves within the same function', () => {
    moveTo(1);
    vi.advanceTimersByTime(200);
    moveTo(2);
    vi.advanceTimersByTime(200);
    moveTo(3);
    vi.advanceTimersByTime(200);
    expect(events).toEqual(['src/x.js#a']);
  });

  it('emits once for a fast pass through several functions', () => {
    for (const line of [2, 5, 8, 5, 2, 8]) {
      moveTo(line);
      vi.advanceTimersByTime(30);
    }
    vi.advanceTimersByTime(200);
    expect(events).toEqual(['src/x.js#c']);
  });

  it('keeps the last function outside functions and outside the workspace', () => {
    moveTo(5);
    vi.advanceTimersByTime(200);
    state.editor = editorAt(20);
    handlers.selection({ textEditor: state.editor });
    state.editor = editorAt(2, '/elsewhere/y.js');
    handlers.active(state.editor);
    vi.advanceTimersByTime(200);
    expect(events).toEqual(['src/x.js#b']);
    expect(tracker.current?.fnId).toBe('src/x.js#b');
  });

  it('emits nothing while live mode is off and re-announces when switched on', async () => {
    const enabled: boolean[] = [];
    tracker.onDidChangeEnabled((e) => enabled.push(e));
    await setLiveMode(false);
    expect(update).toHaveBeenCalledWith('calls.liveMode', false, 1);
    handlers.config({ affectsConfiguration: (k: string) => k === 'auspex.calls.liveMode' });
    expect(tracker.enabled).toBe(false);
    expect(executeCommand).toHaveBeenCalledWith('setContext', 'auspex.liveCalls', false);

    moveTo(2);
    vi.advanceTimersByTime(200);
    expect(events).toEqual([]);

    await setLiveMode(true);
    handlers.config({ affectsConfiguration: (k: string) => k === 'auspex.calls.liveMode' });
    expect(events).toEqual(['src/x.js#a']);
    expect(enabled).toEqual([false, true]);
  });

  it('re-resolves when the call graph changes', () => {
    const edited = [...src, 'function d() {', '  return 4;', '}'];
    tracker.notifyParsed(parseJs('src/x.js', edited));
    moveTo(11);
    vi.advanceTimersByTime(200);
    expect(events).toEqual([undefined]);
    functions.push({ id: 'src/x.js#d', file: 'src/x.js', qualifiedName: 'd', startLine: 10, endLine: 12 });
    tracker.notifyGraphChanged();
    vi.advanceTimersByTime(200);
    expect(events).toEqual([undefined, 'src/x.js#d']);
    functions.pop();
  });
});
