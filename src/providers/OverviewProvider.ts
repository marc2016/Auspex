import * as vscode from 'vscode';
import type { AnalysisSnapshot, AuspexScope } from '../analyzer/types';
import { resolveLanguage, EXT_STRINGS } from '../i18n';

const MDI_TELESCOPE = 'M21.9,8.9L20.2,9.9L16.2,3L17.9,2L21.9,8.9M9.8,7.9L12.8,13.1L18.9,9.6L15.9,4.4L9.8,7.9M11.4,12.7L9.4,9.2L5.1,11.7L7.1,15.2L11.4,12.7M2.1,14.6L3.1,16.3L5.7,14.8L4.7,13.1L2.1,14.6M12.1,14L11.8,13.6L7.5,16.1L7.8,16.5C8,16.8 8.3,17.1 8.6,17.3L7,22H9L10.4,17.7H10.5L12,22H14L12.1,16.4C12.6,15.7 12.6,14.8 12.1,14Z';
const MDI_REFRESH = 'M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z';
const MDI_HELP_CIRCLE = 'M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2M12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20M12 6A4 4 0 0 0 8 10H10A2 2 0 0 1 12 8A2 2 0 0 1 14 10C14 12 11 11.75 11 15H13C13 12.75 16 12.5 16 10A4 4 0 0 0 12 6Z';
const MDI_HEART_PULSE = 'M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17Z';
const MDI_HEART_BEAT = 'M4.5,10.5C3.67,10.5 3,11.17 3,12C3,12.83 3.67,13.5 4.5,13.5H7.2L8.8,9.5L11.5,16.5L14,8L15.6,13.5H19.5C20.33,13.5 21,12.83 21,12C21,11.17 20.33,10.5 19.5,10.5H16.8L15.2,14.5L12.5,7.5L10,16L8.4,10.5H4.5Z';
const MDI_FIRE = 'M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z';
const MDI_FILTER = 'M14,12V19.88C14.04,20.18 13.94,20.5 13.71,20.71C13.32,21.1 12.69,21.1 12.3,20.71L10.29,18.7C10.06,18.47 9.96,18.16 10,17.87V12H9.97L4.21,4.62C3.87,4.19 3.95,3.56 4.38,3.22C4.57,3.08 4.78,3 5,3V3H19V3C19.22,3 19.43,3.08 19.62,3.22C20.05,3.56 20.13,4.19 19.79,4.62L14.03,12H14Z';

