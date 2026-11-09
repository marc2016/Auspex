# Proposal

## Why

The call diagram (`add-call-diagram-editor`) shows all functions of a scope; selecting a function only highlights its direct callers and callees. To understand one function - "which chains lead here, and what does it call further down?" - users need the diagram reduced to that function's neighborhood with a chosen depth, starting from wherever they are (diagram, Calls view, CodeLens, editor).

## What Changes

- **Focus mode** in the call diagram tab: a start function, a caller depth (upwards) and a callee depth (downwards), each 0-10 or "all" (default 2 / 2). Only functions reachable within these depths are shown, re-laid out with the existing flow layout (callers above, callees below), inside their folder/file/class frames.
- The traversal covers the **whole workspace call graph**, independent of the tab's folder scope; each function appears once (cycles are not followed twice).
- **Boundary markers**: functions at the depth limit that have further callers/callees show "+N" counts.
- `inferred` edges are traversed only when they are shown (follows the "hide inferred edges" filter). Declarative callers (XML references) appear as file frames on the caller side.
- A **warning** is shown when a focus would contain more than 300 functions, suggesting a lower depth.
- **Focus bar** in the tab: start function, two depth inputs, a button to leave the focus (back to the scope view).
- **Entry points**:
  - in the diagram: select a function, then "Focus" in the toolbar;
  - Calls view: the diagram button of the subject opens a focused diagram tab (**changed**: previously it opened the diagram of the subject's folder);
  - CodeLens: an additional "In diagram" lens above each known function;
  - editor context menu: "Auspex: Show Calls in Diagram" for the function at the cursor.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `call-diagram-editor`: focus mode (traversal, depths, boundary markers, warning, focus bar) and new entry points; the Calls view action opens a focused diagram instead of the folder diagram. Introduced by `add-call-diagram-editor`, which must be archived first.

## Impact

- Code: pure traversal in `src/analyzer/calls/` (e.g. `focus.ts`); diagram data for focused tabs uses the workspace-wide graph (`buildCallDiagramData` with scope `''`); `webview/src/utils/callDiagram/model.ts` (restrict model to a set of functions), `protocol.ts` (focus requests), `CallDiagramViewer.tsx` (focus bar, Focus button, markers, warning); `src/panels/CallDiagramPanel.ts` (focus options, focus message); `src/extension.ts` (commands `auspex.openCallDiagram` with focus argument and `auspex.focusInCallDiagram`); `src/editor/HealthCodeLensProvider.ts` (lens); `src/providers/CallsViewProvider.ts` + `webview/src/components/CallsPanel.tsx` (subject action); `package.json` (command, editor context menu), `package.nls*.json`, i18n.
- Users: one more CodeLens entry per function (governed by `auspex.codeLens.enabled`).
- Depends on `add-call-diagram-editor` and `add-call-hierarchy`.
