# Design

## Context

- Selection is distributed by `setSelectedNodeAcrossProviders(node, reveal)` in `src/extension.ts`, which feeds every sidebar provider including `AuspexCallsViewProvider.setSelectedNode`. `updateDetailsForEditor` calls it with the **file node** on every active-editor change; this is what clears the Calls view today.
- There is no `onDidChangeTextEditorSelection` listener yet.
- `syncDocumentHealth(doc)` re-parses the edited document 250 ms after each change (`AstStructureAnalyzer.analyzeSource` -> `ParsedFileInfo`) and keeps the health tree current. The call graph (`CallGraphService`) is only rebuilt on save (`refreshCallGraphAfterSave`), so its line numbers drift while editing.
- `indexFileFunctions(parsed)` (`src/analyzer/calls/functionIndex.ts`) derives `qualifiedName` and `FunctionId` (`file#qualifiedName`, `@startLine` suffix only for duplicates) from a `ParsedFileInfo`. `CallGraphService.findFunctionAt(file, line)` already returns the innermost function by line.
- `CallDiagramPanel` instances are tracked in `CallDiagramPanel.instances`; a tab enters focus mode via the `diagram:focus` message (`{ fnId, ... }`). The webview (`CallDiagramViewer.tsx`) keeps `selected`, `viewport` and a focus bar.
- Diagram clicks call `onFunctionSelected` -> `setSelectedNodeAcrossProviders`, so they also drive the Calls view.

## Goals / Non-Goals

**Goals:**
- One place that computes the "current function" and broadcasts it; views decide locally (pin, focus/scope mode) what to do with it.
- Correct mapping during unsaved edits without rebuilding the call graph on every keystroke.
- No layout work for cursor moves within the same function.

**Non-Goals:**
- Updating the treemap, Details, Health, Coupling or Knowledge views from the cursor.
- Rebuilding the call graph before save (new functions stay "not analyzed" until saved).
- Persisting pin states across restarts (diagram tabs are not restored anyway).
- Multi-cursor: only the primary selection counts.

## Decisions

### 1. `LiveCallTracker` as the single source of the current function
A new module `src/editor/liveCallTracker.ts` owns: live mode state, the selection/active-editor listeners, debounce, resolution, and an `onDidChangeCurrentFunction` event carrying `CurrentFunction = { file, qualifiedName, fnId?: FunctionId, label }` (`fnId` undefined = not analyzed). It emits only when `fnId`/`qualifiedName` actually change.
- Two consumer debounces: the tracker debounces at ~150 ms and emits once; the diagram panel applies an additional ~400 ms debounce before re-focusing (marker updates are cheap and go out immediately). This satisfies the 300 ms / 600 ms budgets in the spec.
- *Alternative*: let each view listen to the cursor itself. Rejected: duplicates resolution and debounce logic and makes "same function, no update" inconsistent.

### 2. Resolution through a fresh `ParsedFileInfo`
The tracker keeps a per-file cache of the last `ParsedFileInfo` produced by `syncDocumentHealth` (passed in via a small `notifyParsed(parsed)` hook) and, on a cursor change:
1. `indexFileFunctions(parsed)` -> innermost indexed function whose `[startLine, endLine]` contains the cursor line (smallest range).
2. Look up graph functions with the same `file` and `qualifiedName`. One hit -> that `fnId`. Several hits (duplicates) -> the one with the closest `startLine`. None -> `fnId` undefined.
3. If no parsed info exists yet for the file (e.g. unsupported extension), fall back to `CallGraphService.findFunctionAt`.
- *Alternative*: compare lines directly against the call graph. Rejected because of line drift between saves.
- *Alternative*: rebuild call edges for the file on each change. Rejected: costly, and the spec only requires correct identification, not fresh edges.
- If the document changed but the 250 ms re-parse has not run yet, the tracker re-resolves after the next `notifyParsed` for that file, so a stale lookup is corrected within one parse cycle.

### 3. Live mode state as a setting
`auspex.calls.liveMode` (boolean, default `true`, window scope) in `package.json`. The toggle command `auspex.toggleLiveCalls` flips it with `ConfigurationTarget.Global`; a context key `auspex.liveCalls` drives two title-bar commands (`auspex.liveCallsOn` / `auspex.liveCallsOff`) with different icons in `view/title` for `auspex.callsView`. Using a setting gives persistence, settings-UI discoverability and `onDidChangeConfiguration` for free.

### 4. Pin state lives in each target
- Calls view: `AuspexCallsViewProvider` gets `_pinned`; context key `auspex.callsPinned` selects a pin/unpin title-bar command pair. When pinned, `setSelectedNode` ignores updates (except the initial empty state), and `setCurrentFunction(cf)` only updates a `currentFnId` field that is posted to the webview for the marker.
- Diagram: `CallDiagramPanel` gets `_pinned`, toggled by a webview message (`diagram:setPinned`) from a pin button in the focus bar / toolbar. The panel decides per current-function event:

```
 current function cf (fnId known?)
   |
   +-- always:        post diagram:cursor { fnId | null }      (marker, cheap)
   |
   +-- pinned:        nothing else (webview shows "outside" note itself)
   +-- focus mode:    debounce 400 ms -> post diagram:focus { fnId, keep depths }
   +-- scope mode:    nothing else (webview scrolls to marker)
```
- The "outside the diagram" note and "Focus here" are computed in the webview (it knows which functions are shown); "Focus here" reuses the existing focus path and keeps `pinned`.

### 5. Editor switch no longer pushes file nodes to the Calls view
`setSelectedNodeAcrossProviders` gets a `source` argument (`'explicit' | 'editor'`). For `'editor'` the Calls view is skipped; the other providers behave as before. Treemap/diagram/CodeLens remain `'explicit'`.
- *Alternative*: make the Calls view ignore all non-function nodes. Rejected: the spec keeps the hint for an explicit treemap selection of a file.

### 6. Ordering between cursor and explicit selection
Both paths call into the Calls view; the latest call wins. Opening a file from the Calls view moves the cursor, which (live, unpinned) re-targets the view to that function — this is the intended "navigate the chain" behavior. When pinned, both paths are ignored for the subject.

### 7. Marker rendering
- Calls panel: a `cursor` flag per entry (computed in the webview by comparing entry id with `currentFnId`), rendered as a small location icon plus accent border. Lazily expanded children get the flag too.
- Diagram: a separate `cursorKey` state next to `selected`; box style uses an outline/glow color (`--vscode-editorCursor-foreground` or `--vscode-focusBorder`) without touching edge highlighting. On `diagram:cursor`, if the box rect is outside `viewport`, pan by the minimal delta (keep zoom); otherwise do nothing. `live off` posts `diagram:cursor { fnId: null }` to clear.

## Risks / Trade-offs

- [Resolution before the first parse of a newly opened file] → fallback to `findFunctionAt`, then corrected after `notifyParsed`.
- [Renamed function before save: new name not in call data] → shown as "not analyzed, save to analyze" until saved; acceptable and explicit.
- [Frequent re-layouts in big focus tabs while browsing code] → 400 ms debounce, only on function change, and the existing >300-function warning; users can pin.
- [Live mode on by default changes existing behavior] → the effect is limited to the Calls view and diagram tabs, and one click turns it off.
- [Cursor jump caused by opening from the Calls view re-targets the view] → intended; pin keeps the list stable.
- [Many open diagram tabs] → marker messages are tiny; re-focus only in unpinned focus tabs.

## Migration Plan

No data migration. New setting with default `true`; removing the feature means removing the setting and listeners. No changes to the analysis cache format.
