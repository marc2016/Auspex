# Design

## Context

See proposal.md for motivation. Current state in the webview:

- `CallDiagramViewer.tsx` holds `data`, `focusData`, `layout`, `stage`, `error`. The layout effect calls `layoutRequestFor(...)`, sets `stage = 'model'` and hands the request to `createLayoutRunner`, which defers it with `setTimeout(0)` and runs `handleDiagramRequest`.
- `handleDiagramRequest` posts `progress: model`, builds the model synchronously, posts `progress: layout`, awaits ELK, posts `result` (or `result` with `layout: null` when there is no model). The stage `edges` exists in the type but is never posted. ELK reports no intermediate progress.
- All states (waiting, stages, empty, error, large-focus warning) are folded into one `status` string rendered as a small italic `<span>` at the end of the wrapping toolbar. The canvas (`<div ref={containerRef}>`, `position: relative`) shows nothing until the first `result`.
- While a tab is in focus mode and `focusData` has not arrived, `layoutRequestFor` returns `undefined`; `stage` stays `null` and the status reads "no functions". Between `data` arriving and the layout effect running there is also one render with `data && !stage && !layout`, which shows the empty text for a frame.
- Fit: `fittedRef` is reset only when `focus?.fnId` changes. `fit()` computes `min(clientWidth / layout.width, clientHeight / layout.height) * 0.95` and applies it with `zoom.transform`, which does not enforce `scaleExtent`; a canvas of size 0 yields scale 0 and the fit is marked as done. There is no resize handling.
- Measured with 3,600 functions in headless Chromium: about 4 s between "computing layout" and the finished diagram; folder restriction from 3,600 to 5 functions keeps scale 0.0247.
- Tests run in vitest without a DOM. Components are tested with `renderToStaticMarkup` (`test/panelsRender.test.ts`), diagram logic through pure helpers in `webview/src/utils/callDiagram/view.ts`.

## Goals / Non-Goals

**Goals:**
- One derived load state that decides what the canvas shows; no state can fall through to "nothing".
- The elapsed-time tick must not re-render the diagram SVG (thousands of nodes).
- All new logic is testable without a DOM.

