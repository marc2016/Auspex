import * as vscode from 'vscode';
import path from 'path';
import { AuspexPipeline } from './analyzer/pipeline';
import { AuspexStorage } from './storage/cache';
import { TreemapPanel } from './panels/TreemapPanel';
import { HelpPanel } from './panels/HelpPanel';
import { AuspexOverviewProvider } from './providers/OverviewProvider';
import { AuspexSidebarProvider } from './providers/SidebarProvider';
import { AuspexDetailsViewProvider } from './providers/DetailsViewProvider';
import { AuspexHealthViewProvider } from './providers/HealthViewProvider';
import { AuspexCouplingViewProvider } from './providers/CouplingViewProvider';
import { resolveLanguage, EXT_STRINGS } from './i18n';
import { openFileInEditor } from './utils/navigation';
import { AuspexGitContentProvider, AUSPEX_GIT_SCHEME } from './utils/gitDiff';
import { findFileNode } from './utils/treeLookup';
import type { AnalysisSnapshot, TreeNode } from './analyzer/types';
import { JiraConfigManager } from './integrations/jira/jiraConfigManager';
import { JiraClient } from './integrations/jira/jiraClient';

let pipeline: AuspexPipeline;
let storage: AuspexStorage | null = null;
let jiraConfigManager: JiraConfigManager;
let overviewProvider: AuspexOverviewProvider;
let sidebarProvider: AuspexSidebarProvider;
let detailsViewProvider: AuspexDetailsViewProvider;
let healthViewProvider: AuspexHealthViewProvider;
let couplingViewProvider: AuspexCouplingViewProvider;
let statusBarItem: vscode.StatusBarItem;
let latestSnapshot: AnalysisSnapshot | null = null;
let latestSelectedNode: TreeNode | null = null;
let updateDetailsForEditor: (editor: vscode.TextEditor | undefined) => void;
let setSelectedNodeAcrossProviders: (node: TreeNode | null, reveal?: boolean) => void;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[Auspex] Extension is activating…');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log('[Auspex] No active workspace folder.');
    return;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const storageDir = context.storageUri
    ? context.storageUri.fsPath
    : path.join(workspacePath, '.vscode', 'auspex');

  storage = new AuspexStorage(storageDir);
  pipeline = new AuspexPipeline();
  jiraConfigManager = new JiraConfigManager(context.secrets);

  // Restore cached snapshot if available (must have valid codeHealth)
  const cachedSnapshot = storage.loadSnapshot();
  if (cachedSnapshot && typeof cachedSnapshot.tree?.codeHealth === 'number') {
    latestSnapshot = cachedSnapshot;
  } else {
    console.log('[Auspex] Cached snapshot lacks Code Health data. Invalidation triggered for fresh scan.');
    latestSnapshot = null;
  }

  // 1. Setup Status Bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'auspex.openTreemap';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 2. Setup Sidebar Providers
  overviewProvider = new AuspexOverviewProvider(
    () => openTreemap(context, workspacePath),
    () => runScan(context, workspacePath, true),
    () => openHelp(context, workspacePath)
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AuspexOverviewProvider.viewType,
      overviewProvider
    )
  );

  sidebarProvider = new AuspexSidebarProvider(
    workspacePath,
    () => openTreemap(context, workspacePath),
    () => runScan(context, workspacePath, true),
    () => openHelp(context, workspacePath)
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AuspexSidebarProvider.viewType,
      sidebarProvider
    )
  );

  detailsViewProvider = new AuspexDetailsViewProvider(
    context.extensionUri,
    workspacePath
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AuspexDetailsViewProvider.viewType,
      detailsViewProvider
    )
  );

  healthViewProvider = new AuspexHealthViewProvider(
    context.extensionUri,
    workspacePath
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AuspexHealthViewProvider.viewType,
      healthViewProvider
    )
  );

  couplingViewProvider = new AuspexCouplingViewProvider(
    context.extensionUri,
    workspacePath
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AuspexCouplingViewProvider.viewType,
      couplingViewProvider
    )
  );

  if (latestSnapshot) {
    overviewProvider.updateSnapshot(latestSnapshot);
    sidebarProvider.updateSnapshot(latestSnapshot);
    healthViewProvider.updateSnapshot(latestSnapshot);
    couplingViewProvider.updateSnapshot(latestSnapshot);
  }

  // 3. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('auspex.openTreemap', () => {
      openTreemap(context, workspacePath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auspex.focusDetailsView', () => {
      vscode.commands.executeCommand('auspex.detailsView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auspex.rescan', () => {
      runScan(context, workspacePath, true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auspex.openHelp', () => {
      openHelp(context, workspacePath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auspex.openSelectedFile', async () => {
      const node =
        latestSelectedNode ||
        detailsViewProvider.selectedNode ||
        healthViewProvider.selectedNode ||
        couplingViewProvider.selectedNode ||
        sidebarProvider.selectedNode;
      if (!node) return;
      const targetFilePath = (node.path || '').split('#')[0].replace(/^\//, '');
      if (targetFilePath) {
        await openFileInEditor(workspacePath, targetFilePath, node.startLine, node.endLine);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auspex.setJiraToken', async () => {
      const lang = resolveLanguage();
      const token = await vscode.window.showInputBox({
        prompt: lang === 'de'
          ? 'Gib deinen Jira API-Token ein (wird sicher im Betriebssystem-Schlüsselspeicher abgelegt)'
          : 'Enter your Jira API Token (stored securely in OS Keychain)',
        password: true,
        ignoreFocusOut: true,
      });

      if (token !== undefined) {
        await jiraConfigManager.setApiToken(token);
        const config = jiraConfigManager.getConfig();
        if (config.host) {
          const client = new JiraClient(
            config,
            token,
            storage || undefined,
            (t, bt) => jiraConfigManager.isBugType(t, bt)
          );
          const testRes = await client.testConnection();
          if (testRes.success) {
            vscode.window.showInformationMessage(
              lang === 'de'
                ? `Jira API-Token gespeichert! Verbindung erfolgreich hergestellt: ${testRes.user}`
                : `Jira API Token saved! Connected successfully: ${testRes.user}`
            );
          } else {
            vscode.window.showWarningMessage(
              lang === 'de'
                ? `Jira API-Token gespeichert, aber Verbindungstest fehlgeschlagen: ${testRes.message}`
                : `Jira API Token saved, but connection test failed: ${testRes.message}`
            );
          }
        } else {
          vscode.window.showInformationMessage(
            lang === 'de'
              ? 'Jira API-Token gespeichert! Bitte konfiguriere noch die Jira Host-URL in den VS Code Einstellungen (auspex.jira.host).'
              : 'Jira API Token saved! Please also configure the Jira Host URL in VS Code Settings (auspex.jira.host).'
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auspex.clearJiraToken', async () => {
      const lang = resolveLanguage();
      await jiraConfigManager.clearApiToken();
      vscode.window.showInformationMessage(
        lang === 'de' ? 'Jira API-Token wurde entfernt.' : 'Jira API Token removed.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auspex.testJiraConnection', async () => {
      const lang = resolveLanguage();
      const isConfigured = await jiraConfigManager.isConfigured();
      if (!isConfigured) {
        vscode.window.showWarningMessage(
          lang === 'de'
            ? 'Jira ist noch nicht vollständig konfiguriert. Bitte aktiviere auspex.jira.enabled, setze die Host-URL und den API-Token.'
            : 'Jira is not fully configured. Please enable auspex.jira.enabled, set the Host URL and API Token.'
        );
        return;
      }
      const config = jiraConfigManager.getConfig();
      const token = await jiraConfigManager.getApiToken();
      const client = new JiraClient(
        config,
        token!,
        storage || undefined,
        (t, bt) => jiraConfigManager.isBugType(t, bt)
      );
      const res = await client.testConnection();
      if (res.success) {
        vscode.window.showInformationMessage(`Jira: ${res.message}`);
      } else {
        vscode.window.showErrorMessage(`Jira: ${res.message}`);
      }
    })
  );

  // 4. Register Git Diff Content Provider
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      AUSPEX_GIT_SCHEME,
      new AuspexGitContentProvider()
    )
  );

  // 5. Track Active Editor to automatically update Details Sidebar
  setSelectedNodeAcrossProviders = (node: TreeNode | null, reveal = true) => {
    latestSelectedNode = node;
    vscode.commands.executeCommand('setContext', 'auspex.hasSelectedFile', !!node);
    sidebarProvider.setSelectedNode(node);
    detailsViewProvider.setSelectedNode(node, reveal);
    healthViewProvider.setSelectedNode(node, reveal);
    couplingViewProvider.setSelectedNode(node, reveal);
  };

  updateDetailsForEditor = (editor: vscode.TextEditor | undefined) => {
    if (!editor || !latestSnapshot?.tree) return;
    if (editor.document.uri.scheme !== 'file') return;

    const fsPath = editor.document.uri.fsPath;
    const relPath = path.relative(workspacePath, fsPath).replace(/\\/g, '/');
    if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) return;

    const node = findFileNode(latestSnapshot.tree, relPath);
    if (node) {
      setSelectedNodeAcrossProviders(node, false);
    }
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateDetailsForEditor(editor);
    })
  );

  // Initialize with currently active editor if one is already open
  if (vscode.window.activeTextEditor) {
    updateDetailsForEditor(vscode.window.activeTextEditor);
  }

  // 6. Initial scan in background if no cached snapshot exists
  if (!latestSnapshot) {
    runScan(context, workspacePath, false);
  }
}

async function openTreemap(
  context: vscode.ExtensionContext,
  workspacePath: string
) {
  const panel = TreemapPanel.createOrShow(
    context.extensionUri,
    workspacePath,
    latestSnapshot,
    () => runScan(context, workspacePath, true),
    (node) => {
      setSelectedNodeAcrossProviders(node, true);
    }
  );

  if (!latestSnapshot || typeof latestSnapshot.tree?.codeHealth !== 'number') {
    await runScan(context, workspacePath, true);
  } else {
    panel.sendSnapshot(latestSnapshot);
  }
}

function openHelp(context: vscode.ExtensionContext, workspacePath: string) {
  HelpPanel.createOrShow(context.extensionUri, () => openTreemap(context, workspacePath));
}

async function runScan(
  _context: vscode.ExtensionContext,
  workspacePath: string,
  interactive: boolean
): Promise<void> {
  const config = vscode.workspace.getConfiguration('auspex');
  const ignorePatterns = config.get<string[]>('ignorePatterns', []);

  const lang = resolveLanguage();
  const t = EXT_STRINGS[lang];

  statusBarItem.text = t.scanStart;

  const scanTask = async (
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ) => {
    try {
      let lastPercent = 0;

      let jiraClient: JiraClient | null = null;
      let allowedProjectKeys: string[] | undefined;
      if (jiraConfigManager && (await jiraConfigManager.isConfigured())) {
        const jConfig = jiraConfigManager.getConfig();
        const token = await jiraConfigManager.getApiToken();
        if (token) {
          jiraClient = new JiraClient(
            jConfig,
            token,
            storage || undefined,
            (t, bt) => jiraConfigManager.isBugType(t, bt)
          );
          allowedProjectKeys = jConfig.projectKeys;
        }
      }

      const maxCommits = config.get<number>('maxCommits', 15000);
      const snapshot = await pipeline.run(
        workspacePath,
        storage,
        (p) => {
          if (progress) {
            const increment = p.percentage - lastPercent;
            lastPercent = p.percentage;
            progress.report({ message: p.message, increment });
          }
          if (TreemapPanel.currentPanel) {
            TreemapPanel.currentPanel.sendProgress(p);
          }
        },
        ignorePatterns,
        jiraClient,
        allowedProjectKeys,
        { maxCommits }
      );

      latestSnapshot = snapshot;
      overviewProvider.updateSnapshot(snapshot);
      sidebarProvider.updateSnapshot(snapshot);
      healthViewProvider.updateSnapshot(snapshot);
      couplingViewProvider.updateSnapshot(snapshot);
      if (TreemapPanel.currentPanel) {
        TreemapPanel.currentPanel.sendSnapshot(snapshot);
      }
      if (updateDetailsForEditor) {
        updateDetailsForEditor(vscode.window.activeTextEditor);
      }

      updateStatusBar();

      if (interactive) {
        vscode.window.showInformationMessage(
          t.scanSuccess(snapshot.totalFiles, snapshot.totalLoc, snapshot.durationMs)
        );
      }
    } catch (err: any) {
      console.error('[Auspex] Scan error:', err);
      statusBarItem.text = '$(error) Auspex: Error';
      vscode.window.showErrorMessage(t.scanError(err?.message || err));
    }
  };

  if (interactive) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t.scanNotificationTitle,
        cancellable: false,
      },
      scanTask
    );
  } else {
    await scanTask();
  }
}

function updateStatusBar() {
  const lang = resolveLanguage();
  const t = EXT_STRINGS[lang];

  if (latestSnapshot) {
    const hotspotCount = latestSnapshot.hotspots.length;
    statusBarItem.text = `$(graph) Auspex: ${latestSnapshot.totalLoc.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')} LOC ($(flame) ${hotspotCount})`;
    statusBarItem.tooltip = t.statusBarTooltip(latestSnapshot.totalFiles);
  } else {
    statusBarItem.text = '$(graph) Auspex';
    statusBarItem.tooltip = t.statusBarDefault;
  }
}

export function deactivate() {
  console.log('[Auspex] Extension deactivated.');
}
