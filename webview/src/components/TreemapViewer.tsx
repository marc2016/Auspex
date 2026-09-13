import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import type { TreeNode } from '../../../src/analyzer/types';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { getCodeHealthColor } from './SystemMapViewer';
import { Icon } from './Icon';
import { mdiInformationOutline } from '@mdi/js';

export type TreemapViewMode = 'files' | 'classes' | 'functions' | 'hierarchy';
export type SizeMetric = 'loc' | 'churn' | 'fixes' | 'added';
export type ColorMetric = 'fixes' | 'churn' | 'growth' | 'recency' | 'health' | 'coupling' | 'knowledge' | 'loc';

interface Props {
  tree: TreeNode;
  viewMode?: TreemapViewMode;
  sizeMetric?: SizeMetric;
  colorMetric?: ColorMetric;
  maxItems?: number;
  onNodeClick?: (node: TreeNode) => void;
  selectedNode?: TreeNode | null;
  language?: Language;
}

function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(() => {
    return (
      document.body.classList.contains('vscode-light') ||
      document.body.classList.contains('vscode-high-contrast-light')
    );
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsLight(
        document.body.classList.contains('vscode-light') ||
        document.body.classList.contains('vscode-high-contrast-light')
      );
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isLight;
}

export function getHeatColor(score: number, isLight: boolean): string {
  const normalized = Math.max(0, Math.min(score ?? 0, 1));
  let r: number, g: number, b: number;

  if (isLight) {
    if (normalized < 0.5) {
      const t = normalized * 2;
      r = Math.round(74 + t * (251 - 74));
      g = Math.round(222 + t * (191 - 222));
      b = Math.round(128 + t * (36 - 128));
    } else {
      const t = (normalized - 0.5) * 2;
      r = Math.round(251 + t * (248 - 251));
      g = Math.round(191 - t * (191 - 113));
      b = Math.round(36 + t * (113 - 36));
    }
    return `rgba(${r}, ${g}, ${b}, 0.95)`;
  }

  if (normalized < 0.5) {
    const t = normalized * 2;
    r = Math.round(34 + t * (234 - 34));
    g = Math.round(197 + t * (179 - 197));
    b = Math.round(94 + t * (8 - 94));
  } else {
    const t = (normalized - 0.5) * 2;
    r = Math.round(234 + t * (239 - 234));
    g = Math.round(179 - t * (179 - 68));
    b = Math.round(8 - t * (8 - 68));
  }
  return `rgba(${r}, ${g}, ${b}, 0.95)`;
}

export function getGrowthColor(linesAdded: number, maxAdded: number, isLight: boolean): string {
  if (maxAdded <= 0 || linesAdded <= 0) {
    return isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(51, 65, 85, 0.6)';
  }
  const ratio = Math.min(linesAdded / maxAdded, 1);
  return getHeatColor(ratio, isLight);
}

export function getRecencyColor(timestamp: number | undefined, isLight: boolean): string {
  if (!timestamp) {
    return isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(51, 65, 85, 0.6)';
  }
  const now = Date.now();
  const ageDays = (now - timestamp) / (1000 * 60 * 60 * 24);
  const score = Math.max(0, 1 - ageDays / 90);
  return getHeatColor(score, isLight);
}

export function getCouplingColor(node: TreeNode, isLight: boolean): string {
  const maxCoupling =
    node.temporalCoupling && node.temporalCoupling.length > 0
      ? Math.max(...node.temporalCoupling.map((c) => c.couplingDegree))
      : 0;

  if (maxCoupling <= 0) {
    return isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(51, 65, 85, 0.6)';
  }
  return getHeatColor(maxCoupling, isLight);
}

export function getKnowledgeColor(node: TreeNode, isLight: boolean): string {
  // 1. Resolve primary author with fallback to first contributor
  const primaryAuthor = node.primaryAuthor || node.contributors?.[0]?.name;
  const contributors = node.contributors || [];
  const commitCount = node.commitCount ?? 0;

  // If node has no author information and no contributors at all
  if (!primaryAuthor && contributors.length === 0) {
    return isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(51, 65, 85, 0.6)';
  }

  // 2. Resolve percentage: default to contributors percentage or 100% if primary author is present
  const pct =
    node.primaryAuthorPercentage ??
    contributors[0]?.percentage ??
    (primaryAuthor ? 100 : 0);

  // 3. Resolve risk level
  let risk: 'high' | 'medium' | 'low';
  if (node.knowledgeRisk) {
    risk = node.knowledgeRisk;
  } else {
    const churnScore = node.churnScore ?? 0;
    const loc = node.loc ?? 0;
    const contribCount = contributors.length || 1;

    if (pct >= 75 && commitCount >= 2) {
      if (churnScore >= 0.25 || loc >= 150 || contribCount === 1) {
        risk = 'high';
      } else {
        risk = 'medium';
      }
    } else if (pct >= 75) {
      risk = loc >= 150 ? 'high' : 'medium';
    } else if (pct >= 50 || contribCount <= 2) {
      risk = 'medium';
    } else {
      risk = 'low';
    }
  }

  // 4. Distinct, beautiful risk colors matching the design system
  if (risk === 'high') {
    return isLight ? 'rgba(239, 68, 68, 0.92)' : 'rgba(220, 38, 38, 0.95)';
  }
  if (risk === 'medium') {
    return isLight ? 'rgba(245, 158, 11, 0.92)' : 'rgba(217, 119, 6, 0.95)';
  }
  return isLight ? 'rgba(16, 185, 129, 0.92)' : 'rgba(5, 150, 105, 0.95)';
}

export function collectNodes(
  node: TreeNode,
  targetType: 'file' | 'class' | 'method',
  list: TreeNode[] = []
): TreeNode[] {
  if (node.type === targetType) {
    list.push(node);
    return list;
  }
  if (node.children) {
    for (const child of node.children) {
      collectNodes(child, targetType, list);
    }
  }
  return list;
}

export function flattenTreeToFiles(node: TreeNode): TreeNode[] {
  const files: TreeNode[] = [];
  function traverse(n: TreeNode) {
    if (n.type === 'file') {
      files.push({ ...n, children: undefined });
    } else if (n.children) {
      for (const child of n.children) traverse(child);
    }
  }
  traverse(node);
  return files;
}

export function flattenTreeToClasses(node: TreeNode): TreeNode[] {
  const classes: TreeNode[] = [];
  function traverse(n: TreeNode) {
    if (n.type === 'class') {
      classes.push({ ...n, children: undefined });
    } else if (n.type === 'file') {
      const hasClasses = n.children?.some((c) => c.type === 'class');
      if (hasClasses) {
        if (n.children) {
          for (const child of n.children) traverse(child);
        }
      } else {
        classes.push({ ...n, name: `${n.name} (Modul)`, children: undefined });
      }
    } else if (n.children) {
      for (const child of n.children) traverse(child);
    }
  }
  traverse(node);
  return classes;
}

export function flattenTreeToFunctions(node: TreeNode): TreeNode[] {
  const functions: TreeNode[] = [];
  function traverse(n: TreeNode, currentFilePath?: string) {
    const file = n.type === 'file' ? n.path : currentFilePath;
    if (n.type === 'method') {
      functions.push({ ...n, path: file || n.path, children: undefined });
    } else if (n.children) {
      for (const child of n.children) traverse(child, file);
    }
  }
  traverse(node);
  return functions;
}

export function prepareHierarchy(node: TreeNode): TreeNode {
  if (node.type === 'file') {
    return { ...node, children: undefined };
  }
  return {
    ...node,
    children: node.children ? node.children.map(prepareHierarchy) : undefined,
  };
}

export function renderTooltipHtml(n: TreeNode, isLight: boolean, language: Language = 'de'): string {
  const t = WEBVIEW_STRINGS[language]?.tooltip || WEBVIEW_STRINGS.de.tooltip;
  const typeLabel =
    n.type === 'method'
      ? t.method
      : n.type === 'class'
      ? t.class
      : n.type === 'file'
      ? t.file
      : t.folder;

  const churnPct = Math.round((n.churnScore ?? 0) * 100);
  const churnColor =
    (n.churnScore ?? 0) > 0.66
      ? '#ef4444'
      : (n.churnScore ?? 0) > 0.33
      ? '#f59e0b'
      : '#16a34a';

  const textColor = '#0f172a';
  const mutedColor = '#64748b';
  const dividerColor = '#f1f5f9';
  const badgeBg = '#f1f5f9';

  return `
    <div style="font-family: var(--vscode-font-family, Inter, sans-serif); min-width: 200px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 10px; text-transform: uppercase; background: ${badgeBg}; color: ${mutedColor}; padding: 2px 6px; border-radius: 4px; font-weight: 600; letter-spacing: 0.05em;">
          ${typeLabel}
        </span>
        ${
          n.startLine
            ? `<span style="font-size: 11px; color: ${isLight ? '#2563eb' : '#38bdf8'}; font-weight: 500;">${t.linesRange(n.startLine, n.endLine ?? n.startLine)}</span>`
            : ''
        }
      </div>
      <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px; color: ${textColor}; word-break: break-all;">
        ${n.name}
      </div>
      ${
        n.path
          ? `<div style="color: ${mutedColor}; font-size: 11px; margin-bottom: 8px; word-break: break-all;">${n.path}</div>`
          : ''
      }
      <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px;">
        <span style="color: ${mutedColor};">${t.fileSize}</span>
        <strong style="color: ${textColor};">${(n.loc ?? 0).toLocaleString()}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px;">
        <span style="color: ${mutedColor};">${t.gitCommits}</span>
        <strong style="color: ${textColor};">${n.commitCount ?? 0}</strong>
      </div>
      ${
        n.fixCount != null && n.fixCount > 0
          ? `<div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px;">
              <span style="color: ${mutedColor};">${t.bugFixesCount}</span>
              <strong style="color: #ef4444;">${n.fixCount}</strong>
            </div>`
          : ''
      }
      <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-top: 4px; padding-top: 4px; border-top: 1px solid ${dividerColor};">
        <span style="color: ${mutedColor};">${t.hotspotChurn}</span>
        <strong style="color: ${churnColor}; font-weight: 600;">${churnPct}%</strong>
      </div>
      ${
        n.codeHealth != null
          ? `<div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-top: 3px;">
              <span style="color: ${mutedColor};">${t.codeHealth}</span>
              <strong style="color: ${n.codeHealth >= 9 ? '#10b981' : n.codeHealth >= 6 ? '#f59e0b' : '#ef4444'}; font-weight: 600;">${n.codeHealth.toFixed(1)}/10</strong>
            </div>`
          : ''
      }
      ${
        n.temporalCoupling && n.temporalCoupling.length > 0
          ? (() => {
              const maxCoupling = Math.max(...n.temporalCoupling.map((c) => c.couplingDegree));
              const maxPct = Math.round(maxCoupling * 100);
              const coupColor = maxCoupling >= 0.7 ? '#ef4444' : maxCoupling >= 0.4 ? '#f59e0b' : '#10b981';
              const partnerLabel = n.temporalCoupling.length === 1 ? t.partnerSingle : t.partnerPlural;
              return `<div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-top: 3px;">
                <span style="color: ${mutedColor};">${t.maxCoupling}</span>
                <strong style="color: ${coupColor}; font-weight: 600;">${maxPct}% (${n.temporalCoupling.length} ${partnerLabel})</strong>
              </div>`;
            })()
          : ''
      }
      ${
        (() => {
          const author = n.primaryAuthor || n.contributors?.[0]?.name;
          if (!author) return '';
          const pct = Math.round(
            n.primaryAuthorPercentage ?? n.contributors?.[0]?.percentage ?? 100
          );
          const risk = n.knowledgeRisk || (pct >= 75 ? 'high' : pct >= 50 ? 'medium' : 'low');
          const riskColor = risk === 'high' ? '#ef4444' : risk === 'medium' ? '#f59e0b' : '#10b981';
          const riskLabel =
            risk === 'high'
              ? (t.highRisk || 'Hohes Risiko (≥ 75%)')
              : risk === 'medium'
              ? (t.mediumRisk || 'Mittleres Risiko (50–74%)')
              : (t.lowRisk || 'Geteiltes Wissen (< 50%)');

          return `
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid ${dividerColor};">
              <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 2px;">
                <span style="color: ${mutedColor};">${t.primaryAuthor}</span>
                <strong style="color: ${riskColor}; font-weight: 600;">${author} (${pct}%)</strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                <span style="color: ${mutedColor};">${t.monopolyRisk || 'Monopolrisiko:'}</span>
                <strong style="color: ${riskColor}; font-weight: 600;">${riskLabel}</strong>
              </div>
            </div>
          `;
        })()
      }
    </div>
  `;
}

export const TreemapViewer: React.FC<Props> = ({
  tree,
  viewMode = 'files',
  sizeMetric = 'loc',
  colorMetric = 'fixes',
  maxItems = 100,
  onNodeClick,
  selectedNode,
  language = 'de',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isLight = useIsLightTheme();
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const selectedCoupledMap = useMemo(() => {
    if (!selectedNode?.temporalCoupling || selectedNode.temporalCoupling.length === 0) {
      return null;
    }
    const map = new Map<string, number>();
    for (const c of selectedNode.temporalCoupling) {
      map.set(c.partnerPath, c.couplingDegree);
    }
    return map;
  }, [selectedNode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const getNodeValue = (node: TreeNode): number => {
    if (sizeMetric === 'churn') return Math.max(node.commitCount, 1);
    if (sizeMetric === 'fixes') return Math.max(node.fixCount, 1);
    if (sizeMetric === 'added') return Math.max(node.linesAdded, 1);
    return Math.max(node.loc, 1);
  };

  const maxAdded = useMemo(() => {
    let max = 1;
    function scan(n: TreeNode) {
      if ((n.linesAdded ?? 0) > max) max = n.linesAdded ?? 0;
      n.children?.forEach(scan);
    }
    scan(tree);
    return max;
  }, [tree]);

  const getNodeColor = (node: TreeNode): string => {
    if (colorMetric === 'health') {
      return getCodeHealthColor(node.codeHealth);
    } else if (colorMetric === 'coupling') {
      return getCouplingColor(node, isLight);
    } else if (colorMetric === 'churn') {
      return getHeatColor(node.churnScore, isLight);
    } else if (colorMetric === 'fixes') {
      const fixRatio = node.commitCount > 0 ? (node.fixCount || 0) / node.commitCount : 0;
      return getHeatColor(fixRatio, isLight);
    } else if (colorMetric === 'growth') {
      return getGrowthColor(node.linesAdded || 0, maxAdded, isLight);
    } else if (colorMetric === 'recency') {
      return getRecencyColor(node.lastModifiedAt, isLight);
    } else if (colorMetric === 'knowledge') {
      return getKnowledgeColor(node, isLight);
    }
    return isLight ? '#60a5fa' : '#3b82f6';
  };

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;

    const width = dimensions.width || containerRef.current.clientWidth || 800;
    const height = dimensions.height || containerRef.current.clientHeight || 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    let displayData: TreeNode;

    if (viewMode === 'hierarchy') {
      displayData = prepareHierarchy(tree);
    } else {
      let items: TreeNode[];
      if (viewMode === 'classes') {
        items = flattenTreeToClasses(tree);
      } else if (viewMode === 'functions') {
        items = flattenTreeToFunctions(tree);
      } else {
        items = flattenTreeToFiles(tree);
      }

      items.sort((a, b) => getNodeValue(b) - getNodeValue(a));
      const limited = maxItems > 0 ? items.slice(0, maxItems) : items;

      displayData = {
        name: 'root',
        path: '/',
        type: 'folder',
        value: limited.reduce((sum, item) => sum + getNodeValue(item), 0),
        loc: limited.reduce((sum, item) => sum + item.loc, 0),
        commitCount: 0,
        churnScore: 0,
        fixCount: 0,
        featCount: 0,
        refactorCount: 0,
        linesAdded: 0,
        linesDeleted: 0,
        children: limited,
      };
    }

    const root = d3
      .hierarchy<TreeNode>(displayData)
      .sum((d) => (d.children && d.children.length > 0 ? 0 : getNodeValue(d)))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3
      .treemap<TreeNode>()
      .tile(d3.treemapBinary)
      .size([width, height])
      .paddingOuter(2)
      .paddingInner(1)
      .round(true)(root);

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%');

    const leaves = root.leaves();
    const g = svg.append('g');

    const borderColor = isLight ? '#ffffff' : '#1e1e1e';
    const updateTooltipPosition = (event: MouseEvent) => {
      if (!tooltipRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let x = event.clientX - rect.left + 12;
      let y = event.clientY - rect.top + 12;
      const tipWidth = tooltipRef.current.offsetWidth || 230;
      const tipHeight = tooltipRef.current.offsetHeight || 160;
      if (x + tipWidth > rect.width - 8) {
        x = Math.max(8, event.clientX - rect.left - tipWidth - 12);
      }
      if (y + tipHeight > rect.height - 8) {
        y = Math.max(8, event.clientY - rect.top - tipHeight - 12);
      }
      tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const cell = g
      .selectAll('g')
      .data(leaves)
      .join('g')
      .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`)
      .style('cursor', 'pointer')
      .on('click', (_event, d: any) => {
        onNodeClick?.(d.data);
      })
      .on('mouseenter', function (this: SVGGElement, event: MouseEvent, d: any) {
        d3.select(this)
          .select('rect')
          .style('filter', 'brightness(1.18)');
        if (tooltipRef.current) {
          tooltipRef.current.innerHTML = renderTooltipHtml(d.data, isLight, language);
          tooltipRef.current.style.display = 'block';
          updateTooltipPosition(event);
        }
      })
      .on('mousemove', function (event: MouseEvent) {
        updateTooltipPosition(event);
      })
      .on('mouseleave', function (this: SVGGElement) {
        d3.select(this)
          .select('rect')
          .style('filter', 'none');
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'none';
        }
      });

    const hasActiveSelection = Boolean(selectedNode);

    cell
      .append('rect')
      .attr('width', (d: any) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d: any) => Math.max(0, d.y1 - d.y0))
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', (d: any) => getNodeColor(d.data))
      .attr('stroke', (d: any) => {
        const isSelected = selectedNode && d.data.path === selectedNode.path;
        const isCoupled = selectedCoupledMap?.has(d.data.path);
        if (isSelected) return isLight ? '#2563eb' : '#38bdf8';
        if (isCoupled) return '#f59e0b';
        return borderColor;
      })
      .attr('stroke-width', (d: any) => {
        const isSelected = selectedNode && d.data.path === selectedNode.path;
        const isCoupled = selectedCoupledMap?.has(d.data.path);
        if (isSelected) return 3;
        if (isCoupled) return 2.5;
        return 1;
      })
      .attr('stroke-dasharray', (d: any) => {
        const isSelected = selectedNode && d.data.path === selectedNode.path;
        const isCoupled = selectedCoupledMap?.has(d.data.path);
        if (!isSelected && isCoupled) return '4,2';
        return null;
      })
      .style('opacity', (d: any) => {
        if (!hasActiveSelection) return 1.0;
        const isSelected = d.data.path === selectedNode?.path;
        const isCoupled = selectedCoupledMap?.has(d.data.path);
        return isSelected || isCoupled ? 1.0 : 0.35;
      })
      .style('transition', 'filter 0.15s ease, opacity 0.2s ease');

    // Centered label rendering matching ECharts design with Name and LOC in block
    cell.each(function (this: SVGGElement, d: any) {
      const w = Math.max(0, d.x1 - d.x0);
      const h = Math.max(0, d.y1 - d.y0);
      if (w < 36 || h < 18) return;

      const n = d.data as TreeNode;
      const gCell = d3.select(this);

      const text = gCell
        .append('text')
        .attr('x', w / 2)
        .attr('y', h / 2)
        .attr('text-anchor', 'middle')
        .style('pointer-events', 'none')
        .style('user-select', 'none')
        .style('font-family', 'var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)');

      const name = n.name || '';
      const maxChars = Math.max(3, Math.floor(w / 7.2));
      const displayName = name.length > maxChars ? name.slice(0, Math.max(1, maxChars - 1)) + '…' : name;

      const author = n.primaryAuthor || n.contributors?.[0]?.name;
      const pct = Math.round(
        n.primaryAuthorPercentage ?? n.contributors?.[0]?.percentage ?? (author ? 100 : 0)
      );
      const isKnowledgeMode = colorMetric === 'knowledge';
      const knowledgeLine = author
        ? (w >= 75 ? `${author} (${pct}%)` : `${pct}%`)
        : `${pct}% Monopol`;

      const canFitThreeLines = isKnowledgeMode && h >= 50 && w >= 48;
      const canFitTwoLines = h >= 34 && w >= 42;

      const titleColor = isLight ? '#0f172a' : '#ffffff';
      const subColor = isLight ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.82)';
      const knowledgeColor = isLight ? '#0f172a' : '#ffffff';

      if (canFitThreeLines) {
        const loc = (n.loc ?? 0).toLocaleString();
        const locText =
          n.commitCount && n.commitCount > 0 && w >= 95
            ? `${loc} LOC · ${n.commitCount} Commits`
            : `${loc} LOC`;

        // Line 1: File/Class name
        text
          .append('tspan')
          .attr('x', w / 2)
          .attr('dy', '-1.15em')
          .attr('font-size', '11.5px')
          .attr('font-weight', '600')
          .attr('fill', titleColor)
          .text(displayName);

        // Line 2: LOC & Commits
        text
          .append('tspan')
          .attr('x', w / 2)
          .attr('dy', '1.25em')
          .attr('font-size', '9.5px')
          .attr('font-weight', '500')
          .attr('fill', subColor)
          .text(locText);

        // Line 3: Dedicated new line for Monopolwissen
        text
          .append('tspan')
          .attr('x', w / 2)
          .attr('dy', '1.25em')
          .attr('font-size', '9.5px')
          .attr('font-weight', '600')
          .attr('fill', knowledgeColor)
          .text(knowledgeLine);
      } else if (canFitTwoLines) {
        const loc = (n.loc ?? 0).toLocaleString();
        const coupledDegree = selectedCoupledMap?.get(n.path);
        let metricText = `${loc} LOC`;

        if (isKnowledgeMode) {
          metricText = knowledgeLine;
        } else if (coupledDegree !== undefined) {
          metricText = `${Math.round(coupledDegree * 100)}% 🔗 · ${loc} LOC`;
        } else if (n.commitCount && n.commitCount > 0 && w >= 95) {
          metricText = `${loc} LOC · ${n.commitCount} Commits`;
        }

        text
          .append('tspan')
          .attr('x', w / 2)
          .attr('dy', '-0.3em')
          .attr('font-size', '11.5px')
          .attr('font-weight', '600')
          .attr('fill', titleColor)
          .text(displayName);

        text
          .append('tspan')
          .attr('x', w / 2)
          .attr('dy', '1.35em')
          .attr('font-size', '9.5px')
          .attr('font-weight', isKnowledgeMode ? '600' : '500')
          .attr('fill', isKnowledgeMode ? knowledgeColor : subColor)
          .text(metricText);
      } else {
        text
          .attr('dominant-baseline', 'central')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .attr('fill', titleColor)
          .text(displayName);
      }
    });
  }, [tree, viewMode, sizeMetric, colorMetric, maxItems, isLight, dimensions, selectedNode, selectedCoupledMap]);

  const t = WEBVIEW_STRINGS[language] || WEBVIEW_STRINGS.de;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Top Legend HUD matching active colorMetric */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 11,
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-card)',
          padding: '5px 12px',
          borderRadius: 20,
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          zIndex: 10,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        <span title={t.codeHealth.legendInfo} style={{ display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiInformationOutline} size={0.65} color="var(--text-secondary)" />
        </span>
        {colorMetric === 'health' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }} />
              <span>{t.codeHealth.unhealthy} (&lt;6)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              <span>{t.codeHealth.warning} (6-8)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span>{t.codeHealth.healthy} (&gt;8)</span>
            </div>
          </>
        ) : colorMetric === 'churn' ? (
          <>
            <span style={{ fontSize: 10.5 }}>{t.legend.churn}</span>
            <span style={{ color: '#10b981' }}>● {t.legend.churnLow}</span>
            <span style={{ color: '#f59e0b' }}>● {t.legend.churnMed}</span>
            <span style={{ color: '#ef4444' }}>● {t.legend.churnHigh}</span>
          </>
        ) : colorMetric === 'fixes' ? (
          <>
            <span style={{ fontSize: 10.5 }}>{t.legend.fixes}</span>
            <span style={{ color: '#10b981' }}>● {t.legend.fixesNone}</span>
            <span style={{ color: '#f59e0b' }}>● {t.legend.fixesSome}</span>
            <span style={{ color: '#ef4444' }}>● {t.legend.fixesMany}</span>
          </>
        ) : colorMetric === 'growth' ? (
          <>
            <span style={{ fontSize: 10.5 }}>{t.legend.growth}</span>
            <span style={{ color: '#60a5fa' }}>● {t.legend.growthLow}</span>
            <span style={{ color: '#10b981' }}>● {t.legend.growthHigh}</span>
          </>
        ) : colorMetric === 'coupling' ? (
          <>
            <span style={{ fontSize: 10.5 }}>{t.legend.coupling}</span>
            <span style={{ color: 'var(--accent-color)' }}>● {t.coupling.slightCoupling}</span>
            <span style={{ color: '#f59e0b' }}>● {t.coupling.moderateCoupling}</span>
            <span style={{ color: '#ef4444' }}>● {t.coupling.criticalCoupling}</span>
          </>
        ) : colorMetric === 'knowledge' ? (
          <>
            <span style={{ fontSize: 10.5 }}>{t.legend.knowledge}</span>
            <span style={{ color: '#10b981' }}>● {t.knowledge.lowRisk}</span>
            <span style={{ color: '#f59e0b' }}>● {t.knowledge.mediumRisk}</span>
            <span style={{ color: '#ef4444' }}>● {t.knowledge.highRisk}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 10.5 }}>{t.legend.recency}</span>
            <span style={{ color: '#3b82f6' }}>● {t.legend.fresh}</span>
            <span style={{ opacity: 0.6 }}>● {t.legend.older}</span>
          </>
        )}
      </div>

      <svg
        ref={svgRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'none',
          pointerEvents: 'none',
          zIndex: 1000,
          backgroundColor: '#ffffff',
          color: '#0f172a',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          padding: '10px 14px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 4px 6px -4px rgba(0, 0, 0, 0.08)',
          minWidth: 215,
          backdropFilter: 'blur(8px)',
          willChange: 'transform',
        }}
      />
    </div>
  );
};
