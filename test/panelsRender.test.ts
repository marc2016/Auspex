import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KnowledgePanel } from '../webview/src/components/KnowledgePanel';
import { CouplingPanel } from '../webview/src/components/CouplingPanel';
import { TreemapDetailsPanel } from '../webview/src/components/TreemapDetailsPanel';
import { FileHeader } from '../webview/src/components/FileHeader';
import { App } from '../webview/src/App';
import type { TreeNode, AnalysisSnapshot } from '../src/analyzer/types';

const mockFileNode: TreeNode = {
  name: 'auth.ts',
  path: 'src/auth.ts',
  type: 'file',
  value: 120,
  loc: 120,
  commitCount: 5,
  churnScore: 0.4,
  fixCount: 1,
  featCount: 2,
  refactorCount: 1,
  linesAdded: 80,
  linesDeleted: 20,
  defectRatio: 0.2,
  contributors: [{ name: 'Alice', commits: 5, percentage: 100 }],
  temporalCoupling: [{ filePath: 'src/user.ts', coChanges: 4, couplingDegree: 0.8, totalCommits: 5 }],
  primaryAuthor: 'Alice',
  primaryAuthorPercentage: 100,
  codeHealth: 8.5,
  biomarkers: [{ type: 'complexFunction', severity: 'medium', details: 'High cyclomatic complexity', functionName: 'login' }],
};

const mockSnapshot: AnalysisSnapshot = {
  timestamp: Date.now(),
  workspacePath: '/workspace',
  totalLoc: 5000,
  totalFiles: 25,
  commitCount: 150,
  tree: {
    name: 'root',
    path: '',
    type: 'folder',
    value: 5000,
    loc: 5000,
    commitCount: 150,
    churnScore: 0.5,
    fixCount: 10,
    featCount: 20,
    refactorCount: 5,
    linesAdded: 3000,
    linesDeleted: 1000,
    codeHealth: 8.8,
  },
  projectCouplings: [
    { fileA: 'src/a.ts', fileB: 'src/b.ts', coChanges: 10, degreeA: 0.8, degreeB: 0.8, symmetricDegree: 0.8 },
  ],
  knowledgeSummary: {
    truckFactor: 1,
    monopolyFileCount: 10,
    monopolyPercentage: 40,
    totalAuthors: 3,
    topAuthors: [
      { name: 'Alice', totalCommits: 80, fileCount: 15, percentageOfCodebase: 60, monopolyFileCount: 8 },
    ],
    highestRiskFiles: [
      { filePath: 'src/core.ts', name: 'core.ts', primaryAuthor: 'Alice', ownershipPercentage: 90, loc: 500, commitCount: 30, churnScore: 0.8, riskLevel: 'high' },
    ],
  },
};

describe('Panels Render Testing', () => {
  it('renders KnowledgePanel in File Mode and Project Mode without error', () => {
    expect(() => renderToStaticMarkup(React.createElement(KnowledgePanel, { node: mockFileNode, snapshot: mockSnapshot, language: 'de' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(KnowledgePanel, { node: mockFileNode, snapshot: mockSnapshot, language: 'en' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(KnowledgePanel, { node: null, snapshot: mockSnapshot, language: 'de' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(KnowledgePanel, { node: null, snapshot: null, language: 'de' }))).not.toThrow();
  });

  it('renders CouplingPanel in File Mode and Project Mode without error', () => {
    expect(() => renderToStaticMarkup(React.createElement(CouplingPanel, { node: mockFileNode, snapshot: mockSnapshot, language: 'de' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(CouplingPanel, { node: mockFileNode, snapshot: mockSnapshot, language: 'en' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(CouplingPanel, { node: null, snapshot: mockSnapshot, language: 'de' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(CouplingPanel, { node: null, snapshot: null, language: 'de' }))).not.toThrow();
  });

  it('renders TreemapDetailsPanel in Details, Health, and All modes without error', () => {
    expect(() => renderToStaticMarkup(React.createElement(TreemapDetailsPanel, { node: mockFileNode, language: 'de', mode: 'details' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(TreemapDetailsPanel, { node: mockFileNode, language: 'en', mode: 'details' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(TreemapDetailsPanel, { node: mockFileNode, language: 'de', mode: 'health' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(TreemapDetailsPanel, { node: mockFileNode, language: 'en', mode: 'health' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(TreemapDetailsPanel, { node: mockFileNode, language: 'de', mode: 'all' }))).not.toThrow();
    expect(() => renderToStaticMarkup(React.createElement(TreemapDetailsPanel, { node: mockFileNode, language: 'en', mode: 'all' }))).not.toThrow();
  });

  it('renders App in all sidebar modes (health, details, coupling, knowledge) without error', () => {
    // Test Health view mode
    (globalThis as any).__AUSPEX_VIEW__ = 'health';
    expect(() => renderToStaticMarkup(React.createElement(App))).not.toThrow();

    // Test Details view mode
    (globalThis as any).__AUSPEX_VIEW__ = 'details';
    expect(() => renderToStaticMarkup(React.createElement(App))).not.toThrow();

    // Test Coupling view mode
    (globalThis as any).__AUSPEX_VIEW__ = 'coupling';
    expect(() => renderToStaticMarkup(React.createElement(App))).not.toThrow();

    // Test Knowledge view mode
    (globalThis as any).__AUSPEX_VIEW__ = 'knowledge';
    expect(() => renderToStaticMarkup(React.createElement(App))).not.toThrow();

    delete (globalThis as any).__AUSPEX_VIEW__;
  });

  it('renders reusable FileHeader component in all variants without error', () => {
    // Normal file
    const html1 = renderToStaticMarkup(React.createElement(FileHeader, {
      node: mockFileNode,
      language: 'de',
      onOpenFile: () => {},
      onClearSelection: () => {},
    }));
    expect(html1).toContain('auth.ts');
    expect(html1).toContain('src/auth.ts');

    // With custom subtitle
    const html2 = renderToStaticMarkup(React.createElement(FileHeader, {
      node: mockFileNode,
      language: 'en',
      subtitle: 'Custom Subtitle 120 LOC',
      onOpenFile: () => {},
      onClearSelection: () => {},
    }));
    expect(html2).toContain('Custom Subtitle 120 LOC');

    // Null node
    const html3 = renderToStaticMarkup(React.createElement(FileHeader, {
      node: null,
      language: 'de',
    }));
    expect(html3).toBe('');
  });
});
