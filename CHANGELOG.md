# Change Log

All notable changes to the **Auspex** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.4.0] - 2026-09-14

### Added
- **Author Alias & Contributor Consolidation**:
  - Interactive UI modal in the Knowledge Panel (`AuthorAliasModal`) to merge commits from different names or email addresses belonging to the same person.
  - Native Git `.mailmap` support with `--use-mailmap` and `%aN` log formatting.
  - Workspace configuration setting `auspex.authorAliases` for persistent local author mapping in `.vscode/settings.json`.
  - Flexible export target options: save alias groupings directly to VS Code Workspace settings or generate a standard `.mailmap` file in the repository root.
  - Automated re-scan on save to immediately update Truck Factor, monopoly files, and file ownership percentages.
  - Quick-manage shortcut buttons directly on author cards in the Knowledge overview.

### Changed
- **Modular AST Extraction Architecture**:
  - Re-architected parser into language-specific extractors (JavaScript, TypeScript, Python, generic brace syntax) managed by a unified `ExtractorRegistry`.
- **Editor Health Decorators & Spacing**:
  - Standardized visual spacing using non-breaking spaces in Code Health gutter badges and CodeLens annotations.

---

## [1.3.0] - 2026-09-14

### Added
- **Editor Code Health Decorators & CodeLens**:
  - In-editor gutter icons indicating function- and file-level Code Health scores and biomarkers.
  - CodeLens annotations positioned above function declarations showing Code Health and complexity metrics.
  - Toggle command `auspex.toggleEditorHealth` integrated into the editor title bar.
  - Configuration settings: `auspex.editorGutter.enabled`, `auspex.editorGutter.showHealthy`, and `auspex.codeLens.enabled`.
- **Scope Filtering (Worktree & Timeframes)**:
  - Filter analysis by uncommitted worktree changes or customizable timeframes.
- **System Map Visualization Enhancements**:
  - Tree compaction and label handling utilities for improved system architecture visualization.
- **Relative LOC Metrics**:
  - Relative LOC percentage calculations and tooltips across treemap nodes and inspector panels.

### Documentation
- Expanded README with visual feature previews and architectural descriptions.

---

## [1.2.0] - 2026-09-13

### Added
- **Knowledge Monopolies & Key Person Risk Analysis**:
  - Dedicated `KnowledgePanel` webview and `AuspexKnowledgeViewProvider` in the sidebar.
  - Truck Factor calculation (minimum developers owning >50% of the codebase).
  - Detection of monopoly files (≥75% ownership by a single developer) and high-risk hotspots.
  - Summary cards for key knowledge holders, owned files, and codebase share.
- **Reusable FileHeader Component**:
  - Unified header component across panels providing breadcrumb navigation, status indicators, and Jump-to-Code actions.

### Performance
- **Incremental Caching & Data Caps**:
  - Disk-backed file cache for incremental AST parsing.
  - Configurable `auspex.maxCommits` parameter to limit Git history traversal in large repositories.

---

## [1.1.0] - 2026-09-11

### Added
- **Temporal Coupling Analysis & Graph Visualization**:
  - Analysis of files frequently modified together across Git commits.
  - Interactive force-directed `CouplingGraphViewer` and dedicated `CouplingPanel` sidebar view.
  - Configurable coupling threshold filter and partner node jump navigation.
- **Code Health Biomarker Analysis**:
  - 1.0 to 10.0 Code Health score based on complexity biomarkers (Complex Method, Bumpy Road, Brain Method, Deep Nesting).
  - Dedicated `HealthViewProvider` sidebar and health heatmap coloring in treemap.
- **Contributors & Git History in Details Panel**:
  - Integrated contributor statistics and commit history timeline in `TreemapDetailsPanel`.
- **Dynamic Timeframe Filtering**:
  - Timeframe filter selector (`7d`, `14d`, `30d`, `90d`, `180d`, `1y`, `All`) with recursive tree aggregation.

---

## [1.0.0] - 2026-09-10

### Added
- **Interactive Treemap Visualization**:
  - Hierarchical zoom from folder level down to individual files, classes, and methods.
  - Sizing dimensions: Lines of Code (LOC), Git Commits, Bugfixes, and Added Lines.
  - Multi-dimensional heatmaps: Defect Hotspot (Defect ratio × Churn), Git Churn, Code Growth, and Recency/Freshness.
  - Breadcrumb navigation and Top-N item limit filter (Top 50, Top 100, Top 200, Top 500, All).
  - Source code only toggle to filter non-programming assets.
- **Dynamic Timeframe Filtering**:
  - Live timeframe selection for `All time`, `1 week`, `1 month`, `6 months`, `1 year`, and `2 years`.
  - Automatic churn score and hotspot re-normalization within the selected time window.
  - Synchronized live metric updates between Treemap and Details sidebar.
- **Editor Navigation & Git Diff Inspection**:
  - Direct Jump-to-Code from Treemap to exact file lines in VS Code.
  - Interactive commit history panel with author information and timestamps.
  - Single commit diff viewer opening natively in VS Code.
  - "Set as Base" workflow for side-by-side Git diff comparison between any two commits.
  - Quick filter for bugfix commits.
- **Optional Read-Only Jira Integration**:
  - Automatic detection of Jira ticket keys (`PROJ-123`) in Git commit messages.
  - Secure API token storage via VS Code `SecretStorage` (OS Keychain).
  - REST client with automatic bug/defect classification to enrich hotspot metrics.
  - Clickable Jira ticket badges in the commit details panel opening directly in the browser.
  - In-memory and disk caching (`.auspex/jira_cache.json`) for offline performance.
- **Activity Bar & Sidebar Overview**:
  - Dedicated Auspex Activity Bar icon and navigation container.
  - Sidebar overview listing top defect hotspots, total files, and workspace LOC.
  - Rescan and documentation trigger buttons.
- **Bilingual Interface**:
  - Complete English and German localization for all webviews, menus, tooltips, and settings.
- **CI/CD & Packaging**:
  - Automated GitHub Actions workflows for continuous integration and automated VSIX release packaging.
  - Interactive `./release.sh` release manager for version bumping, tagging, and publishing.

---

## [0.2.0] - 2026-09-09

### Added
- Initial standalone VS Code extension architecture.
- Core pipeline integrating Babel AST parsing and `simple-git` churn extraction.
- ECharts treemap integration with dark and light theme responsiveness.
