# Tasks

## 1. Live mode and current function

- [x] 1.1 Add the setting `auspex.calls.liveMode` (default `true`), the commands `auspex.toggleLiveCalls`, `auspex.liveCallsOn`/`auspex.liveCallsOff` with the context key `auspex.liveCalls` and the `view/title` entries for `auspex.callsView` (+ `package.nls*.json`, i18n) (design D3); verify in a test that the toggle flips the setting and the context key follows `onDidChangeConfiguration`.
- [x] 1.2 Implement the pure resolver (cursor line + cached `ParsedFileInfo` + graph functions -> `CurrentFunction`) using `indexFileFunctions`, innermost range, file + `qualifiedName` match, closest start line for duplicates, `fnId` undefined when not in the graph, `findFunctionAt` fallback (design D2); verify unit tests for nested functions, 20 inserted unsaved lines, duplicate names, an unsaved new function and a cursor outside any function (returns "unchanged").
- [x] 1.3 Implement `LiveCallTracker` in `src/editor/liveCallTracker.ts`: selection and active-editor listeners (primary cursor, `file` scheme, workspace files only), ~150 ms debounce, emit only on function change, re-resolve after `notifyParsed`, respect live mode on/off (design D1); verify tests with fake timers that moves within one function emit nothing, a fast pass through several functions emits once, and live off emits nothing.
- [x] 1.4 Wire the tracker in `src/extension.ts`: call `notifyParsed` from `syncDocumentHealth`, dispose on deactivate, forward `onDidChangeCurrentFunction` to the Calls view and all `CallDiagramPanel.instances`; verify by a test or debug log that a cursor move into another function reaches both consumers.

## 2. Calls view

- [x] 2.1 Add a `source` argument to `setSelectedNodeAcrossProviders` and skip the Calls view for `'editor'` (design D5); verify a test that an editor switch keeps the Calls view subject and an explicit treemap file selection still yields `notFunction`.
- [x] 2.2 Add `setCurrentFunction(cf)` to `AuspexCallsViewProvider`: unpinned and live -> set subject (including a `notAnalyzed` state for `fnId` undefined); always store `currentFnId` in the posted state (design D4, D6); verify `test/callsViewProvider.test.ts` for following, the not-analyzed state and that the last subject stays when no event arrives.
- [x] 2.3 Add pin state with the context key `auspex.callsPinned` and pin/unpin title-bar commands; ignore `setSelectedNode`/`setCurrentFunction` subject changes while pinned; on unpin jump to the current function when live (design D4); verify provider tests for "pinned subject stays" and "unpinning".
- [x] 2.4 Render the pin state, the not-analyzed hint and the cursor marker on matching entries (subject and expanded children) in `webview/src/components/CallsPanel.tsx` (design D7); verify a webview test or headless screenshot showing a marked callee in a pinned view.

## 3. Call diagram

- [x] 3.1 Add `_pinned` and the `diagram:setPinned` message to `CallDiagramPanel`; on each current-function event post `diagram:cursor`, and for unpinned focus tabs post `diagram:focus` with the current depths after a ~400 ms debounce; skip events without `fnId` for re-focus; unpin re-focuses when live (design D4); verify `test/callDiagramPanel.test.ts` for pinned vs. unpinned focus tabs, scope tabs (marker only) and the debounce.
- [x] 3.2 In `CallDiagramViewer.tsx` add a pin button in the focus bar and toolbar, a `cursorKey` marker style separate from `selected` without edge highlighting, and pan-into-view with minimal delta at constant zoom only when the box is outside the viewport; clear on `fnId: null` (design D7); verify a unit test for the pan computation (inside -> no move, outside -> minimal delta) and a headless screenshot with marker and selection on different boxes.
- [x] 3.3 Show the "outside the diagram" note with "Focus here" in the focus bar of pinned focus tabs and keep depths and pin when it is used; verify a webview helper test for the outside detection and a panel test that "Focus here" keeps `pinned`.

## 4. Docs and integration

- [x] 4.1 Document live mode, pin and the location marker in `README.md` and the `[Unreleased]` section of `CHANGELOG.md`; verify both entries exist.
- [x] 4.2 Run `npm test`, type check and build; verify in the Extension Development Host: the Calls view and a focus tab follow the cursor (also after inserting unsaved lines), pinned targets keep their content and show the marker, scrolling happens only for off-screen boxes, "Focus here" works, and switching live mode off stops all updates and removes markers.