function renderMdiSvg(pathData: string, size = 16, color = 'currentColor'): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="vertical-align: middle; fill: ${color}; display: inline-block;"><path d="${pathData}"/></svg>`;
}

export class AuspexOverviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'auspex.overviewView';

  private _view?: vscode.WebviewView;
  private _currentSnapshot: AnalysisSnapshot | null = null;
  private _currentScope: AuspexScope = { mode: 'all' };
  private _onOpenTreemap: () => void;
  private _onRescan: () => Promise<void>;
  private _onOpenHelp?: () => void;
  private _onScopeChange?: (scope: AuspexScope) => Promise<void>;

  constructor(
    onOpenTreemap: () => void,
    onRescan: () => Promise<void>,
    onOpenHelp?: () => void,
    onScopeChange?: (scope: AuspexScope) => Promise<void>
  ) {
    this._onOpenTreemap = onOpenTreemap;
    this._onRescan = onRescan;
    this._onOpenHelp = onOpenHelp;
    this._onScopeChange = onScopeChange;
  }

  public get currentScope(): AuspexScope {
    return this._currentScope;
  }

  public updateSnapshot(snapshot: AnalysisSnapshot, scope?: AuspexScope): void {
    this._currentSnapshot = snapshot;
    if (scope) {
      this._currentScope = scope;
    } else if (snapshot.scope) {
      this._currentScope = snapshot.scope;
    }
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview();
    }
  }

  public setScope(scope: AuspexScope): void {
    this._currentScope = scope;
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview();
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'openTreemap':
          this._onOpenTreemap();
          break;
        case 'rescan':
          await this._onRescan();
          break;
        case 'openHelp':
          this._onOpenHelp?.();
          break;
        case 'setScope':
          this._currentScope = data.scope;
          if (this._onScopeChange) {
            await this._onScopeChange(data.scope);
          }
          break;
      }
    });
  }

  private _getHtmlForWebview(): string {
    const s = this._currentSnapshot;
    const scope = this._currentScope;
    const mode = scope.mode || 'all';
    const preset = scope.timeframePreset || '30d';
    const startDate = scope.startDate || '';
    const endDate = scope.endDate || '';

    const lang = resolveLanguage();
    const t = EXT_STRINGS[lang];

    const totalLocFormatted = s ? s.totalLoc.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US') : '-';
    const totalFiles = s ? s.totalFiles : '-';
    const totalCommits = s?.tree?.commitCount !== undefined ? s.tree.commitCount.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US') : '-';
    const contributorsCount = s?.tree?.contributors ? s.tree.contributors.length : 0;
    const hotspotsCount = s ? s.hotspots.length : 0;

    // Overall Code Health calculation
    const rawHealth = s?.tree?.codeHealth;
    const hasHealth = typeof rawHealth === 'number';
    const healthScore = hasHealth ? rawHealth : 10.0;
    const isHealthy = healthScore >= 9.0;
    const isProblematic = healthScore >= 6.0 && healthScore < 9.0;
    const healthColor = isHealthy ? '#10b981' : isProblematic ? '#f59e0b' : '#ef4444';
    const healthBg = isHealthy ? 'rgba(16, 185, 129, 0.12)' : isProblematic ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
    const healthLabel = isHealthy ? t.healthy : isProblematic ? t.problematic : t.unhealthy;
    const healthPercent = Math.min(100, Math.max(10, Math.round((healthScore / 10.0) * 100)));

    let scopeBadgeLabel = t.scopeAll;
    if (mode === 'worktree') {
      scopeBadgeLabel = t.scopeWorktree;
    } else if (mode === 'timeframe') {
      if (preset === 'custom') {
        scopeBadgeLabel = startDate || endDate ? `${startDate || '…'} – ${endDate || '…'}` : t.scopeTimeframe;
      } else {
        scopeBadgeLabel = t.timeframePresets[preset] || t.scopeTimeframe;
      }
    }

    const scopeControlHtml = `
      <!-- Scope Selection Card -->
      <div class="card scope-card">
        <div class="scope-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            ${renderMdiSvg(MDI_FILTER, 13, 'var(--vscode-descriptionForeground)')}
            <span style="font-weight: 600; font-size: 11px;">${t.scope}</span>
          </div>
          <span class="scope-badge badge-${mode}" title="${scopeBadgeLabel}">
            ${scopeBadgeLabel}
          </span>
        </div>

        <div class="scope-tabs">
          <button type="button" class="scope-tab ${mode === 'all' ? 'active' : ''}" onclick="selectMode('all')">
            ${t.scopeAll}
          </button>
          <button type="button" class="scope-tab ${mode === 'worktree' ? 'active' : ''}" onclick="selectMode('worktree')">
            ${t.scopeWorktree}
          </button>
          <button type="button" class="scope-tab ${mode === 'timeframe' ? 'active' : ''}" onclick="selectMode('timeframe')">
            ${t.scopeTimeframe}
          </button>
        </div>

        ${
          mode === 'timeframe'
            ? `
          <div class="scope-subpanel">
            <select id="presetSelect" class="scope-select" onchange="onPresetChange(this.value)">
              <option value="7d" ${preset === '7d' ? 'selected' : ''}>${t.timeframePresets['7d']}</option>
              <option value="14d" ${preset === '14d' ? 'selected' : ''}>${t.timeframePresets['14d']}</option>
              <option value="30d" ${preset === '30d' ? 'selected' : ''}>${t.timeframePresets['30d']}</option>
              <option value="90d" ${preset === '90d' ? 'selected' : ''}>${t.timeframePresets['90d']}</option>
              <option value="180d" ${preset === '180d' ? 'selected' : ''}>${t.timeframePresets['180d']}</option>
              <option value="1y" ${preset === '1y' ? 'selected' : ''}>${t.timeframePresets['1y']}</option>
              <option value="custom" ${preset === 'custom' ? 'selected' : ''}>${t.timeframePresets['custom']}</option>
            </select>

            <div id="customDatesContainer" class="custom-dates-row" style="display: ${preset === 'custom' ? 'flex' : 'none'};">
              <div class="date-col">
                <label for="startDate">${t.from}</label>
                <input type="date" id="startDate" class="date-input" value="${startDate}" />
              </div>
              <div class="date-col">
                <label for="endDate">${t.to}</label>
                <input type="date" id="endDate" class="date-input" value="${endDate}" />
              </div>
              <button type="button" class="apply-btn" onclick="applyCustomDates()">${t.apply}</button>
            </div>
          </div>
        `
            : ''
        }

        ${
          mode === 'worktree' && s?.scopeSummary
            ? `<div class="worktree-info-text">${s.scopeSummary}</div>`
            : ''
        }
      </div>
    `;

    const isWorktreeEmpty = mode === 'worktree' && s && s.totalFiles === 0;

    const statsContentHtml = isWorktreeEmpty
      ? `
        <div class="card empty-worktree-card">
          <div style="font-weight: 600; font-size: 12px; margin-bottom: 4px; color: var(--vscode-foreground);">
            ${t.noWorktreeChanges}
          </div>
          <div style="font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.4;">
            ${lang === 'de' ? 'Aktuell gibt es keine ungespeicherten oder gestageten Änderungen im Git Working Tree.' : 'There are currently no unstaged or staged changes in the Git working tree.'}
          </div>
        </div>
      `
      : `
        <!-- Overall Health Card -->
        <div class="card health-card" style="border-color: ${healthColor}40;">
          <div class="card-header">
            <div style="display: flex; align-items: center; gap: 6px;">
              ${renderMdiSvg(MDI_HEART_BEAT, 15, healthColor)}
              <span style="font-weight: 600; font-size: 11px;">${t.overallHealth}</span>
            </div>
            <span class="health-badge" style="color: ${healthColor}; background-color: ${healthBg}; border: 1px solid ${healthColor}33;">
              ${healthLabel}
            </span>
          </div>
          <div style="display: flex; align-items: baseline; gap: 6px; margin: 6px 0;">
            <span style="font-size: 24px; font-weight: 800; color: ${healthColor};">
              ${healthScore.toFixed(1)}
            </span>
            <span style="font-size: 11px; color: var(--vscode-descriptionForeground);">/ 10.0</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${healthPercent}%; background-color: ${healthColor};"></div>
          </div>
        </div>

        <!-- Workspace Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-num">${totalLocFormatted}</span>
            <span class="stat-label">${t.totalLoc}</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">${totalCommits}</span>
            <span class="stat-label">${mode === 'worktree' ? (lang === 'de' ? 'Änderungen' : 'Changes') : t.commits}</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">${totalFiles}</span>
            <span class="stat-label">${t.files}</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">${contributorsCount}</span>
            <span class="stat-label">${t.contributors}</span>
          </div>
          <div class="stat-card" style="grid-column: span 2;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
              ${renderMdiSvg(MDI_FIRE, 14, '#ef4444')}
              <span class="stat-num">${hotspotsCount}</span>
            </div>
            <span class="stat-label">${t.hotspots}</span>
          </div>
        </div>
      `;

    const contentHtml = s
      ? `
        ${scopeControlHtml}
        ${statsContentHtml}
      `
      : `
        <div class="actions">
          <button onclick="vscode.postMessage({ type: 'rescan' })">
            ${renderMdiSvg(MDI_REFRESH, 14)}
            <span>${t.rescan}</span>
          </button>
        </div>
        <p class="empty-msg">${t.noData}</p>
      `;

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 10px;
            margin: 0;
            box-sizing: border-box;
          }
          .actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 12px;
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 7px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          .card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 10px;
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .health-badge {
            font-size: 9px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 3px;
          }
          .progress-track {
            height: 5px;
            border-radius: 3px;
            background-color: var(--vscode-sideBar-background);
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.05);
          }
          .progress-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.3s ease;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-bottom: 12px;
          }
          .stat-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            border-radius: 4px;
            padding: 8px 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
          }
          .stat-num {
            font-size: 15px;
            font-weight: 700;
            color: var(--vscode-foreground);
          }
          .stat-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 2px;
          }
          .empty-msg {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            margin-top: 16px;
          }

          /* Scope Selection Styles */
          .scope-card {
            padding: 9px 10px;
          }
          .scope-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }
          .scope-badge {
            font-size: 9px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 3px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .badge-worktree {
            background-color: rgba(245, 158, 11, 0.18);
            color: #f59e0b;
            border: 1px solid rgba(245, 158, 11, 0.35);
          }
          .badge-timeframe {
            background-color: rgba(59, 130, 246, 0.18);
            color: #3b82f6;
            border: 1px solid rgba(59, 130, 246, 0.35);
          }
          .scope-tabs {
            display: flex;
            gap: 3px;
            background-color: var(--vscode-sideBar-background);
            padding: 3px;
            border-radius: 4px;
          }
          .scope-tab {
            flex: 1;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: none;
            padding: 5px 4px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            text-align: center;
            transition: all 0.15s ease;
          }
          .scope-tab:hover {
            color: var(--vscode-foreground);
            background-color: rgba(255, 255, 255, 0.05);
          }
          .scope-tab.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }
          .scope-subpanel {
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .scope-select {
            width: 100%;
            background-color: var(--vscode-dropdown-background, var(--vscode-input-background));
            color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
            border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, rgba(255, 255, 255, 0.15)));
            padding: 4px 6px;
            border-radius: 3px;
            font-size: 11px;
            outline: none;
          }
          .custom-dates-row {
            display: flex;
            align-items: flex-end;
            gap: 4px;
            margin-top: 2px;
          }
          .date-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .date-col label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
          }
          .date-input {
            width: 100%;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, rgba(255, 255, 255, 0.15));
            padding: 3px 4px;
            border-radius: 3px;
            font-size: 10px;
            box-sizing: border-box;
            outline: none;
          }
          .apply-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            height: 23px;
            width: auto;
            align-self: flex-end;
          }
          .worktree-info-text {
            margin-top: 6px;
            font-size: 10.5px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
          }
          .empty-worktree-card {
            text-align: center;
            padding: 16px 12px;
            border-style: dashed;
          }
        </style>
      </head>
      <body>
        ${contentHtml}
        <script>
          const vscode = acquireVsCodeApi();

          function selectMode(targetMode) {
            if (targetMode === 'all') {
              vscode.postMessage({ type: 'setScope', scope: { mode: 'all' } });
            } else if (targetMode === 'worktree') {
              vscode.postMessage({ type: 'setScope', scope: { mode: 'worktree' } });
            } else if (targetMode === 'timeframe') {
              const sel = document.getElementById('presetSelect');
              const chosenPreset = sel ? sel.value : '30d';
              if (chosenPreset === 'custom') {
                applyCustomDates();
              } else {
                vscode.postMessage({
                  type: 'setScope',
                  scope: { mode: 'timeframe', timeframePreset: chosenPreset }
                });
              }
            }
          }

          function onPresetChange(newPreset) {
            const customContainer = document.getElementById('customDatesContainer');
            if (newPreset === 'custom') {
              if (customContainer) customContainer.style.display = 'flex';
            } else {
              if (customContainer) customContainer.style.display = 'none';
              vscode.postMessage({
                type: 'setScope',
                scope: { mode: 'timeframe', timeframePreset: newPreset }
              });
            }
          }

          function applyCustomDates() {
            const start = document.getElementById('startDate')?.value || '';
            const end = document.getElementById('endDate')?.value || '';
            vscode.postMessage({
              type: 'setScope',
              scope: {
                mode: 'timeframe',
                timeframePreset: 'custom',
                startDate: start,
                endDate: end
              }
            });
          }
        </script>
      </body>
      </html>`;
  }
}

