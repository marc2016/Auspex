import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { TreeNode } from '@auspex/shared';
import { useMemo } from 'react';

interface Props {
  tree: TreeNode;
  onNodeClick?: (node: TreeNode) => void;
}

/**
 * Converts our TreeNode into ECharts treemap-compatible format.
 * ECharts uses `value` for tile size and `itemStyle.color` for the tile color.
 */
function toEChartsData(node: TreeNode): unknown {
  const churn = node.churnScore ?? 0;

  // Interpolate color from green (low churn) → orange → red (high churn)
  const r = Math.round(churn < 0.5 ? churn * 2 * (243 - 34) + 34 : 243);
  const g = Math.round(churn < 0.5 ? 197 - churn * 2 * (197 - 159) : 159 - (churn - 0.5) * 2 * 159);
  const b = Math.round(churn < 0.5 ? 99 - churn * 2 * 99 : 0);
  const color = `rgba(${r},${g},${b},0.75)`;

  return {
    name: node.name,
    value: node.value || node.loc || 1,
    path: node.path,
    type: node.type,
    loc: node.loc,
    commitCount: node.commitCount,
    churnScore: node.churnScore,
    itemStyle: { color, borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1 },
    children: node.children?.map(toEChartsData),
  };
}

export function TreemapViewer({ tree, onNodeClick }: Props) {
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (info: unknown) => {
        const d = (info as { data: Record<string, unknown> }).data;
        const churn = ((d.churnScore as number) * 100).toFixed(0);
        return `
          <div style="font-family: Inter, sans-serif; padding: 4px 0;">
            <div style="font-weight: 600; margin-bottom: 4px; color: #e8ecf3;">${d.name as string}</div>
            <div style="color: #8b95a8; font-size: 12px;">Type: ${d.type as string}</div>
            <div style="color: #8b95a8; font-size: 12px;">LOC: <strong style="color: #e8ecf3">${d.loc as number}</strong></div>
            <div style="color: #8b95a8; font-size: 12px;">Commits: <strong style="color: #e8ecf3">${d.commitCount as number}</strong></div>
            <div style="color: #8b95a8; font-size: 12px;">Churn: <strong style="color: ${(d.churnScore as number) > 0.6 ? '#ef4444' : '#22c55e'}">${churn}%</strong></div>
          </div>
        `;
      },
    },
    series: [
      {
        type: 'treemap',
        data: [toEChartsData(tree)],
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: 'zoomToNode',
        drillDownIcon: '',
        breadcrumb: {
          show: true,
          bottom: 16,
          left: 16,
          itemStyle: {
            color: 'rgba(26, 30, 42, 0.9)',
            borderColor: 'rgba(255,255,255,0.1)',
            textStyle: { color: '#e8ecf3', fontSize: 12 },
          },
        },
        label: {
          show: true,
          formatter: '{b}',
          fontSize: 12,
          color: 'rgba(255,255,255,0.9)',
          fontFamily: 'Inter, sans-serif',
        },
        upperLabel: {
          show: true,
          height: 28,
          fontSize: 13,
          fontWeight: 600,
          color: '#e8ecf3',
          backgroundColor: 'rgba(0,0,0,0.35)',
        },
        levels: [
          { itemStyle: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.08)', gapWidth: 3 } },
          { itemStyle: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.05)', gapWidth: 2 } },
          { itemStyle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)', gapWidth: 1 } },
          { itemStyle: { borderWidth: 0, gapWidth: 1 } },
        ],
      },
    ],
  }), [tree]);

  const handleEvents = {
    click: (params: unknown) => {
      if (onNodeClick) {
        const d = (params as { data: Record<string, unknown> }).data;
        onNodeClick(d as unknown as TreeNode);
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
