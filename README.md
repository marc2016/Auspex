# Auspex

<p align="center">
  <img src="assets/icon.png" alt="Auspex Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>Behavioral Code Analysis & Interactive Hotspot Treemap for Visual Studio Code</strong>
</p>

<p align="center">
  <a href="https://github.com/marc2016/Auspex/actions/workflows/ci.yml"><img src="https://github.com/marc2016/Auspex/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="https://github.com/marc2016/Auspex/releases"><img src="https://img.shields.io/github/v/release/marc2016/Auspex?include_prereleases&label=release" alt="GitHub Release" /></a>
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.90.0-blue.svg" alt="VS Code Version" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" />
</p>

---

## 📖 Overview

Most software metrics focus solely on static complexity (like Lines of Code or cyclomatic complexity). However, complex code that rarely changes is usually safe and stable. The real risk lies at the intersection of **high complexity** and **high change frequency (Git churn)** with **frequent bugfixes**.

**Auspex** brings behavioral code analysis directly into your editor:
- It automatically analyzes your workspace's Git repository and AST code structure.
- It calculates churn rates, defect frequencies, and code growth.
- It visualizes your codebase as an interactive, hierarchical **Treemap** where you can immediately identify true technical debt and high-risk hotspots.

---

## ✨ Features

### 🗺️ Interactive Hierarchical Treemap
- **Deep Zoom & Hierarchy:** Explore your project from folder level down to individual files, classes, and methods/functions.
- **Breadcrumb Navigation:** Click any box to zoom in; use the breadcrumbs at the top to navigate back up.
- **Source Code Filter:** Toggle between all repository files and source-code-only files with a single click.
- **Top-N Limits:** Filter views to Top 50, Top 100, Top 250, or show all elements.

### 🔥 Behavioral Hotspot Detection
- Combines **Git commit churn** with **defect frequency** (`fix:`, `bug:`, etc., or Jira bug tickets).
- Highlights risky areas using a clear thermal gradient:
  - 🟢 **Green:** Stable, low-risk code.
  - 🟡 **Yellow:** Moderate activity or complexity.
  - 🔴 **Red:** Critical hotspots (frequently modified files with repeated bugfixes).

### 🎨 Multi-Dimensional Visual Encodings
Switch sizing and coloring dimensions dynamically in the top bar:
- **Box Size:**
  - `LOC` (Lines of Code)
  - `Commits` (Total commit frequency)
  - `Bugfixes` (Number of bugfix commits)
  - `+Lines` (Lines added churn)
- **Box Color:**
  - `Fehler-Hotspot / Defect Hotspot` (Defect ratio × Churn score)
  - `Git Churn` (Relative change frequency)
  - `Code-Wachstum / Code Growth` (Net growth ratio)
  - `Aktualität / Freshness` (Recency of the latest change)

### ⚡ Direct Editor Navigation & Git Diff Inspection
- **Jump to Code:** Click any file, class, or method in the Treemap to jump directly to that exact line in the VS Code editor.
- **Commit History & Diffs:**
  - View full commit history in the side panel with author, timestamp, and commit message.
  - Open Git diffs for any commit directly in the editor with one click.
  - **Set as Base:** Mark any commit as a base commit to compare any other commit against it in a side-by-side diff.
  - **Filter Bugfixes:** Toggle between all commits and bugfix-only commits.

### 👥 Contributor & Knowledge Map
- See author breakdown for every file and method.
- Color-coded avatars and commit percentages to understand code ownership and identify knowledge silos.

### 🎫 Optional Read-Only Jira Integration
- Automatically extracts Jira ticket keys (e.g. `PROJ-123`) from Git commit messages.
- Resolves ticket types (Bug, Defect, Story, Task, etc.) via Jira REST API.
- Automatically marks Jira-verified bugs as defect fixes (`isFix = true`) to enhance hotspot accuracy.
- Renders clickable Jira badges on commit cards that open the ticket in your browser.
- **100% Optional & Secure:** Disabled by default; credentials stored securely in your OS Keychain via `vscode.SecretStorage`.

