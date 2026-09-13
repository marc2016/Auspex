import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockConfigLang = 'auto';
let mockEnvLang = 'en-US';

vi.mock('vscode', () => {
  return {
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultVal: any) => {
          if (key === 'language') return mockConfigLang;
          return defaultVal;
        }),
      })),
    },
    env: {
      get language() {
        return mockEnvLang;
      },
    },
  };
});

import { resolveLanguage, EXT_STRINGS } from '../src/i18n';
import { WEBVIEW_STRINGS, detectInitialLanguage } from '../webview/src/i18n';

describe('i18n Localization', () => {
  beforeEach(() => {
    mockConfigLang = 'auto';
    mockEnvLang = 'en-US';
  });

  it('detects German when VS Code language is de or de-DE', () => {
    mockEnvLang = 'de-DE';
    expect(resolveLanguage()).toBe('de');

    mockEnvLang = 'de';
    expect(resolveLanguage()).toBe('de');
  });

  it('detects English when VS Code language is en-US, en, or other', () => {
    mockEnvLang = 'en-US';
    expect(resolveLanguage()).toBe('en');

    mockEnvLang = 'en';
    expect(resolveLanguage()).toBe('en');

    mockEnvLang = 'fr';
    expect(resolveLanguage()).toBe('en');
  });

  it('contains complete dictionary keys for extension host in de and en', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = EXT_STRINGS[lang];
      expect(t.sidebarTitle).toBeTruthy();
      expect(t.openTreemap).toBeTruthy();
      expect(t.rescan).toBeTruthy();
      expect(t.helpTooltip).toBeTruthy();
      expect(t.noData).toBeTruthy();
      expect(t.totalLoc).toBeTruthy();
      expect(t.files).toBeTruthy();
      expect(t.hotspots).toBeTruthy();
      expect(t.commits).toBeTruthy();
      expect(t.churn).toBeTruthy();
      expect(t.scanSuccess(10, 500, 120)).toContain('10');
      expect(t.scanError('Test error')).toContain('Test error');
      expect(t.statusBarTooltip(5)).toContain('5');
      expect(t.knowledge).toBeTruthy();
      expect(t.truckFactor).toBeTruthy();
      expect(t.noChangedFilesFound).toBeTruthy();
      expect(t.diffOpenError('failed')).toContain('failed');
      expect(t.fallbackBuildNotice).toBeTruthy();
      expect(t.viewTitles.overview).toBeTruthy();
      expect(t.viewTitles.hotspots).toBeTruthy();
      expect(t.viewTitles.details).toBeTruthy();
      expect(t.viewTitles.health).toBeTruthy();
      expect(t.viewTitles.coupling).toBeTruthy();
      expect(t.viewTitles.knowledge).toBeTruthy();
    }
  });

  it('contains complete dictionary keys for webview in de and en', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = WEBVIEW_STRINGS[lang];
      expect(t.files).toBeTruthy();
      expect(t.viewModes.files).toBeTruthy();
      expect(t.viewModes.classes).toBeTruthy();
      expect(t.viewModes.functions).toBeTruthy();
      expect(t.viewModes.hierarchy).toBeTruthy();
      expect(t.size).toBeTruthy();
      expect(t.sizeOptions.loc).toBeTruthy();
      expect(t.color).toBeTruthy();
      expect(t.colorOptions.churn).toBeTruthy();
      expect(t.colorOptions.knowledge).toBeTruthy();
      expect(t.limit).toBeTruthy();
      expect(t.rescan).toBeTruthy();
      expect(t.jumpToCode).toBeTruthy();
      expect(t.metrics.loc).toBeTruthy();
      expect(t.metrics.commits).toBeTruthy();
      expect(t.metrics.churnScore).toBeTruthy();

      // Knowledge keys
      expect(t.knowledge.title).toBeTruthy();
      expect(t.knowledge.projectTitle).toBeTruthy();
      expect(t.knowledge.truckFactor).toBeTruthy();
      expect(t.knowledge.monopolyFiles).toBeTruthy();
      expect(t.knowledge.authorSingle).toBeTruthy();
      expect(t.knowledge.authorPlural).toBeTruthy();
      expect(t.knowledge.developerSingle).toBeTruthy();
      expect(t.knowledge.developerPlural).toBeTruthy();
      expect(t.knowledge.criticalRiskBadge).toBeTruthy();
      expect(t.knowledge.healthyRiskBadge).toBeTruthy();
      expect(t.knowledge.singleOwnership).toBeTruthy();
      expect(t.knowledge.total).toBeTruthy();
      expect(t.knowledge.filesLabel).toBeTruthy();
      expect(t.knowledge.monopoliesLabel).toBeTruthy();
      expect(t.knowledge.commitsLabel).toBeTruthy();
      expect(t.knowledge.unknownAuthor).toBeTruthy();

      // Tooltip keys
      expect(t.tooltip.method).toBeTruthy();
      expect(t.tooltip.class).toBeTruthy();
      expect(t.tooltip.file).toBeTruthy();
      expect(t.tooltip.folder).toBeTruthy();
      expect(t.tooltip.fileSize).toBeTruthy();
      expect(t.tooltip.gitCommits).toBeTruthy();
      expect(t.tooltip.bugFixesCount).toBeTruthy();
      expect(t.tooltip.hotspotChurn).toBeTruthy();
      expect(t.tooltip.codeHealth).toBeTruthy();
      expect(t.tooltip.maxCoupling).toBeTruthy();
      expect(t.tooltip.primaryAuthor).toBeTruthy();
      expect(t.tooltip.linesRange(10, 25)).toContain('10');

      // Zoom & Legend keys
      expect(t.zoom.in).toBeTruthy();
      expect(t.zoom.out).toBeTruthy();
      expect(t.zoom.reset).toBeTruthy();
      expect(t.legend.churn).toBeTruthy();
      expect(t.legend.coupling).toBeTruthy();
      expect(t.legend.knowledge).toBeTruthy();
    }
  });

  it('detectInitialLanguage detects de or en safely', () => {
    expect(['de', 'en']).toContain(detectInitialLanguage());
  });

  it('localizes tooltip HTML in both German and English correctly', async () => {
    const { renderTooltipHtml } = await import('../webview/src/components/TreemapViewer');
    const testNode = {
      name: 'UserController.ts',
      path: 'src/UserController.ts',
      type: 'file' as const,
      loc: 350,
      commitCount: 42,
      fixCount: 7,
      churnScore: 0.85,
      codeHealth: 5.2,
      temporalCoupling: [{ filePath: 'src/Auth.ts', couplingDegree: 0.88, coChanges: 15, totalCommits: 42 }],
      primaryAuthor: 'Alice',
      primaryAuthorPercentage: 92,
      knowledgeRisk: 'high' as const,
    };

    const deHtml = renderTooltipHtml(testNode, false, 'de');
    expect(deHtml).toContain('Datei');
    expect(deHtml).toContain('Dateigröße (LOC):');
    expect(deHtml).toContain('Git Commits:');
    expect(deHtml).toContain('Bugfixes:');
    expect(deHtml).toContain('Max. Kopplung:');
    expect(deHtml).toContain('Hauptentwickler:');
    expect(deHtml).toContain('Alice (92%)');

    const enHtml = renderTooltipHtml(testNode, false, 'en');
    expect(enHtml).toContain('File');
    expect(enHtml).toContain('File size (LOC):');
    expect(enHtml).toContain('Git Commits:');
    expect(enHtml).toContain('Bug fixes:');
    expect(enHtml).toContain('Max. Coupling:');
    expect(enHtml).toContain('Primary Author:');
    expect(enHtml).toContain('Alice (92%)');
  });

  it('verifies package.nls.json and package.nls.de.json have all required keys', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const nlsEnPath = path.resolve(__dirname, '../package.nls.json');
    const nlsDePath = path.resolve(__dirname, '../package.nls.de.json');
    const pkgPath = path.resolve(__dirname, '../package.json');

    expect(fs.existsSync(nlsEnPath)).toBe(true);
    expect(fs.existsSync(nlsDePath)).toBe(true);

    const nlsEn = JSON.parse(fs.readFileSync(nlsEnPath, 'utf-8'));
    const nlsDe = JSON.parse(fs.readFileSync(nlsDePath, 'utf-8'));
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    // Check that keys match between EN and DE
    const enKeys = Object.keys(nlsEn).sort();
    const deKeys = Object.keys(nlsDe).sort();
    expect(enKeys).toEqual(deKeys);

    // Check specific view titles
    expect(nlsDe['views.knowledgeView']).toBe('Auspex Monopolwissen');
    expect(nlsEn['views.knowledgeView']).toBe('Auspex Knowledge Monopolies');
    expect(nlsDe['views.couplingView']).toBe('Auspex Kopplung');
    expect(nlsEn['views.couplingView']).toBe('Auspex Coupling');

    // Check that package.json references valid NLS keys
    const pkgStr = JSON.stringify(pkg);
    for (const key of enKeys) {
      expect(pkgStr).toContain(`%${key}%`);
    }
  });
});
