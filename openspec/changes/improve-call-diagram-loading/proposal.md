# Proposal

## Why

While a call diagram loads, the canvas is completely empty. The only hint is a small italic text at the end of the toolbar, which is easy to miss and wraps out of sight on a narrow tab. With 3,600 functions the layout step alone takes about 4 seconds, so the tab looks broken. Two related bugs leave the canvas (almost) empty even after loading: choosing a folder restriction keeps the old zoom, so the new, much smaller diagram sits as a few tiny boxes in a corner; and a fit that runs while the canvas has no size sets the zoom to 0 and is never repeated.

## What Changes

- Show a loading indicator in the middle of the diagram canvas instead of only the toolbar text: a spinner, the current step out of three (waiting for analysis, building structure, computing layout), the number of functions once it is known, and the elapsed time. No percentage, because the layout engine reports no progress.
- Focus tabs that still wait for workspace-wide data show the indicator too (today they show nothing, or "no functions").
- During a re-layout (folder restriction, focus change, depth change, new analysis result) the previous diagram stays visible, is dimmed, and the same indicator is shown on top. The indicator appears only after a short delay so that fast re-layouts do not flash. Pan and zoom keep working underneath.
- Show the layout error and the empty state ("no functions in this area") centered in the canvas instead of in the toolbar. The large-focus warning stays in the toolbar.
- Fix: choosing, changing or clearing the folder restriction fits the view to the new layout. New analysis data alone still keeps the viewport.
- Fix: the view is never fitted while the canvas has no width or height. The fit stays pending and runs as soon as the canvas has a size.

Out of scope: the pale appearance of very large diagrams at far zoom, layout speed, and cancelling a running layout.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `call-diagram-editor`: the "Responsiveness" requirement now says where and how progress is shown; new requirements cover the loading indicator, the dimmed re-layout state, error and empty state in the canvas, refitting after a folder restriction change, and fitting only when the canvas has a size.

## Impact

- `webview/src/components/CallDiagramViewer.tsx`: canvas overlay, load-state derivation, elapsed-time timer, fit reset on folder change, deferred fit with a resize observer; toolbar status reduced to the large-focus warning.
- `webview/src/utils/callDiagram/protocol.ts`: the `layout` progress message carries the function count.
- `webview/src/utils/callDiagram/view.ts`: new pure helpers (load state, elapsed-time format, fit transform) so the logic is unit-testable without a DOM.
- `webview/src/i18n.ts`: new strings in German and English (step label, function count, elapsed time, waiting for focus data).
- Tests: `test/callDiagramView.test.ts`, `test/callDiagramWorker.test.ts`, `test/i18n.test.ts`.
- Docs: `CHANGELOG.md` (`[Unreleased]`).
- No change to the extension host, the analysis, the message protocol between extension and webview, settings or commands.
