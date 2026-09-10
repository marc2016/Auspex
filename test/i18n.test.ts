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
      expect(t.limit).toBeTruthy();
      expect(t.rescan).toBeTruthy();
      expect(t.jumpToCode).toBeTruthy();
      expect(t.metrics.loc).toBeTruthy();
      expect(t.metrics.commits).toBeTruthy();
      expect(t.metrics.churnScore).toBeTruthy();
    }
  });

  it('detectInitialLanguage detects de or en safely', () => {
    expect(['de', 'en']).toContain(detectInitialLanguage());
  });
});
