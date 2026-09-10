import * as vscode from 'vscode';
import { resolveLanguage, type Language } from '../i18n';

export class HelpPanel {
  public static currentPanel: HelpPanel | undefined;
  public static readonly viewType = 'auspexHelp';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _onOpenTreemap?: () => void;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    _extensionUri: vscode.Uri,
    onOpenTreemap?: () => void
  ): HelpPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (HelpPanel.currentPanel) {
      HelpPanel.currentPanel._panel.reveal(column);
      return HelpPanel.currentPanel;
    }

    const lang = resolveLanguage();
    const title = lang === 'de' ? 'Auspex: Dokumentation & Erklärung' : 'Auspex: Guide & Documentation';

    const panel = vscode.window.createWebviewPanel(
      HelpPanel.viewType,
      title,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    HelpPanel.currentPanel = new HelpPanel(panel, onOpenTreemap);
    return HelpPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    onOpenTreemap?: () => void
  ) {
    this._panel = panel;
    this._onOpenTreemap = onOpenTreemap;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.type === 'openTreemap' && this._onOpenTreemap) {
          this._onOpenTreemap();
        }
      },
      null,
      this._disposables
    );
  }

  public dispose(): void {
    HelpPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(): void {
    const lang = resolveLanguage();
    this._panel.title = lang === 'de' ? 'Auspex: Dokumentation & Erklärung' : 'Auspex: Guide & Documentation';
    this._panel.webview.html = this._getHtmlForWebview(lang);
  }

  private _getHtmlForWebview(lang: Language): string {
    const isDe = lang === 'de';

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isDe ? 'Auspex Dokumentation' : 'Auspex Guide'}</title>
  <style>
    :root {
      --color-churn-green: #22c55e;
      --color-churn-yellow: #eab308;
      --color-churn-red: #ef4444;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--vscode-font-size, 14px);
      line-height: 1.6;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 32px 48px;
      margin: 0;
      box-sizing: border-box;
      max-width: 960px;
    }
    h1, h2, h3 {
      color: var(--vscode-editor-foreground);
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 26px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.25));
      padding-bottom: 16px;
    }
    h2 {
      font-size: 18px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
      padding-bottom: 8px;
      margin-top: 36px;
    }
    h3 {
      font-size: 15px;
      margin-top: 20px;
    }
    p, li {
      color: var(--vscode-foreground);
      opacity: 0.9;
    }
    ul {
      padding-left: 20px;
    }
    li {
      margin-bottom: 8px;
    }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      background-color: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .hero-box {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(239, 68, 68, 0.05) 100%);
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
      border-radius: 8px;
      padding: 20px 24px;
      margin: 20px 0 32px 0;
    }
    .hero-btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 18px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      margin-top: 14px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background-color 0.15s ease;
    }
    .hero-btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .cards-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 16px 0;
    }
    @media (max-width: 700px) {
      .cards-grid {
        grid-template-columns: 1fr;
      }
      body {
        padding: 20px;
      }
    }
    .card {
      background-color: var(--vscode-editorWidget-background, rgba(128,128,128,0.05));
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
      border-radius: 6px;
      padding: 16px;
    }
    .card-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .color-badge {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
      vertical-align: middle;
      margin-right: 6px;
    }
    .badge-green { background-color: var(--color-churn-green); }
    .badge-yellow { background-color: var(--color-churn-yellow); }
    .badge-red { background-color: var(--color-churn-red); }
    .formula-box {
      background-color: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12));
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 12px 16px;
      margin: 14px 0;
      border-radius: 0 4px 4px 0;
      font-family: var(--vscode-editor-font-family, monospace);
    }
  </style>
