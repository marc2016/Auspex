# Proposal

## Why

The Calls view and the call diagram only change their subject through explicit actions (treemap, CodeLens, diagram, context menu). Working in the editor does not update them, and it even clears them: switching files pushes the file node to the Calls view, which then shows "select a function". Users want the call information to follow the function they are working in, and to hold a view in place while they keep navigating.

## What Changes

- **Live mode**: a global switch. While it is on, moving the text cursor (click, keyboard, jumps such as Go to Definition) into a function makes that function the subject of the Calls view and of every open call diagram tab, after a short debounce. Mouse hover does not count. The innermost function at the cursor wins (nested functions).
- The cursor is matched to a call graph function by **file + qualified name** via the freshly re-parsed health tree, so unsaved edits that shift lines still resolve to the right function. A function that is not in the call graph yet (new, unsaved) shows a "save to analyze" state.
- A cursor outside any function keeps the last subject.
- **Pin** per target: the Calls view and each call diagram tab can be pinned. A pinned target keeps its content; selections from the treemap, the diagram, CodeLens and the cursor no longer replace its subject or focus.
- **Location marker ("you are here")**: while live mode is on, the function at the cursor is marked in pinned targets as well:
  - pinned diagram: the function's box gets a marker, distinct from the click selection; it is scrolled into view only when it lies outside the viewport (zoom unchanged). If the function is not in the diagram, the focus bar says so and offers "Focus here".
  - pinned Calls view: entries of that function in the incoming/outgoing trees are marked.
- **Diagram behavior when not pinned**: a tab in focus mode re-focuses on the cursor function (keeping its depths); a scope (non-focus) tab only marks and scrolls to the function, without a new layout.
- **Changed**: switching the active editor no longer replaces the Calls view subject with a file node; the Calls view keeps its last function. Explicitly selecting a non-function in the treemap still shows the hint.

## Capabilities

### New Capabilities
- `call-live-tracking`: the live mode switch, cursor-to-function resolution (innermost function, name-based mapping, debounce, outside-function and unknown-function behavior) and the distribution of the current function to the call views.

### Modified Capabilities
- `call-hierarchy-view`: pin, following the live function, location marker in pinned state, editor switches no longer clearing the subject.
- `call-diagram-editor`: pin per tab, following the live function (re-focus in focus mode, mark in scope mode), location marker with scroll-into-view, "not in diagram" hint with "Focus here".

## Impact

- Code: new `src/editor/` or `src/analyzer/calls/` module for cursor tracking (selection listener, debounce, resolution against the health tree and `CallGraphService`); `src/extension.ts` (wiring, Live command and context key, no file node to the Calls view on editor switch); `src/providers/CallsViewProvider.ts` + `webview/src/components/CallsPanel.tsx` (pin, marker); `src/panels/CallDiagramPanel.ts` + `webview/src/components/CallDiagramViewer.tsx` (pin in focus bar/toolbar, live updates, marker, scroll, hint); `package.json` (setting, commands, view title buttons), `package.nls*.json`, i18n.
- Users: live mode is on by default, so the Calls view now reacts to the cursor; it can be switched off.
- Depends on the archived call hierarchy and call diagram changes (specs `call-hierarchy-view`, `call-diagram-editor`).
