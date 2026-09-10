import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { TreeNode } from '../../../src/analyzer/types';

export type TreemapViewMode = 'files' | 'classes' | 'functions' | 'hierarchy';
export type SizeMetric = 'loc' | 'churn' | 'fixes' | 'added';
export type ColorMetric = 'fixes' | 'churn' | 'growth' | 'recency' | 'loc';

interface Props {
  tree: TreeNode;
  viewMode?: TreemapViewMode;
  sizeMetric?: SizeMetric;
  colorMetric?: ColorMetric;
  maxItems?: number;
  onNodeClick?: (node: TreeNode) => void;
}

function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(() => {
    return (
      document.body.classList.contains('vscode-light') ||
      document.body.classList.contains('vscode-high-contrast-light')
    );
  });

  useEffect(() => {
    const checkTheme = () => {
      const light =
        document.body.classList.contains('vscode-light') ||
        document.body.classList.contains('vscode-high-contrast-light');
      setIsLight(light);
    };

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: light)');
    const handleMedia = () => checkTheme();
    mediaQuery?.addEventListener?.('change', handleMedia);

    return () => {
      observer.disconnect();
      mediaQuery?.removeEventListener?.('change', handleMedia);
    };
  }, []);

  return isLight;
}

function getHeatColor(score: number, isLight: boolean): string {
  const normalized = Math.max(0, Math.min(score ?? 0, 1));
  let r: number, g: number, b: number;

  if (isLight) {
    // Brighter, higher-luminance palette for light mode
    if (normalized < 0.5) {
      const t = normalized * 2;
      // Mint green (74, 222, 128) -> Sunny warm amber (251, 191, 36)
      r = Math.round(74 + t * (251 - 74));
      g = Math.round(222 + t * (191 - 222));
      b = Math.round(128 + t * (36 - 128));
    } else {
      const t = (normalized - 0.5) * 2;
      // Sunny warm amber (251, 191, 36) -> Bright coral red (248, 113, 113)
      r = Math.round(251 + t * (248 - 251));
      g = Math.round(191 - t * (191 - 113));
      b = Math.round(36 + t * (113 - 36));
    }
    return `rgba(${r}, ${g}, ${b}, 0.95)`;
  }

  // Dark mode as it was
  if (normalized < 0.5) {
    const t = normalized * 2;
    r = Math.round(34 + t * (234 - 34));
    g = Math.round(197 + t * (179 - 197));
    b = Math.round(94 + t * (8 - 94));
  } else {
    const t = (normalized - 0.5) * 2;
    r = Math.round(234 + t * (239 - 234));
    g = Math.round(179 - t * (179 - 68));
    b = Math.round(8 - t * 8);
  }

  return `rgba(${r}, ${g}, ${b}, 0.85)`;
}

function getGrowthColor(linesAdded: number, maxAdded: number, isLight: boolean): string {
  const ratio = Math.max(0, Math.min(linesAdded / Math.max(maxAdded, 1), 1));
  if (isLight) {
    // Brighter emerald / cyan in light mode
    const r = Math.round(45 + ratio * (16 - 45));
    const g = Math.round(212 + ratio * (235 - 212));
    const b = Math.round(191 + ratio * (160 - 191));
    return `rgba(${r}, ${g}, ${b}, 0.95)`;
  }

  const r = Math.round(16 + ratio * (6 - 16));
  const g = Math.round(185 + ratio * (214 - 185));
  const b = Math.round(129 + ratio * (240 - 129));
  return `rgba(${r}, ${g}, ${b}, 0.85)`;
}

function getRecencyColor(lastModifiedAt: number | undefined, isLight: boolean): string {
  if (!lastModifiedAt) {
    return isLight ? 'rgba(203, 213, 225, 0.9)' : 'rgba(148, 163, 184, 0.7)';
  }
  const ageDays = (Date.now() - lastModifiedAt) / (1000 * 60 * 60 * 24);
  const freshness = Math.max(0, Math.min(1 - ageDays / 90, 1));

  if (isLight) {
    // Brighter sky blue to soft silver in light mode
    const r = Math.round(96 + (1 - freshness) * (203 - 96));
    const g = Math.round(165 + (1 - freshness) * (213 - 165));
    const b = Math.round(250 + (1 - freshness) * (225 - 250));
    return `rgba(${r}, ${g}, ${b}, 0.95)`;
  }

  const r = Math.round(79 + (1 - freshness) * (148 - 79));
  const g = Math.round(70 + (1 - freshness) * (163 - 70));
  const b = Math.round(229 + (1 - freshness) * (184 - 229));
  return `rgba(${r}, ${g}, ${b}, 0.85)`;
}