</head>
<body>
  <h1>
    <svg viewBox="0 0 24 24" width="28" height="28" style="fill: var(--vscode-textLink-foreground); vertical-align: middle;"><path d="M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2M12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20M12 6A4 4 0 0 0 8 10H10A2 2 0 0 1 12 8A2 2 0 0 1 14 10C14 12 11 11.75 11 15H13C13 12.75 16 12.5 16 10A4 4 0 0 0 12 6Z"/></svg>
    <span>${isDe ? 'Auspex: Dokumentation & Erklärung' : 'Auspex: Guide & Documentation'}</span>
  </h1>

  <div class="hero-box">
    <strong>${isDe ? 'Was ist Auspex?' : 'What is Auspex?'}</strong>
    <p style="margin: 6px 0 0 0;">
      ${isDe
        ? 'Auspex ist ein visuelles Tool zur Code-Forensik und Hotspot-Erkennung direkt in VS Code. Es kombiniert statische Code-Metriken (Lines of Code, Klassen, Methoden) mit dynamischen Git-Aktivitätsdaten (Churn, Commit-Frequenz, Bugfix-Rate), um architektonische Risikobereiche auf einen Blick sichtbar zu machen.'
        : 'Auspex is a visual code-forensics and hotspot analysis tool directly inside VS Code. It combines static code metrics (lines of code, classes, methods) with dynamic Git activity data (churn, commit frequency, bug fix rate) to highlight architectural risk areas at a glance.'}
    </p>
    <button class="hero-btn" onclick="postMsg('openTreemap')">
      <svg viewBox="0 0 24 24" width="16" height="16" style="fill: currentColor;"><path d="M21.9,8.9L20.2,9.9L16.2,3L17.9,2L21.9,8.9M9.8,7.9L12.8,13.1L18.9,9.6L15.9,4.4L9.8,7.9M11.4,12.7L9.4,9.2L5.1,11.7L7.1,15.2L11.4,12.7M2.1,14.6L3.1,16.3L5.7,14.8L4.7,13.1L2.1,14.6M12.1,14L11.8,13.6L7.5,16.1L7.8,16.5C8,16.8 8.3,17.1 8.6,17.3L7,22H9L10.4,17.7H10.5L12,22H14L12.1,16.4C12.6,15.7 12.6,14.8 12.1,14Z"/></svg>
      <span>${isDe ? 'Treemap jetzt öffnen' : 'Open Treemap Now'}</span>
    </button>
  </div>

  <h2>${isDe ? '1. Was ist Code Churn?' : '1. What is Code Churn?'}</h2>
  <p>
    ${isDe
      ? '<strong>Code Churn</strong> beschreibt die <em>Änderungshäufigkeit und Unruhe von Quellcode über die Zeit</em>. Große oder komplexe Dateien sind an sich kein Problem, solange sie stabil bleiben. Problematisch werden sie erst, wenn sie <strong>ständig modifiziert, erweitert oder repariert</strong> werden müssen.'
      : '<strong>Code Churn</strong> describes the <em>frequency and volatility of source code modifications over time</em>. Large or complex files are not problematic if they remain stable. They become critical when they are <strong>constantly edited, refactored, or patched</strong>.'}
  </p>
  <p>${isDe ? 'Auspex analysiert den Churn anhand von drei Git-Kriterien:' : 'Auspex analyzes code churn using three key Git metrics:'}</p>
  <ul>
    <li>
      ${isDe
        ? '<strong>Commit-Frequenz:</strong> Wie oft wurde eine Datei im Vergleich zu den anderen Dateien im Repository committet?'
        : '<strong>Commit Frequency:</strong> How frequently a file was touched compared to the most active file in the repository.'}
    </li>
    <li>
      ${isDe
        ? '<strong>Code-Fluktuation (Lines Added / Deleted):</strong> Wie viele Zeilen wurden über Commits hinweg eingefügt und wieder verworfen?'
        : '<strong>Code Volatility (Lines Added / Deleted):</strong> How many lines were churned, rewritten, and replaced over commit history.'}
    </li>
    <li>
      ${isDe
        ? '<strong>Defect Ratio (Bugfix-Rate):</strong> Wie viele Commits waren explizite Fehlerbehebungen (z. B. <code>fix:</code>, <code>hotfix:</code>, <code>bug</code>)?'
        : '<strong>Defect Ratio (Bugfix Rate):</strong> The proportion of commits that were explicit bug fixes (e.g. <code>fix:</code>, <code>hotfix:</code>, <code>bug</code>).'}
    </li>
  </ul>

  <h2>${isDe ? '2. Was ist ein Hotspot?' : '2. What is a Hotspot?'}</h2>
  <p>
    ${isDe
      ? 'Ein <strong>Hotspot</strong> ist die gefährliche Schnittmenge aus <strong>hohem Churn</strong> und <strong>hoher Dateigröße / Komplexität</strong>.'
      : 'A <strong>hotspot</strong> is the high-risk intersection of <strong>high churn</strong> and <strong>high size / complexity</strong>.'}
  </p>
  <div class="formula-box">
    Hotspot-Score = (ChurnScore × 0.70) + (min(LOC, 1000) / 1000 × 0.30)
  </div>
  <p>
    ${isDe
      ? 'Dateien mit hohem Hotspot-Score sind typischerweise „God Objects“ oder Schmerzpunkte im Projekt. <strong>Hier amortisieren sich Refactorings, Entkopplungen und zusätzliche Unit-Tests am schnellsten!</strong>'
      : 'Files with a high hotspot score are typically "god objects" or chronic pain points. <strong>This is where refactoring, modularization, and unit testing yield the highest return on investment!</strong>'}
  </p>

  <h2>${isDe ? '3. Die Treemap-Visualisierung verstehen' : '3. Understanding the Treemap'}</h2>
  <div class="cards-grid">
    <div class="card">
      <div class="card-title">${isDe ? 'Kachelgröße (Size Metric)' : 'Tile Size (Size Metric)'}</div>
      <p style="margin: 0; font-size: 13px;">
        ${isDe
          ? 'Die Fläche jeder Kachel repräsentiert die <strong>Lines of Code (LOC)</strong> oder die Anzahl der Commits. Größere Kacheln bedeuten mehr Code.'
          : 'The area of each tile represents <strong>Lines of Code (LOC)</strong> or commit count. Larger tiles mean more code.'}
      </p>
    </div>
    <div class="card">
      <div class="card-title">${isDe ? 'Kachelfarbe (Color Metric)' : 'Tile Color (Color Metric)'}</div>
      <p style="margin: 0; font-size: 13px;">
        ${isDe
          ? 'Zeigt wahlweise den <strong>Git Churn Score</strong>, die <strong>zyklomatische Komplexität</strong> oder die <strong>Größe (LOC)</strong> an.'
          : 'Visualizes the <strong>Git Churn Score</strong>, <strong>cyclomatic complexity</strong>, or <strong>size (LOC)</strong>.'}
      </p>
    </div>
    <div class="card">
      <div class="card-title">${isDe ? 'Granularität (View Mode)' : 'Granularity (View Mode)'}</div>
      <p style="margin: 0; font-size: 13px;">
        ${isDe
          ? 'Wechsle zwischen <strong>Files</strong> (flache Datei-Ansicht), <strong>Classes</strong>, <strong>Functions</strong> oder <strong>Hierarchy</strong> (Ordnerstruktur).'
          : 'Switch between <strong>Files</strong> (flat file view), <strong>Classes</strong>, <strong>Functions</strong>, or <strong>Hierarchy</strong> (folders).'}
      </p>
    </div>
    <div class="card">
      <div class="card-title">${isDe ? 'Klick-zu-Code Navigation' : 'Jump-to-Code Navigation'}</div>
      <p style="margin: 0; font-size: 13px;">
        ${isDe
          ? 'Klicke auf eine beliebige Kachel in der Treemap: VS Code springt sofort zur Datei und markiert die jeweilige Zeile im Editor!'
          : 'Click any tile in the treemap: VS Code jumps immediately to that file and highlights the line in your editor!'}
      </p>
    </div>
  </div>

  <h2>${isDe ? '4. Bedeutung der Churn-Farben' : '4. Meaning of Churn Colors'}</h2>
  <ul>
    <li>
      <span class="color-badge badge-green"></span>
      <strong>${isDe ? 'Grün (0% – 30% Churn):' : 'Green (0% – 30% Churn):'}</strong>
      ${isDe ? 'Ruhiger, stabiler Code. Verrichtet zuverlässig seinen Dienst und wird selten angefasst.' : 'Calm, stable code. Reliable components that rarely require modification.'}
    </li>
    <li>
      <span class="color-badge badge-yellow"></span>
      <strong>${isDe ? 'Gelb (30% – 60% Churn):' : 'Yellow (30% – 60% Churn):'}</strong>
      ${isDe ? 'Aktiver Code. Normale Feature-Entwicklung und gelegentliche Wartung.' : 'Active code. Normal ongoing feature work and periodic maintenance.'}
    </li>
    <li>
      <span class="color-badge badge-red"></span>
      <strong>${isDe ? 'Rot (60% – 100% Churn):' : 'Red (60% – 100% Churn):'}</strong>
      ${isDe ? 'Brennender Hotspot! Häufige Änderungen und Bugfixes. Höchstes Regressionsrisiko.' : 'Burning Hotspot! High volatility, frequent bug fixes, and greatest regression risk.'}
    </li>
  </ul>

  <h2>${isDe ? '5. Filter & Performance' : '5. Filters & Performance'}</h2>
  <p>
    ${isDe
      ? 'Über das <strong>Limit-Dropdown</strong> in der Menüleiste (z. B. <em>Top 50</em>, <em>Top 100</em>, <em>Top 200</em>) kannst du sehr kleine, irrelevante Dateien ausblenden, um den Fokus auf die wesentlichen Komponenten zu richten.'
      : 'Use the <strong>Limit dropdown</strong> in the top toolbar (e.g. <em>Top 50</em>, <em>Top 100</em>, <em>Top 200</em>) to filter out tiny files and focus directly on the most impactful modules.'}
  </p>

  <script>
    const vscode = acquireVsCodeApi();
    function postMsg(type) {
      vscode.postMessage({ type: type });
    }
  </script>
</body>
</html>`;
  }
}
