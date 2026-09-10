import * as vscode from 'vscode';

export type Language = 'de' | 'en';

export function resolveLanguage(): Language {
  try {
    const envLang = (vscode?.env?.language || '').toLowerCase();
    return envLang.startsWith('de') ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

export const EXT_STRINGS = {
  de: {
    sidebarTitle: 'Auspex Hotspots',
    openTreemap: 'Hotspot-Treemap öffnen',
    rescan: 'Neu scannen',
    helpTooltip: 'Hilfe & Dokumentation',
    noData: 'Noch keine Analysedaten vorhanden. Klicke unten, um diesen Workspace zu scannen.',
    totalLoc: 'Gesamt LOC',
    files: 'Dateien',
    hotspots: 'Hotspots',
    commits: 'Commits',
    churn: 'Churn',
    scanStart: '$(sync~spin) Auspex: Scan läuft…',
    scanSuccess: (files: number, loc: number, ms: number) =>
      `Auspex: ${files} Dateien (${loc.toLocaleString('de-DE')} LOC) in ${ms}ms analysiert.`,
    scanError: (msg: string) => `Auspex: Analyse fehlgeschlagen: ${msg}`,
    scanNotificationTitle: 'Auspex: Workspace wird analysiert',
    statusBarTooltip: (files: number) => `Auspex: ${files} Dateien analysiert. Klicken, um Treemap zu öffnen.`,
    statusBarDefault: 'Klicken, um Auspex Treemap zu öffnen',
    fileOpenError: (path: string) => `[Auspex] Datei konnte nicht geöffnet werden: ${path}`,
  },
  en: {
    sidebarTitle: 'Auspex Hotspots',
    openTreemap: 'Open Hotspot Treemap',
    rescan: 'Rescan',
    helpTooltip: 'Help & Documentation',
    noData: 'No analysis data yet. Click below to analyze this workspace.',
    totalLoc: 'Total LOC',
    files: 'Files',
    hotspots: 'Hotspots',
    commits: 'commits',
    churn: 'churn',
    scanStart: '$(sync~spin) Auspex: Scanning…',
    scanSuccess: (files: number, loc: number, ms: number) =>
      `Auspex: Scanned ${files} files (${loc.toLocaleString('en-US')} LOC) in ${ms}ms.`,
    scanError: (msg: string) => `Auspex: Scan failed: ${msg}`,
    scanNotificationTitle: 'Auspex: Analyzing Workspace',
    statusBarTooltip: (files: number) => `Auspex: ${files} files analyzed. Click to open Treemap.`,
    statusBarDefault: 'Click to open Auspex Treemap',
    fileOpenError: (path: string) => `[Auspex] Could not open file: ${path}`,
  },
};