function collectNodes(
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

export const TreemapViewer: React.FC<Props> = ({
  tree,
  viewMode = 'files',
  sizeMetric = 'loc',
  colorMetric = 'fixes',
  maxItems = 100,
  onNodeClick,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsInstance = useRef<echarts.ECharts | null>(null);
  const isLight = useIsLightTheme();

  useEffect(() => {
    if (!chartRef.current) return;

    // Dispose and recreate if theme changes so ECharts applies the correct theme palette
    if (echartsInstance.current) {
      echartsInstance.current.dispose();
      echartsInstance.current = null;
    }

    echartsInstance.current = echarts.init(chartRef.current, isLight ? undefined : 'dark');
    echartsInstance.current.on('click', (params: any) => {
      if (params.data && params.data.rawNode && onNodeClick) {
        onNodeClick(params.data.rawNode);
      }
    });

    const chart = echartsInstance.current;

    // Scan max metrics for scaling
    let maxAdded = 1;
    const findMax = (n: TreeNode) => {
      if ((n.linesAdded ?? 0) > maxAdded) maxAdded = n.linesAdded ?? 0;
      n.children?.forEach(findMax);
    };
    findMax(tree);

    const getNodeValue = (node: TreeNode): number => {
      if (sizeMetric === 'churn') return Math.max(node.commitCount, 1);
      if (sizeMetric === 'fixes') return Math.max(node.fixCount, 1);
      if (sizeMetric === 'added') return Math.max(node.linesAdded, 1);
      return Math.max(node.loc, 1);
    };

    const getNodeColor = (node: TreeNode): string => {
      if (colorMetric === 'churn') {
        return getHeatColor(node.churnScore, isLight);
      } else if (colorMetric === 'fixes') {
        const fixRatio = node.commitCount > 0 ? (node.fixCount || 0) / node.commitCount : 0;
        return getHeatColor(fixRatio, isLight);
      } else if (colorMetric === 'growth') {
        return getGrowthColor(node.linesAdded || 0, maxAdded, isLight);
      } else if (colorMetric === 'recency') {
        return getRecencyColor(node.lastModifiedAt, isLight);
      }
      return isLight ? '#60a5fa' : '#3b82f6';
    };

    const tileBorderColor = isLight ? '#ffffff' : '#1e1e1e';

    let chartData: any[] = [];

    if (viewMode === 'hierarchy') {
      // Nested hierarchy mode
      const transformHierarchy = (node: TreeNode): any => {
        const value = getNodeValue(node);
        const color = getNodeColor(node);

        const item: any = {
          name: node.name,
          value,
          rawNode: node,
          itemStyle: {
            color,
            borderColor: tileBorderColor,
            borderWidth: 1,
          },
        };

        if (node.children && node.children.length > 0) {
          item.children = node.children.map(transformHierarchy);
        }
        return item;
      };

      chartData = tree.children ? tree.children.map(transformHierarchy) : [transformHierarchy(tree)];
    } else {
      // Flat list of individual files, classes, or functions (No folder blocks!)
      const targetType =
        viewMode === 'classes' ? 'class' : viewMode === 'functions' ? 'method' : 'file';
      const items = collectNodes(tree, targetType);

      // Sort by active sizeMetric descending
      items.sort((a, b) => getNodeValue(b) - getNodeValue(a));

      // Limit to top N items (e.g. 100)
      const limitedItems = maxItems > 0 ? items.slice(0, maxItems) : items;

      chartData = limitedItems.map((n) => {
        const value = getNodeValue(n);
        const color = getNodeColor(n);

        return {
          name: n.name,
          value,
          rawNode: n,
          itemStyle: {
            color,
            borderColor: tileBorderColor,
            borderWidth: 1,
            gapWidth: 2,
          },
        };
      });
    }

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: isLight ? '#ffffff' : '#252526',
        borderColor: isLight ? '#cbd5e1' : '#454545',
        borderWidth: 1,
        textStyle: { color: isLight ? '#1e293b' : '#cccccc', fontSize: 12 },
        extraCssText: isLight ? 'box-shadow: 0 4px 12px rgba(0,0,0,0.1);' : '',
        formatter: (info: any) => {
          const n = info.data?.rawNode as TreeNode;
          if (!n) return '';
          return `
            <div style="font-weight: 600; margin-bottom: 4px; color: ${isLight ? '#0284c7' : '#3794ff'};">${n.name}</div>
            <div style="font-size: 11px; color: ${isLight ? '#64748b' : '#888888'}; margin-bottom: 4px;">${n.path}</div>
            <div>Type: <b>${n.type}</b></div>
            <div>LOC: <b>${(n.loc || 0).toLocaleString()}</b></div>
            <div>Commits: <b>${n.commitCount || 0}</b></div>
            <div>Fixes: <b>${n.fixCount || 0}</b></div>
            <div>Churn Score: <b>${Math.round((n.churnScore || 0) * 100)}%</b></div>
            ${n.linesAdded ? `<div>Lines +${n.linesAdded} / -${n.linesDeleted}</div>` : ''}
          `;
        },
      },
      series: [
        {
          type: 'treemap',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          data: chartData,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          visibleMin: 200,
          label: {
            show: true,
            formatter: (params: any) => {
              const raw = params.data?.rawNode as TreeNode;
              if (!raw) return params.name;
              return `${raw.name}\n${(raw.loc || 0).toLocaleString()} LOC`;
            },
            fontSize: 11,
            fontWeight: 500,
            color: isLight ? '#0f172a' : '#ffffff',
            textShadowColor: isLight ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.7)',
            textShadowBlur: 2,
          },
          itemStyle: {
            borderColor: tileBorderColor,
            borderWidth: 1,
            gapWidth: 2,
          },
        },
      ],
    };

    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [tree, viewMode, sizeMetric, colorMetric, maxItems, isLight, onNodeClick]);

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
};
