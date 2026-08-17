import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { TreeNode } from '@auspex/shared';
import { useMemo } from 'react';
import { useRepoStore } from '../../store/useRepoStore';

export type TreemapViewMode = 'files' | 'classes' | 'functions' | 'hierarchy';

interface Props {
  tree: TreeNode;
  viewMode?: TreemapViewMode;
  onNodeClick?: (node: TreeNode) => void;
}

/**
 * Calculates a smooth, modern heat color for churn:
 * Low churn (0.0): #22c55e (vibrant green)
 * Medium churn (0.5): #eab308 (warm amber)
 * High churn (1.0): #ef4444 (hotspot red)
 */
function getChurnColor(score: number, isLight: boolean): string {
  const churn = Math.max(0, Math.min(score ?? 0, 1));
  let r: number, g: number, b: number;

  if (churn < 0.5) {
    const t = churn * 2;
    r = Math.round(34 + t * (234 - 34));
    g = Math.round(197 + t * (179 - 197));
    b = Math.round(94 + t * (8 - 94));
  } else {
    const t = (churn - 0.5) * 2;
    r = Math.round(234 + t * (239 - 234));
    g = Math.round(179 - t * (179 - 68));
    b = Math.round(8 - t * 8);
  }

  const alpha = isLight ? 0.78 : 0.84;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toEChartsData(node: TreeNode, isFlat: boolean, isLight: boolean): unknown {
  const color = getChurnColor(node.churnScore, isLight);

  const item: Record<string, unknown> = {
    name: node.name,
    value: node.value || node.loc || 1,
    path: node.path,
    type: node.type,
    loc: node.loc,
    commitCount: node.commitCount,
    churnScore: node.churnScore,
    startLine: node.startLine,
    endLine: node.endLine,
    filePath: node.filePath,
    className: node.className,
    itemStyle: {
      color,
      borderRadius: 4,
      borderColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.6)',
      borderWidth: 1,
    },
  };

  if (!isFlat && node.children && node.children.length > 0) {
    item.children = node.children.map((c) => toEChartsData(c, false, isLight));
  }

  return item;
}

function flattenTreeToFiles(node: TreeNode): TreeNode[] {
  const files: TreeNode[] = [];
  function traverse(n: TreeNode) {
    if (n.type === 'file') {
      files.push({ ...n });
    } else if (n.children) {
      for (const child of n.children) traverse(child);
    }
  }
  traverse(node);
  return files.sort((a, b) => b.loc - a.loc);
}

function flattenTreeToClasses(node: TreeNode): TreeNode[] {
  const classes: TreeNode[] = [];
  function traverse(n: TreeNode) {
    if (n.type === 'class') {
      classes.push({ ...n });
    } else if (n.type === 'file') {
      const hasClasses = n.children?.some((c) => c.type === 'class');
      if (hasClasses) {
        if (n.children) {
          for (const child of n.children) traverse(child);
        }
      } else {
        classes.push({ ...n, name: `${n.name} (module)` });
      }
    } else if (n.children) {
      for (const child of n.children) traverse(child);
    }
  }
  traverse(node);
  return classes.sort((a, b) => b.loc - a.loc);
}

function flattenTreeToFunctions(node: TreeNode): TreeNode[] {
  const functions: TreeNode[] = [];
  function traverse(n: TreeNode, currentFilePath?: string) {
    const file = n.filePath || (n.type === 'file' ? n.path : currentFilePath);
    if (n.type === 'method') {
      functions.push({ ...n, filePath: file });
    } else if (n.children) {
      for (const child of n.children) traverse(child, file);
    }
  }
  traverse(node);
  return functions.sort((a, b) => b.loc - a.loc);
}

