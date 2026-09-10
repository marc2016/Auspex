import * as vscode from 'vscode';
import type { AnalysisSnapshot, HotspotItem } from '../analyzer/types';
import { openFileInEditor } from '../utils/navigation';
import { resolveLanguage, EXT_STRINGS } from '../i18n';

const MDI_FIRE = 'M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z';
const MDI_TELESCOPE = 'M21.9,8.9L20.2,9.9L16.2,3L17.9,2L21.9,8.9M9.8,7.9L12.8,13.1L18.9,9.6L15.9,4.4L9.8,7.9M11.4,12.7L9.4,9.2L5.1,11.7L7.1,15.2L11.4,12.7M2.1,14.6L3.1,16.3L5.7,14.8L4.7,13.1L2.1,14.6M12.1,14L11.8,13.6L7.5,16.1L7.8,16.5C8,16.8 8.3,17.1 8.6,17.3L7,22H9L10.4,17.7H10.5L12,22H14L12.1,16.4C12.6,15.7 12.6,14.8 12.1,14Z';
const MDI_REFRESH = 'M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z';
const MDI_FILE_CODE = 'M14 2H6C4.89 2 4 2.9 4 4V20C4 21.11 4.89 22 6 22H18C19.11 22 20 21.11 20 20V8L14 2M18 20H6V4H13V9H18V20M9.54 15.65L11.63 17.74L10.35 19L7 15.65L10.35 12.3L11.63 13.56L9.54 15.65M17 15.65L13.65 19L12.38 17.74L14.47 15.65L12.38 13.56L13.65 12.3L17 15.65Z';
const MDI_HELP_CIRCLE = 'M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2M12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20M12 6A4 4 0 0 0 8 10H10A2 2 0 0 1 12 8A2 2 0 0 1 14 10C14 12 11 11.75 11 15H13C13 12.75 16 12.5 16 10A4 4 0 0 0 12 6Z';

function renderMdiSvg(pathData: string, size = 16, color = 'currentColor'): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="vertical-align: middle; fill: ${color}; display: inline-block;"><path d="${pathData}"/></svg>`;
}

export class AuspexSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'auspex.sidebarView';

  private _view?: vscode.WebviewView;
  private _currentSnapshot: AnalysisSnapshot | null = null;
  private _workspacePath: string;
  private _onOpenTreemap: () => void;
  private _onRescan: () => Promise<void>;
  private _onOpenHelp?: () => void;

  constructor(
    workspacePath: string,
    onOpenTreemap: () => void,
    onRescan: () => Promise<void>,
    onOpenHelp?: () => void
  ) {
    this._workspacePath = workspacePath;
    this._onOpenTreemap = onOpenTreemap;
    this._onRescan = onRescan;
    this._onOpenHelp = onOpenHelp;
  }

  public updateSnapshot(snapshot: AnalysisSnapshot): void {
    this._currentSnapshot = snapshot;
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
        case 'openFile':
          await openFileInEditor(this._workspacePath, data.filePath);
          break;
      }
    });
  }

  private _getHtmlForWebview(): string {
    const s = this._currentSnapshot;
    const lang = resolveLanguage();
    const t = EXT_STRINGS[lang];

    const summaryHtml = s
      ? `<div class="stats-grid">
          <div class="stat-card">
            <span class="stat-num">${s.totalLoc.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')}</span>
            <span class="stat-label">${t.totalLoc}</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">${s.totalFiles}</span>
            <span class="stat-label">${t.files}</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">${s.hotspots.length}</span>
            <span class="stat-label">${t.hotspots}</span>
          </div>
        </div>`
      : `<p class="empty-msg">${t.noData}</p>`;

    const hotspotsList = s && s.hotspots.length > 0
      ? `<div class="section-title">
           ${renderMdiSvg(MDI_FIRE, 16, '#ef4444')}
           <span>${t.hotspots} (${s.hotspots.length})</span>
         </div>
         <div class="hotspots-list">
           ${s.hotspots
             .map(
               (h: HotspotItem) => `
             <div class="hotspot-item" onclick="vscode.postMessage({ type: 'openFile', filePath: '${h.filePath}' })">
               <div class="hotspot-header">
                 ${renderMdiSvg(MDI_FILE_CODE, 14, 'var(--accent-color)')}
                 <span class="hotspot-name">${h.name}</span>
               </div>
               <div class="hotspot-meta">
                 <span>${h.loc} LOC</span> · 
                 <span>${h.commitCount} ${t.commits}</span> · 
                 <span class="churn-badge">${Math.round(h.churnScore * 100)}% ${t.churn}</span>
               </div>
             </div>
           `
             )
             .join('')}
         </div>`
      : '';

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
            padding: 12px;
            margin: 0;
            box-sizing: border-box;
          }
          .actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 16px;
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
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
          .btn-group {
            display: flex;
            gap: 8px;
          }
          .btn-group button {
            flex: 1;
          }
          .btn-group .icon-btn {
            flex: 0 0 32px;
            width: 32px;
            height: 32px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px;
            margin-bottom: 16px;
          }
          .stat-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
            padding: 8px;
            border-radius: 4px;
            text-align: center;
          }
          .stat-num {
            display: block;
            font-size: 16px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
          }
          .stat-label {
            font-size: 10px;
            text-transform: uppercase;
            opacity: 0.7;
          }
          .section-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 12px 0 8px 0;
            display: flex;
            align-items: center;
            gap: 6px;
            opacity: 0.85;
          }
          .hotspots-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .hotspot-item {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
            border-radius: 4px;
            padding: 8px;
            cursor: pointer;
            transition: background 0.15s ease;
          }
          .hotspot-item:hover {
            background-color: var(--vscode-list-hoverBackground);
          }
          .hotspot-header {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .hotspot-name {
            font-weight: 500;
            font-size: 12px;
            color: var(--vscode-textLink-foreground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .hotspot-meta {
            font-size: 11px;
            opacity: 0.75;
            margin-top: 4px;
            padding-left: 20px;
          }
          .churn-badge {
            color: #ef4444;
            font-weight: 600;
          }
          .empty-msg {
            font-size: 12px;
            opacity: 0.7;
            text-align: center;
            margin: 16px 0;
          }
        </style>
      </head>
      <body>
        <div class="actions">
          <button onclick="vscode.postMessage({ type: 'openTreemap' })">
            ${renderMdiSvg(MDI_TELESCOPE, 16)}
            <span>${t.openTreemap}</span>
          </button>
          <div class="btn-group">
            <button class="secondary" onclick="vscode.postMessage({ type: 'rescan' })">
              ${renderMdiSvg(MDI_REFRESH, 16)}
              <span>${t.rescan}</span>
            </button>
            <button class="secondary icon-btn" title="${t.helpTooltip}" aria-label="${t.helpTooltip}" onclick="vscode.postMessage({ type: 'openHelp' })">
              ${renderMdiSvg(MDI_HELP_CIRCLE, 16)}
            </button>
          </div>
        </div>

        ${summaryHtml}
        ${hotspotsList}

        <script>
          const vscode = acquireVsCodeApi();
        </script>
      </body>
      </html>`;
  }
}
