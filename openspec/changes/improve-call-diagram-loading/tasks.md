# Tasks

## 1. Load state and progress data

- [x] 1.1 Add `loadState(...)` to `webview/src/utils/callDiagram/view.ts` with the evaluation order from design D1; verify unit tests in `test/callDiagramView.test.ts` for: no data -> step 1, focus without focus data -> step 1, stage `model` -> step 2, stage `layout` -> step 3 with function count, data without stage/layout/result -> step 2 (no empty flash), settled empty -> empty, error without running load -> error, error with running load -> loading, layout present -> ready.
- [x] 1.2 Add `formatElapsed(ms)` to `view.ts` (seconds below one minute, `m:ss min` above); verify unit tests for 0 ms, 4,200 ms, 59,900 ms and 65,000 ms.
- [x] 1.3 Add the optional `functionCount` to the `layout` progress message in `webview/src/utils/callDiagram/protocol.ts` (count of `function` nodes in the built model, design D2); verify in `test/callDiagramWorker.test.ts` that the `layout` progress carries the count for the whole scope, for a folder restriction and for a focus request.

## 2. Loading indicator in the canvas

- [x] 2.1 Add the new strings (step label, function count, elapsed label) in German and English to `webview/src/i18n.ts`; verify `test/i18n.test.ts` passes (both languages have the same keys).
- [x] 2.2 Create the `LoadingOverlay` component (spinner, step n of 3 with step text, function count when known, elapsed time, own tick and show-delay state, optional dim layer, `pointer-events: none`, reduced-motion rule; design D3); verify a `renderToStaticMarkup` test that step 3 with 3,000 functions renders the step label, the count and no `%`, and that step 1 renders no count.
- [x] 2.3 Use `loadState` in `CallDiagramViewer.tsx`: track `settledEmpty` and `functionCount` from the runner callback, keep the load start time across steps, render `LoadingOverlay` for `loading` (no delay and no dim without a layout; 300 ms delay and dim over a previous layout), render centered messages for `error` and `empty`, and reduce the toolbar status to the large-focus warning (design D1, D4); verify `npm test` and the type check pass and a static render of the viewer without data shows step 1 in the canvas.
- [x] 2.4 Verify in headless Chromium with the scratchpad script and the 3,600-function sample: first load shows step and elapsed time in the canvas until the diagram appears; a focus tab shows the indicator while focus data is missing; a slow re-layout dims the old diagram, shows the indicator and still pans; a fast re-layout (small focus, depth change) shows neither; an empty folder scope shows the centered empty message. Keep screenshots in the scratchpad, not in the repository.

## 3. Fit fixes

- [x] 3.1 Add `fitTransform(layoutWidth, layoutHeight, canvasWidth, canvasHeight, padding)` to `view.ts`, returning `null` for any non-positive size (design D6); verify unit tests for a wide layout, a tall layout, and zero canvas width, zero canvas height and zero layout size returning `null`.
- [x] 3.2 Replace `fittedRef` with the pending-fit logic from design D5: pending at start, set on `focus?.fnId` or `folderPath` change, consumed only by a result that carries a layout, not set by new data or depth changes; `fit()` uses `fitTransform` and clears the flag only when a transform was applied; verify in headless Chromium that restricting 3,600 functions to a 5-function folder fills the canvas, clearing the restriction fits the whole diagram, and new data posted while panned keeps the transform.
- [x] 3.3 Add a `ResizeObserver` on the canvas that triggers a pending fit when the size changes from zero to non-zero and does nothing otherwise (design D6); verify in headless Chromium that a layout finishing while the canvas is hidden (size 0) is fitted and visible after it is shown, and that resizing a fitted, manually zoomed diagram keeps the transform.

## 4. Docs and integration

- [x] 4.1 Add the loading indicator and the two fixes to the `[Unreleased]` section of `CHANGELOG.md`; verify the entries exist under "Changed" and "Fixed".
- [x] 4.2 Run `npm test`, the type check and the webview build; verify all pass.
- [ ] 4.3 Manual check in the Extension Development Host: open a workspace diagram before the first scan and during a scan (steps 1 to 3 appear), switch to another tab while a large layout runs and come back (diagram is fitted; note in design.md "Open Questions" whether the hidden tab had size 0), restrict to a small folder and clear it again.
