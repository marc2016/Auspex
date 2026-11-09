# Proposal

## Why

Auspex shows where code is large, unhealthy or frequently changed, but not how it is connected. A hotspot that many functions depend on is a much bigger risk than an isolated one, and understanding a change's blast radius requires knowing who calls a function and what it calls. VS Code's built-in "Show Call Hierarchy" lacks Auspex's metrics and does not resolve AMD (`define()`) modules or `this.foo = function` patterns that are common in legacy JavaScript.

## What Changes

Delivered in two stages:

**Stage 1 - per-function call tree**
- New sidebar view "Calls" (next to Coupling/Knowledge) showing incoming callers and outgoing callees of the selected function as an expandable tree.
- Each node shows Auspex metrics: Code Health badge, churn/hotspot color, LOC.
- Entry points: selecting a method in the treemap, and a new CodeLens above functions (e.g. "5 callers / 3 calls").

**Stage 2 - repository call graph**
- New chart type `callGraph` in the main panel, alongside treemap, system map and coupling graph, reusing the existing ECharts graph infrastructure.
- Default: ego graph around the selected function with adjustable depth.
- Toggle: module level (file -> file edges aggregated from function calls) as an overview.
- Node size = LOC, node color = hotspot/health; uncertain edges are drawn differently (e.g. dashed).

**Call data (shared by both stages)**
- Hybrid resolution: VS Code's Call Hierarchy API (language servers) for ES modules, CommonJS and other languages; an Auspex resolver for JavaScript AMD modules (`define([...], function (...) {})` parameter-to-module mapping), `this.x()` and `self.x()` calls.
- Edges come from pluggable **edge sources** (initially: language server, Auspex JS resolver). New sources can be added without changing the core call model or the views.
- Every edge carries a confidence (`certain` / `inferred`) and its source kind (e.g. `js`, `declarative`).
- A caller is either a known function or a location in a non-code file (file + line), so that declarative references (e.g. XML attributes naming JS handlers, see `detect-declarative-references`) can appear as callers with their own icon.
- Results are cached per file hash and computed incrementally; the initial computation runs in the background with progress.

**Open / to be validated**
- Spike on real AMD code to measure how many calls the language server resolves vs. the Auspex resolver.
- Optional: fan-in (number of callers) as an additional treemap color mode.

## Capabilities

### New Capabilities
- `call-analysis`: extracting call edges between known functions, edge confidence, caching and incremental updates.
- `call-hierarchy-view`: the "Calls" sidebar view with incoming/outgoing trees, metric annotations and entry points (treemap, CodeLens).
- `call-graph-view`: the repository call graph chart (ego graph, module level, visual encoding).

### Modified Capabilities
<!-- none: no specs exist yet -->

## Impact

- Depends on `detect-this-assigned-methods` so that `this`-assigned methods exist as graph nodes.
- `detect-declarative-references` builds on the edge-source model defined here and can be implemented after Stage 1.
- New analyzer module (pipeline step) under `src/analyzer/`, new resolver for AMD/`this` calls, extension of `src/storage/cache.ts`.
- New provider `src/providers/CallsViewProvider.ts`, view contribution and commands in `package.json` (+ `package.nls*.json`), CodeLens extension in `src/editor/HealthCodeLensProvider.ts`.
- Webview: new call tree component, new `callGraph` chart type based on `CouplingGraphViewer`.
- Performance: language server queries over the whole repo can take minutes on first run; must not block the existing scan.
- Requires language extensions to be active for LSP-based resolution; falls back to Auspex's resolver or reports "no call data" otherwise.
