# Proposal

## Why

The call diagram shows every function. That works for a class or a small folder, but it gives no picture of the architecture: which files and classes depend on which. Zooming out only bundles edges between frames that are still placed for thousands of functions, so the dependency flow between files is not visible and the diagram looks pale. Cyclic dependencies between files or classes, a common architecture problem, cannot be seen at all: the layout breaks cycles and draws the back edge upwards without any hint.

## What Changes

- Add a detail level to every call diagram tab: "Functions" (today's diagram), "Classes" and "Files". New tabs start at "Functions".
- At "Files", every file is one box inside its folder frames. At "Classes", every class is one box inside its file frame, and the functions of a file outside any class form one box per file. The layout places only these boxes, so calls between files and classes flow top to bottom.
- Calls between two boxes are combined into one edge labeled with the number of calls. The edge is drawn as certain when at least one of its calls is certain. Calls within one box are not drawn.
- At "Classes" and "Files", boxes in a dependency cycle and the edges forming the cycle are marked. Cycles are computed from the edges that are currently visible, so hiding inferred edges also removes cycles that exist only through inferred calls. The toolbar shows the number of cycles and lets the user step through them; each step fits the view to the cycle.
- Folder restriction, focus mode, filters, loading indicator, selection, double-click, location marker and automatic updates work at all three levels. At "Classes" and "Files", box labels are always visible; the far zoom band with bundled frame edges applies only at "Functions".
- Changing the level fits the view to the new layout.

Out of scope: remembering the level across tabs or sessions, cycle detection at the function level, and layering rules (e.g. "UI must not call storage").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `call-diagram-editor`: new requirements for the detail level, class and file boxes, combined edges, dependency cycles, cycle navigation and the location marker at the class and file level; "Nested frames", "Visual encoding", "Zoom levels", "Selection and navigation" and "Filters" are adjusted for the class and file levels.

## Impact

- `webview/src/utils/callDiagram/model.ts`: collapsing the model to the class or file level.
- `webview/src/utils/callDiagram/layout.ts`: combined edges with call counts per confidence, sizes of class and file boxes.
- `webview/src/utils/callDiagram/protocol.ts`: `level` in the layout request.
- `webview/src/utils/callDiagram/view.ts`: filters on combined edges, cycle detection, mapping of functions to boxes.
- `webview/src/components/CallDiagramViewer.tsx`: level selector, cycle counter and navigation, rendering of class/file boxes and cycle marks.
- `src/panels/CallDiagramPanel.ts` and `src/extension.ts`: selecting a file or class in the other views from the diagram.
- `webview/src/i18n.ts`, `CHANGELOG.md`.