**Non-Goals:**
- Real progress within the layout step, cancelling a layout, or making the layout faster.
- Changing the far-zoom appearance of large diagrams.
- Refitting on focus depth change, on new data, or on tab resize (the viewport stays the user's).
- Refreshing the culling viewport on resize (possible follow-up; the resize observer added here makes it cheap).
- Changes to the extension host or to the extension/webview message protocol.

## Decisions

### D1. Pure `loadState` helper as the single source for the canvas state
Add to `view.ts`:

```
loadState({ hasData, focusPending, stage, error, hasLayout, settledEmpty, functionCount })
  -> { kind: 'loading', step: 1 | 2 | 3, functionCount?: number }
   | { kind: 'error', message } | { kind: 'empty' } | { kind: 'ready' }
```

Order of evaluation: `stage` set -> loading (step 2 for `model`, step 3 for `layout`/`edges`); `!hasData` or `focusPending` (focus set, no `focusData`) -> loading step 1; `error` -> error; `hasLayout` -> ready; `settledEmpty` -> empty; otherwise loading step 2 (request about to start). `settledEmpty` is a new viewer state set in the runner callback (`result` with `layout === null`), so "empty" is shown only after a result said so. This removes the one-frame empty flash and the wrong "no functions" in pending focus tabs.
- A running load takes precedence over an old error, matching the spec ("neither message while a load is running").
- *Alternative*: keep extending the `status` ternary. Rejected: it is the reason states fall through today and it cannot be tested.

### D2. Function count travels with the `layout` progress message
`DiagramResponse` progress gets an optional `functionCount`; `handleDiagramRequest` counts the `function` nodes of the built model and sends it with `stage: 'layout'`. The viewer stores it next to `stage` and clears it when a new request starts.
- The count is the number of functions actually laid out (after scope, folder restriction and focus), which is what explains the waiting time.
- *Alternative*: `data.callGraph.functions.length` in the viewer. Rejected: wrong for folder restriction and focus.

### D3. `LoadingOverlay` component owns the timer, the delay and the dimming
A small component rendered inside the canvas `div`, absolutely positioned over it, `pointer-events: none`:
- Props: `step`, `functionCount`, `startedAt`, `delayMs`, `dim`, strings.
- It keeps its own 1 s tick state for the elapsed time and its own "visible after `delayMs`" state. The parent does not re-render on ticks.
- Dimming is a translucent layer in the overlay (editor background colour at about 60 % alpha) instead of an opacity change on the SVG, so the parent and its nodes are not touched.
- The viewer passes `delayMs = 0` and `dim = false` when no layout is shown, and `delayMs = 300`, `dim = true` when a previous layout is visible. `startedAt` is a ref set when `loadState` changes from non-loading to loading and kept across steps.
- Spinner: reuse the `@keyframes spin` approach already used in `App.tsx` (a `<style>` element next to the overlay), disabled under `prefers-reduced-motion`.
- Elapsed time uses a pure `formatElapsed(ms)` helper in `view.ts` ("4 s", "1:05 min").
- *Alternative*: timer state in the viewer. Rejected: a tick would re-render up to thousands of SVG nodes every second during exactly the phase where the main thread is busiest.

### D4. Error and empty state use the same canvas slot
`kind: 'error'` and `kind: 'empty'` render a centered message in the canvas (same container style as the overlay, no spinner). The toolbar `status` keeps only the large-focus warning. The strings `waiting`, `stageModel`, `stageLayout`, `empty`, `error` are reused as step and message texts; new strings: step label (`Schritt {n} von 3` / `Step {n} of 3`), function count and elapsed label. Step 1 covers both waits (analysis and focus data) with the existing `waiting` text, so no separate string is added for the focus wait.

### D5. Fit is requested explicitly and consumed by the next result
Replace `fittedRef` with a `fitPendingRef` (initially `true`). It is set to `true` when `focus?.fnId` or `folderPath` changes. The fit effect runs the fit when a layout is present, no load is running, the flag is set and the canvas has a size, then clears the flag.
- To avoid fitting the old layout (for example when a request ends in an error), the flag is turned into "fit this layout" only in the runner callback of a `result` that carries a layout; an error or an empty result leaves it pending.
- New data and depth changes do not set the flag, so "Automatic updates" (viewport kept) still holds.
- *Alternative*: add `folderPath` to the existing reset effect. Works today only because of effect ordering and dependency lists; kept implicit it is easy to break.

### D6. `fitTransform` helper and a resize observer for the deferred fit
Add `fitTransform(layoutWidth, layoutHeight, canvasWidth, canvasHeight, padding = 0.95)` to `view.ts`; it returns `null` when any of the four values is not positive, else `{ k, x, y }`. `fit()` uses it and reports whether it applied a transform; the pending flag is cleared only then.
A `ResizeObserver` on the canvas container re-runs the fit effect (through a small "canvas has size" state that changes only between zero and non-zero) so a pending fit happens when the tab gets a size. It does nothing when no fit is pending.
- *Alternative*: retry with `requestAnimationFrame` until the size is non-zero. Rejected: polls forever in a hidden tab.
- *Alternative*: clamp the scale to the zoom extent. Rejected: a diagram clamped to 0.02 in a 0 px canvas is still invisible, and the fit would still be marked done.

## Risks / Trade-offs

- [Step 2 is rarely visible: the model is built synchronously right after the `model` message] -> Accepted; the viewer sets step 2 before the deferred request, and the step exists so the sequence is honest. No artificial yield is added.
- [If ELK falls back to the main thread, the tick and the spinner freeze during layout] -> The CSS animation still runs on the compositor in most cases; the elapsed time catches up after the block. Not addressed further here.
- [The 300 ms delay hides the indicator for fast re-layouts but also delays it for slow ones] -> Small compared to multi-second layouts; first loads have no delay.
- [The translucent dim layer lowers contrast of the old diagram while the user can still pan it] -> Intended signal that the content is stale; alpha is a single constant and easy to tune.
- [`ResizeObserver` callbacks during window drags] -> The callback only compares zero/non-zero and sets state on a change.
- [Refit on folder change discards a manual zoom] -> Intended: the previous viewport refers to a different layout.

## Open Questions

- Does VS Code report a size of 0 for a retained webview in a background tab while a layout finishes? Not verified in a real Extension Development Host. The fix is correct either way (a zero-size canvas reproducibly gives zoom 0 in headless Chromium); the manual check in tasks.md records the answer.