export function TreemapViewer({ tree, viewMode = 'files', onNodeClick }: Props) {
  const theme = useRepoStore((s) => s.theme);
  const isLight = theme === 'light';
  const isHierarchy = viewMode === 'hierarchy';

  const chartData = useMemo(() => {
    switch (viewMode) {
      case 'classes': {
        const classes = flattenTreeToClasses(tree);
        return classes.map((c) => toEChartsData(c, true, isLight));
      }
      case 'functions': {
        const fns = flattenTreeToFunctions(tree);
        return fns.map((f) => toEChartsData(f, true, isLight));
      }
      case 'hierarchy': {
        return [toEChartsData(tree, false, isLight)];
      }
      case 'files':
      default: {
        const files = flattenTreeToFiles(tree);
        return files.map((f) => toEChartsData(f, true, isLight));
      }
    }
  }, [tree, viewMode, isLight]);

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: 'transparent',
      animationDuration: 400,
      tooltip: {
        backgroundColor: isLight ? '#ffffff' : '#13161e',
        borderColor: isLight ? '#e2e8f0' : '#252b3b',
        borderWidth: 1,
        padding: [10, 14],
        extraCssText: isLight ? 'box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);' : '',
        textStyle: { color: isLight ? '#0f172a' : '#e8ecf3', fontFamily: 'Inter, sans-serif' },
        formatter: (info: unknown) => {
          const d = (info as { data: Record<string, unknown> }).data;
          if (!d) return '';
          const churnPct = Math.round(((d.churnScore as number) ?? 0) * 100);
          const churnColor =
            (d.churnScore as number) > 0.66
              ? '#ef4444'
              : (d.churnScore as number) > 0.33
              ? '#f59e0b'
              : isLight
              ? '#16a34a'
              : '#22c55e';

          const typeLabel =
            d.type === 'method'
              ? '⚡ Function / Method'
              : d.type === 'class'
              ? '🏛️ Class / Struct'
              : d.type === 'file'
              ? '📄 File'
              : '📁 Folder';

          const textColor = isLight ? '#0f172a' : '#ffffff';
          const mutedColor = isLight ? '#64748b' : '#8b95a8';
          const dividerColor = isLight ? '#f1f5f9' : '#252b3b';

          return `
            <div style="font-family: Inter, sans-serif; min-width: 200px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 11px; text-transform: uppercase; color: ${mutedColor}; letter-spacing: 0.05em;">
                  ${typeLabel}
                </span>
                ${
                  d.startLine
                    ? `<span style="font-size: 11px; color: ${isLight ? '#4f46e5' : '#6366f1'}; font-weight: 500;">Lines ${d.startLine}–${d.endLine}</span>`
                    : ''
                }
              </div>
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 3px; color: ${textColor}; word-break: break-all;">
                ${d.name as string}
              </div>
              ${
                d.filePath
                  ? `<div style="color: ${mutedColor}; font-size: 11px; margin-bottom: 8px; word-break: break-all;">📁 ${d.filePath}</div>`
                  : d.path
                  ? `<div style="color: ${mutedColor}; font-size: 11px; margin-bottom: 8px; word-break: break-all;">${d.path}</div>`
                  : ''
              }
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px;">
                <span style="color: ${mutedColor};">Size (LOC):</span>
                <strong style="color: ${textColor};">${((d.loc as number) ?? 0).toLocaleString()}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px;">
                <span style="color: ${mutedColor};">Git Commits:</span>
                <strong style="color: ${textColor};">${d.commitCount as number}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; padding-top: 4px; border-top: 1px solid ${dividerColor};">
                <span style="color: ${mutedColor};">Hotspot Churn:</span>
                <strong style="color: ${churnColor}; font-weight: 600;">${churnPct}%</strong>
              </div>
            </div>
          `;
        },
      },
      series: [
        {
          type: 'treemap',
          data: chartData,
          top: isHierarchy ? 38 : 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          height: isHierarchy ? 'calc(100% - 38px)' : '100%',
          roam: false,
          nodeClick: isHierarchy ? 'zoomToNode' : false,
          leafDepth: isHierarchy ? 1 : undefined,
          drillDownIcon: '',
          visibleMin: 250,
          breadcrumb: {
            show: isHierarchy,
            top: 4,
            left: 4,
            height: 26,
            emptyItemWidth: 25,
            itemStyle: {
              color: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(26, 30, 42, 0.95)',
              borderColor: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.15)',
              borderWidth: 1,
              textStyle: {
                color: isLight ? '#0f172a' : '#e8ecf3',
                fontSize: 12,
                fontFamily: 'Inter, sans-serif',
              },
            },
          },
          label: {
            show: true,
            formatter: '{b}',
            fontSize: 12,
            fontWeight: 500,
            color: '#ffffff',
            textShadowColor: 'rgba(0, 0, 0, 0.55)',
            textShadowBlur: 2,
            fontFamily: 'Inter, sans-serif',
            overflow: 'truncate',
          },
          upperLabel: {
            show: false,
          },
          itemStyle: {
            borderWidth: 0,
            gapWidth: 2,
            borderColor: 'transparent',
          },
          levels: [
            {
              itemStyle: {
                borderWidth: 0,
                gapWidth: 3,
                borderColor: 'transparent',
              },
            },
            {
              itemStyle: {
                borderWidth: 0,
                gapWidth: 2,
                borderColor: 'transparent',
              },
            },
            {
              itemStyle: {
                borderWidth: 0,
                gapWidth: 1,
                borderColor: 'transparent',
              },
            },
          ],
        },
      ],
    }),
    [chartData, isHierarchy, isLight]
  );

  const handleEvents = {
    click: (params: unknown) => {
      if (onNodeClick) {
        const d = (params as { data: Record<string, unknown> }).data;
        if (d) {
          onNodeClick(d as unknown as TreeNode);
        }
      }
    },
  };

  return (
    <ReactECharts
      option={option}
      onEvents={handleEvents}
      style={{ width: '100%', height: '100%' }}
      notMerge
      lazyUpdate
    />
  );
}
