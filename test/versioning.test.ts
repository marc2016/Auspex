import { describe, it, expect } from 'vitest';
import { ANALYZER_VERSION, type AnalysisSnapshot, type ParsedFileInfo } from '../src/analyzer/types';
import { isReusableFileResult, isRestorableSnapshot } from '../src/analyzer/versioning';

const snapshot = (overrides: Partial<AnalysisSnapshot>): AnalysisSnapshot =>
  ({
    id: '1',
    workspacePath: '/ws',
    headCommitSha: 'sha',
    totalFiles: 0,
    totalLoc: 0,
    durationMs: 0,
    scannedAt: '',
    tree: { codeHealth: 9.5 } as AnalysisSnapshot['tree'],
    hotspots: [],
    analyzerVersion: ANALYZER_VERSION,
    ...overrides,
  }) as AnalysisSnapshot;

const fileResult = (overrides: Partial<ParsedFileInfo>): ParsedFileInfo => ({
  filePath: 'a.js',
  classes: [],
  methods: [],
  loc: 1,
  fileHash: 'h',
  codeHealth: 10,
  analyzerVersion: ANALYZER_VERSION,
  ...overrides,
});

describe('analyzer versioning', () => {
  describe('isRestorableSnapshot', () => {
    it('accepts a complete snapshot of the current version', () => {
      expect(isRestorableSnapshot(snapshot({}))).toBe(true);
    });

    it('treats a snapshot from an older version as absent', () => {
      expect(isRestorableSnapshot(snapshot({ analyzerVersion: ANALYZER_VERSION - 1 }))).toBe(false);
    });

    it('treats a snapshot without version as absent', () => {
      expect(isRestorableSnapshot(snapshot({ analyzerVersion: undefined }))).toBe(false);
    });

    it('treats a snapshot without Code Health as absent, as before', () => {
      expect(isRestorableSnapshot(snapshot({ tree: {} as AnalysisSnapshot['tree'] }))).toBe(false);
      expect(isRestorableSnapshot(null)).toBe(false);
    });
  });

  describe('isReusableFileResult', () => {
    it('accepts a complete result of the current version', () => {
      expect(isReusableFileResult(fileResult({}))).toBe(true);
    });

    it('rejects older, unversioned, incomplete and missing results', () => {
      expect(isReusableFileResult(fileResult({ analyzerVersion: ANALYZER_VERSION - 1 }))).toBe(false);
      expect(isReusableFileResult(fileResult({ analyzerVersion: undefined }))).toBe(false);
      expect(isReusableFileResult(fileResult({ codeHealth: undefined }))).toBe(false);
      expect(isReusableFileResult(undefined)).toBe(false);
    });
  });
});
