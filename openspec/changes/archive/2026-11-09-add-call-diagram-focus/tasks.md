# Tasks

## 1. Traversal

- [x] 1.1 Implement `computeFocus()` in `src/analyzer/calls/focus.ts` (design D1); verify unit tests for the caller-chain/callee scenario, depth 0, "all", cycles, hidden inferred edges, a location caller and boundary counts (`+3` callers at the limit).

## 2. Data and layout

- [x] 2.1 Send workspace-wide focus data on demand (`diagram:focusData`) and on snapshot updates while a tab is focused (design D2); verify `test/callDiagramPanel.test.ts` that a focused tab receives data containing a caller outside its folder scope and a scope tab does not.
- [x] 2.2 Restrict `buildDiagramModel` to a set of functions and extend `DiagramRequest`/`handleDiagramRequest` with `focus` and `DiagramLayout.boundary` (design D3); verify tests that only focus nodes are laid out, callers are above callees, and boundary counts are returned.

## 3. Viewer

- [x] 3.1 Add focus state, the "Focus" toolbar action for a selected function, the focus bar (label, depth selects 0-10/all, close) and re-layout on depth or inferred-filter changes (design D4); verify webview helper tests for the depth options and that leaving focus restores the previous scope request, and a headless screenshot of a focused diagram.
- [x] 3.2 Render boundary markers and the >300-function warning, emphasize the start function; verify a unit test for the warning threshold and visually in the headless screenshot.

## 4. Entry points

- [x] 4.1 Extend `auspex.openCallDiagram` with `{ scopePath?, focus?: { file, startLine } }`, map to a `FunctionId`, post `diagram:focus` after `ready`, title focused tabs with the function name (design D5, D6); verify panel tests for the focus message and the title.
- [x] 4.2 Add command `auspex.focusInCallDiagram` with `editor/context` menu entry for JS/TS files (+ `package.nls*.json`), using the cursor line, and an information message when no function is found; verify a test of the command handler logic (extracted pure function) for both cases.
- [x] 4.3 Add the "In diagram" CodeLens per known function (governed by `auspex.codeLens.enabled`); verify `test/healthCodeLens.test.ts` for the lens command arguments and the disabled setting.
- [x] 4.4 Change the Calls view subject's diagram button to open a focused diagram; verify a provider test that the message carries the subject's file and start line.

## 5. Docs and integration

- [x] 5.1 Document focus mode and entry points in `README.md` and the `[Unreleased]` section of `CHANGELOG.md`; verify both entries exist.
- [ ] 5.2 Run `npm test`, type check and build; verify in the Extension Development Host: focus from the diagram, the Calls view, the CodeLens and the editor context menu, change depths, leave focus.
