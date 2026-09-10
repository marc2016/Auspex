# Auspex – Behavioral Code Analysis & Hotspot Treemap for VS Code

Auspex scans your workspace and visualizes code complexity, Git churn, and defect patterns as an interactive Treemap.

## Features

- **Interactive Treemap**: Visualizes files, classes, and methods sized by Lines of Code (LOC) or Git churn.
- **Hotspot Detection**: Highlights code areas with frequent bug fixes and rapid churn (Green = stable, Red = Hotspot).
- **Jump to Code**: Click any file or method in the Treemap to jump directly to the code in the VS Code editor.
- **Activity Bar Sidebar**: Quick overview of top hotspots, total LOC, and scan actions.
- **Status Bar Integration**: Live status and quick access from the bottom status bar.
- **Zero Config**: Analyzes your currently opened VS Code workspace folder without extra setup.
- **Optional Jira Integration (Read-Only)**: Automatically detects Jira ticket keys in commit messages, identifies issue types (Bug, Story, Task, etc.), and enriches defect ratio metrics and commit badges.

## Usage

1. Open a project in Visual Studio Code.
2. Click the Auspex icon in the Activity Bar or run `Auspex: Open Hotspot Treemap` from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3. Click any node in the Treemap to inspect metrics or jump directly to the definition in the editor.

## Optional Jira Integration

Auspex supports connecting to Jira (Cloud or Server/Data Center) in a completely optional, read-only mode:

1. Open VS Code Settings (`Cmd+,` / `Ctrl+,`) and search for `auspex.jira`.
2. Enable `auspex.jira.enabled` and set your Jira host URL (e.g. `https://your-company.atlassian.net`) and email (for Jira Cloud).
3. Set your Jira API token securely via the Command Palette (`Cmd+Shift+P`): run `Auspex: Set Jira API Token` (stored safely in your OS Keychain via VS Code SecretStorage).
4. Verify connectivity using `Auspex: Test Jira Connection`.
5. On the next workspace scan, Auspex will resolve detected ticket keys, mark defect-related commits automatically, and display clickable ticket links directly in the commit history.