### 🌍 Bilingual Interface
- Fully localized in **Deutsch** and **English**.
- Respects your VS Code language preference automatically, with manual toggle option.

---

## 🚀 Getting Started

### Installation

#### From GitHub Releases (VSIX)
1. Download the latest `.vsix` file from [Releases](https://github.com/marc2016/Auspex/releases).
2. In VS Code, open the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`).
3. Click the `...` menu in the top right and select **Install from VSIX...**.
4. Choose the downloaded `.vsix` file.

### Opening Auspex

1. Open any Git repository workspace in VS Code.
2. Click the **Auspex** icon in the Activity Bar on the left.
3. Click **Auspex: Open Hotspot Treemap** or use the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).

---

## ⌨️ Commands

Auspex contributes the following commands to the VS Code Command Palette:

| Command | Identifier | Description |
|---|---|---|
| `Auspex: Open Hotspot Treemap` | `auspex.openTreemap` | Opens the interactive full-screen Treemap tab. |
| `Auspex: Rescan Workspace` | `auspex.rescan` | Triggers a fresh analysis of AST and Git history. |
| `Auspex: Focus Details View` | `auspex.focusDetailsView` | Reveals the Auspex sidebar details panel. |
| `Auspex: Open Guide & Documentation` | `auspex.openHelp` | Opens the built-in Auspex user guide and documentation. |
| `Auspex: Set Jira API Token` | `auspex.setJiraToken` | Safely saves your Jira API token in the OS Keychain. |
| `Auspex: Clear Jira API Token` | `auspex.clearJiraToken` | Deletes the stored Jira API token. |
| `Auspex: Test Jira Connection` | `auspex.testJiraConnection` | Tests read-only connectivity to your configured Jira host. |

---

## ⚙️ Configuration

You can customize Auspex in VS Code Settings (`Cmd+,` / `Ctrl+,` → search for `auspex`):

| Setting | Type | Default | Description |
|---|---|---|---|
| `auspex.ignorePatterns` | `string[]` | `["node_modules", "dist", "build", ".git", "out", "bin", "obj"]` | Glob patterns to exclude from analysis. |
| `auspex.jira.enabled` | `boolean` | `false` | Enable read-only Jira integration to enrich defect detection. |
| `auspex.jira.host` | `string` | `""` | URL of your Jira instance (e.g. `https://company.atlassian.net`). |
| `auspex.jira.email` | `string` | `""` | Account email for Jira Cloud authentication (leave blank for PAT). |
| `auspex.jira.bugTypes` | `string[]` | `["Bug", "Defect", "Fehler", "Incident", "Problem"]` | Issue types classified as bugs in defect ratio calculations. |
| `auspex.jira.projectKeys` | `string[]` | `[]` | Optional list of Jira project keys to restrict ticket resolution. |

---

## 🔒 Security & Privacy

- **Local Execution:** All code parsing, AST extraction, and Git analysis run 100% locally on your machine.
- **Zero Telemetry:** No code snippets, metrics, or personal data are collected or sent to external servers.
- **Keychain Security:** Jira tokens are stored exclusively via `vscode.SecretStorage` (macOS Keychain, Windows Credential Manager, or Linux Secret Service), never in plain text or `.git`.
- **Read-Only:** Jira integration only performs `GET` requests and will never create, edit, or delete any tickets.

---

## 🛠️ Development & Releases

### Prerequisites
- Node.js 20+
- npm 10+

### Setup & Build
```bash
# Install dependencies
npm install

# Run unit tests (Vitest)
npm test

# Build extension (esbuild) and webview (Vite)
npm run build

# Watch mode for extension development
npm run watch
```

### Creating a Release
Auspex includes an interactive release manager:
```bash
./release.sh
# or specify the version directly:
./release.sh 0.3.0
```
This runs tests, creates production bundles, bumps the version in `package.json`, tags the commit, and pushes to GitHub where the GitHub Action automatically packages and attaches the `.vsix` file to the GitHub Release.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
