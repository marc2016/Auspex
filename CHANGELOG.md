# Change Log

All notable changes to the **Auspex** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
