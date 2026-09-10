import { useState, useEffect } from 'react';

export type Language = 'de' | 'en';

export const WEBVIEW_STRINGS = {
  de: {
    files: 'Dateien',
    viewModes: {
      files: 'Dateien',
      classes: 'Klassen',
      functions: 'Funktionen',
      hierarchy: 'Hierarchie',
    },
    size: 'Größe:',
    sizeOptions: {
      loc: 'LOC (Zeilen)',
      churn: 'Commits',
      fixes: 'Bugfixes',
      added: '+Zeilen',
    },
    color: 'Farbe:',
    colorOptions: {
      fixes: 'Fehler-Hotspot',
      churn: 'Git Churn',
      growth: 'Code-Wachstum',
      recency: 'Aktualität',
    },
    timeframe: 'Zeitraum:',
    timeframeOptions: {
      all: 'Alle',
      '1w': '1 Woche',
      '1m': '1 Monat',
      '6m': '6 Monate',
      '1y': '1 Jahr',
      '2y': '2 Jahre',
    },
    limit: 'Limit:',
    limitAll: 'Alle',
    sourceOnly: 'Nur Quellcode',
    rescan: 'Neu scannen',
    jumpToCode: 'Im Editor öffnen',
    close: 'Details schließen',
    contributors: 'Beteiligte Personen',
    commitHistory: 'Commit-Historie',
    noContributors: 'Keine Git-Beteiligten erfasst',
    noCommits: 'Keine Commits vorhanden',
    uncommittedNoticeTitle: 'Noch nicht in Git committet',
    uncommittedNoticeText: 'Diese Datei bzw. dieser Block ist im Git-Repository noch nicht committet (untracked / neu). Sobald Commits existieren, werden Beteiligte und Historie hier angezeigt.',
    commitsCount: 'Commits',
    showAllCommits: 'Alle anzeigen',
    showLess: 'Weniger anzeigen',
    viewDiff: 'Diff anzeigen',
    viewDiffTooltip: 'Git-Diff zu diesem Commit im Editor öffnen',
    compareCommits: 'Commits vergleichen',
    compareSelectedCommits: 'Ausgewählte 2 Commits vergleichen',
    selectTwoToCompare: 'Wähle 2 Commits per Checkbox zum Vergleichen',
    oneCommitSelected: '1 Commit ausgewählt – wähle 2. Commit zum Vergleichen',
    baseCommitBadge: 'Basis',
    compareCommitBadge: 'Vergleich',
    setAsBase: 'Als Basis',
    activeBaseBadge: 'Aktive Basis',
    clearBase: 'Basis aufheben',
    baseActiveHint: 'Aktive Basis: Klicke auf einen beliebigen Commit, um ihn damit zu vergleichen.',
    chooseBaseHint: 'Klicke bei einem Commit auf „Als Basis“, um andere Commits damit zu vergleichen.',
    compareWithBaseTooltip: 'Mit aktiver Basis vergleichen',
    compareWithBaseBtn: 'Mit Basis vergleichen',
    clearSelection: 'Auswahl aufheben',
    filterBugfixes: 'Nur Bugfixes',
    allCommits: 'Alle Commits',
    filterByBugfixesTooltip: 'Klicken, um nach Bugfix-Commits zu filtern',
    filterActiveTooltip: 'Bugfix-Filter aktiv – klicken zum Deaktivieren',
    showAllCommitsTooltip: 'Alle Commits anzeigen',
    filteredByBugfixesBadge: 'Gefiltert: Bugfixes',
    clearFilter: 'Filter aufheben',
    noBugfixCommits: 'Keine Bugfix-Commits für diese Datei gefunden',
    bugfixBadge: 'Bugfix',
    viewInJiraTooltip: 'In Jira öffnen',
    jiraTicket: 'Jira-Ticket',
    noNodeSelectedTitle: 'Kein Element ausgewählt',
    noNodeSelectedDesc: 'Klicke auf eine Datei oder Methode in der Treemap, um Details, Beteiligte und Commits anzuzeigen.',
    detailsSidebarTitle: 'Element-Details',
    metrics: {
      loc: 'LOC',
      commits: 'COMMITS',
      bugFixes: 'BUGFIXES',
      churnScore: 'CHURN-SCORE',
      lineChurn: 'ZEILEN-CHURN',
      lines: 'Zeilen',
    },
    tooltip: {
      loc: 'Zeilen',
      commits: 'Commits',
      churn: 'Churn',
      bugFixes: 'Bugfixes',
    },
  },
  en: {
    files: 'files',
    viewModes: {
      files: 'Files',
      classes: 'Classes',
      functions: 'Functions',
      hierarchy: 'Hierarchy',
    },
    size: 'Size:',
    sizeOptions: {
      loc: 'LOC',
      churn: 'Commits',
      fixes: 'Fixes',
      added: '+Lines',
    },
    color: 'Color:',
    colorOptions: {
      fixes: 'Defect Hotspot',
      churn: 'Git Churn',
      growth: 'Code Growth',
      recency: 'Freshness',
    },
    timeframe: 'Timeframe:',
    timeframeOptions: {
      all: 'All time',
      '1w': '1 week',
      '1m': '1 month',
      '6m': '6 months',
      '1y': '1 year',
      '2y': '2 years',
    },
    limit: 'Limit:',
    limitAll: 'All',
    sourceOnly: 'Source only',
    rescan: 'Rescan',
    jumpToCode: 'Jump to Code in Editor',
    close: 'Close details',
    contributors: 'Contributors',
    commitHistory: 'Commit History',
    noContributors: 'No Git contributors recorded',
    noCommits: 'No commits found',
    uncommittedNoticeTitle: 'Not committed to Git yet',
    uncommittedNoticeText: 'This file or block has not been committed to Git yet (untracked / new). Once commits exist, contributors and commit history will appear here.',
    commitsCount: 'commits',
    showAllCommits: 'Show all',
    showLess: 'Show less',
    viewDiff: 'View diff',
    viewDiffTooltip: 'Open Git diff for this commit in editor',
    compareCommits: 'Compare Commits',
    compareSelectedCommits: 'Compare Selected 2 Commits',
    selectTwoToCompare: 'Select 2 commits via checkbox to compare',
    oneCommitSelected: '1 commit selected – select a 2nd commit to compare',
    baseCommitBadge: 'Base',
    compareCommitBadge: 'Compare',
    setAsBase: 'Set as Base',
    activeBaseBadge: 'Active Base',
    clearBase: 'Clear Base',
    baseActiveHint: 'Active Base: Click any commit to compare against it.',
    chooseBaseHint: 'Click "Set as Base" on any commit to compare others against it.',
    compareWithBaseTooltip: 'Compare with active Base',
    compareWithBaseBtn: 'Compare with Base',
    clearSelection: 'Clear selection',
    filterBugfixes: 'Bugfixes only',
    allCommits: 'All commits',
    filterByBugfixesTooltip: 'Click to filter by bugfix commits',
    filterActiveTooltip: 'Bugfix filter active – click to deactivate',
    showAllCommitsTooltip: 'Show all commits',
    filteredByBugfixesBadge: 'Filtered: Bugfixes',
    clearFilter: 'Clear filter',
    noBugfixCommits: 'No bugfix commits found for this file',
    bugfixBadge: 'Bugfix',
    viewInJiraTooltip: 'Open in Jira',
    jiraTicket: 'Jira Ticket',
    noNodeSelectedTitle: 'No item selected',
    noNodeSelectedDesc: 'Click on a file or method in the treemap to view details, contributors, and commits.',
    detailsSidebarTitle: 'Item Details',
    metrics: {
      loc: 'LOC',
      commits: 'COMMITS',
      bugFixes: 'BUG FIXES',
      churnScore: 'CHURN SCORE',
      lineChurn: 'LINE CHURN',
      lines: 'Lines',
    },
    tooltip: {
      loc: 'Lines',
      commits: 'Commits',
      churn: 'Churn',
      bugFixes: 'Bug Fixes',
    },
  },
};

export function detectInitialLanguage(): Language {
  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement?.lang?.toLowerCase();
    if (htmlLang && (htmlLang.startsWith('de') || htmlLang === 'de')) return 'de';
    if (htmlLang && (htmlLang.startsWith('en') || htmlLang === 'en')) return 'en';
  }

  if (typeof navigator !== 'undefined') {
    const navLang = navigator.language?.toLowerCase() || 'en';
    return navLang.startsWith('de') ? 'de' : 'en';
  }

  return 'en';
}

export function useLanguage(): [Language, (lang: Language) => void, typeof WEBVIEW_STRINGS['de']] {
  const [lang, setLang] = useState<Language>(detectInitialLanguage);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'language:set' && (event.data.language === 'de' || event.data.language === 'en')) {
        setLang(event.data.language);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return [lang, setLang, WEBVIEW_STRINGS[lang]];
}
