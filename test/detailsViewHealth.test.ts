import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TreemapDetailsPanel } from '../webview/src/components/TreemapDetailsPanel';
import type { TreeNode } from '../src/analyzer/types';

describe('TreemapDetailsPanel - Details View Health Display', () => {
  const mockFileWithHealth: TreeNode = {
    name: 'orderService.ts',
    path: 'src/services/orderService.ts',
    type: 'file',
    value: 450,
    loc: 450,
    commitCount: 12,
    churnScore: 0.65,
    fixCount: 2,
    codeHealth: 7.2,
    biomarkers: [
      {
        type: 'brain_method',
        severity: 'high',
        functionName: 'processOrder',
        startLine: 45,
        endLine: 120,
        details: 'Brain Method with cyclomatic complexity 18',
      },
      {
        type: 'deep_nesting',
        severity: 'medium',
        functionName: 'validateItems',
        startLine: 130,
        endLine: 160,
        details: 'Nesting depth of 5',
      },
    ],
  };

  const mockFileClean: TreeNode = {
    name: 'utils.ts',
    path: 'src/utils.ts',
    type: 'file',
    value: 50,
    loc: 50,
    commitCount: 2,
    churnScore: 0.1,
    fixCount: 0,
    biomarkers: [],
  };

  it('renders Code Health KPI card in details mode with correct score and German label', () => {
    const html = renderToStaticMarkup(
      React.createElement(TreemapDetailsPanel, {
        node: mockFileWithHealth,
        language: 'de',
        mode: 'details',
        onClose: () => {},
        onOpenFile: () => {},
      })
    );

    // Should render KPI metrics (LOC, Commits, Bugfixes, Churn)
    expect(html).toContain('450');
    expect(html).toContain('12');
    expect(html).toContain('65%');

    // Should render Code Health KPI card in the grid
    expect(html).toContain('7.2');
    expect(html).toContain('/ 10.0');
    expect(html).toContain('Problematisch');

    // Should render the expandable details-health-section
    expect(html).toContain('id="details-health-section"');
    expect(html).toContain('processOrder');
    expect(html).toContain('Brain Method');
  });

  it('renders Code Health KPI card in details mode with English label', () => {
    const html = renderToStaticMarkup(
      React.createElement(TreemapDetailsPanel, {
        node: mockFileWithHealth,
        language: 'en',
        mode: 'details',
        onClose: () => {},
        onOpenFile: () => {},
      })
    );

    expect(html).toContain('7.2');
    expect(html).toContain('Problematic');
    expect(html).toContain('id="details-health-section"');
  });

  it('defaults to 10.0 and Healthy for clean files with no biomarkers', () => {
    const html = renderToStaticMarkup(
      React.createElement(TreemapDetailsPanel, {
        node: mockFileClean,
        language: 'de',
        mode: 'details',
        onClose: () => {},
        onOpenFile: () => {},
      })
    );

    expect(html).toContain('10.0');
    expect(html).toContain('Gesund');
    expect(html).toContain('id="details-health-section"');
  });
});
