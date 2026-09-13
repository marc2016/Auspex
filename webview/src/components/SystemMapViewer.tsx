import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import type { TreeNode } from '../../../src/analyzer/types';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import { mdiInformationOutline, mdiPlus, mdiMinus, mdiRefresh } from '@mdi/js';
import {
  type ColorMetric,
  getHeatColor,
  getGrowthColor,
  getRecencyColor,
  getCouplingColor,
  getKnowledgeColor,
  renderTooltipHtml,
} from './TreemapViewer';

interface Props {
  tree: TreeNode;
  selectedNode: TreeNode | null;
  onNodeClick?: (node: TreeNode) => void;
  colorMetric?: ColorMetric;
  language: Language;
}

export function getCodeHealthColor(score: number | undefined): string {
  const s = score ?? 10.0;
  if (s < 6.0) return '#ef4444'; // 🔴 Unhealthy
  if (s < 9.0) return '#f59e0b'; // 🟡 Problematic / Warning
  return '#10b981'; // 🟢 Healthy
}

export const SystemMapViewer: React.FC<Props> = ({
  tree,
  selectedNode,
  onNodeClick,
  colorMetric = 'health',
  language,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const t = WEBVIEW_STRINGS[language];

  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null);
  const [currentFocus, setCurrentFocus] = useState<TreeNode>(tree);

  // Zoom behavior reference so zoom buttons can trigger it
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Count total files in the tree
  const totalFiles = useMemo(() => {
    let count = 0;
    function countFiles(n: TreeNode) {
      if (n.type === 'file') count++;
      n.children?.forEach(countFiles);
    }
    countFiles(tree);
    return count;
  }, [tree]);

  const maxAdded = useMemo(() => {
    let max = 1;
    function scan(n: TreeNode) {
      if ((n.linesAdded ?? 0) > max) max = n.linesAdded ?? 0;
      n.children?.forEach(scan);
    }
    scan(tree);
    return max;
  }, [tree]);

  const getNodeColor = (node: TreeNode, isLight: boolean): string => {
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
    return getCodeHealthColor(node.codeHealth);
  };

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    const isLight =
      document.body.classList.contains('vscode-light') ||
      document.body.classList.contains('vscode-high-contrast-light');

    const folderFill = isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.05)';
    const folderStroke = isLight ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.15)';
    const textColor = isLight ? '#334155' : '#cbd5e1';

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Setup D3 Circle Packing hierarchy
    const pack = (data: TreeNode) =>
      d3
        .pack<TreeNode>()
        .size([width, height])
        .padding((d) => (d.depth === 1 ? 16 : 4))(
        d3
          .hierarchy(data)
          .sum((d) => (d.children?.length ? 0 : Math.max(d.loc || 1, 1)))
          .sort((a, b) => (b.value || 0) - (a.value || 0))
      );

    const root = pack(tree);

    // Zoomable group
    const g = svg.append('g').attr('class', 'zoomable-container');

    // Background rect to catch clicks and zoom out
    g.append('rect')
      .attr('x', -width * 2)
      .attr('y', -height * 2)
      .attr('width', width * 5)
      .attr('height', height * 5)
      .attr('fill', 'transparent')
      .on('click', () => {
        resetZoom();
      });

    const updateTooltipPosition = (event: MouseEvent) => {
      if (!tooltipRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let x = event.clientX - rect.left + 14;
      let y = event.clientY - rect.top + 14;
      const tipWidth = tooltipRef.current.offsetWidth || 230;
      const tipHeight = tooltipRef.current.offsetHeight || 160;
      if (x + tipWidth > rect.width - 8) {
        x = Math.max(8, event.clientX - rect.left - tipWidth - 14);
      }
      if (y + tipHeight > rect.height - 8) {
        y = Math.max(8, event.clientY - rect.top - tipHeight - 14);
      }
      tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    // Node circles
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(root.descendants().slice(1))
      .join('circle')
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
      .attr('r', (d: any) => d.r)
      .attr('fill', (d) => {
        if (d.children) return folderFill;
        return getNodeColor(d.data, isLight);
      })
      .attr('stroke', (d) => {
        if (d.children) return folderStroke;
        return isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)';
      })
      .attr('stroke-width', (d) => (d.children ? 1.5 : 0.8))
      .attr('cursor', 'pointer')
      .style('transition', 'filter 0.15s ease')
      .on('mouseenter', function (this: SVGCircleElement, event: MouseEvent, d: any) {
        d3.select(this)
          .style('filter', 'brightness(1.18)');
        setHoveredNode(d.data);
        if (tooltipRef.current) {
          tooltipRef.current.innerHTML = renderTooltipHtml(d.data, isLight, language);
          tooltipRef.current.style.display = 'block';
          updateTooltipPosition(event);
        }
      })
      .on('mousemove', function (event: MouseEvent) {
        updateTooltipPosition(event);
      })
      .on('mouseleave', function (this: SVGCircleElement) {
        d3.select(this).style('filter', 'none');
        setHoveredNode(null);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'none';
        }
      })
      .on('click', (event: MouseEvent, d: any) => {
        event.stopPropagation();
        onNodeClick?.(d.data);
        if (d.children) {
          zoomToCluster(d);
        }
      });

    // Target ring around selected file
    const targetRing = g
      .append('circle')
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '4,3')
      .style('display', 'none')
      .style('pointer-events', 'none');

    if (selectedNode) {
      const found = root.descendants().find((d) => d.data.path === selectedNode.path);
      if (found) {
        targetRing
          .style('display', 'inline')
          .attr('cx', found.x)
          .attr('cy', found.y)
          .attr('r', found.r + 4);
      }
    }

    // Folder label texts
    const label = g
      .append('g')
      .attr('class', 'labels')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .selectAll('text')
      .data(root.descendants().filter((d) => d.children && d.depth > 0))
      .join('text')
      .attr('transform', (d: any) => `translate(${d.x},${d.y - d.r + 14})`)
      .style('fill', textColor)
      .style('font-style', 'italic')
      .style('font-size', (d) => `${Math.max(10, Math.min(14, d.r / 5))}px`)
      .style('font-weight', '500')
      .style('user-select', 'none')
      .text((d) => d.data.name);

    // Zoom behavior with mouse wheel & drag support
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 25])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        const k = event.transform.k;
        label.style('display', (d: any) => (d.r * k >= 18 ? 'inline' : 'none'));
      });

    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior);

    function zoomToCluster(d: any) {
      setCurrentFocus(d.data);
      const k = Math.min(width, height) / (d.r * 2.2);
      const tx = width / 2 - d.x * k;
      const ty = height / 2 - d.y * k;
      svg.transition()
        .duration(650)
        .call(
          zoomBehavior.transform,
          d3.zoomIdentity.translate(tx, ty).scale(k)
        );
    }

    function resetZoom() {
      setCurrentFocus(tree);
      svg.transition()
        .duration(650)
        .call(zoomBehavior.transform, d3.zoomIdentity);
    }
  }, [tree, selectedNode, colorMetric, maxAdded]);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(280)
      .call(zoomBehaviorRef.current.scaleBy, 1.35);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(280)
      .call(zoomBehaviorRef.current.scaleBy, 0.74);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    setCurrentFocus(tree);
    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  // Build breadcrumb segments
  const activePath = (hoveredNode || selectedNode || currentFocus)?.path || '/';
  const breadcrumbSegments = activePath === '/' ? ['System'] : ['System', ...activePath.split('/').filter(Boolean)];

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Legend matching active colorMetric */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 11,
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-card)',
          padding: '5px 12px',
          borderRadius: 20,
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          zIndex: 10,
          userSelect: 'none',
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
              <span>{t.codeHealth.problematic} (6-8.9)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span>{t.codeHealth.healthy} (9-10)</span>
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

      {/* Floating Zoom Controls in Top Right */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 14,
          display: 'flex',
          gap: 4,
          zIndex: 10,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          padding: 3,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <button
          onClick={handleZoomIn}
          title={t.zoom.in}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon path={mdiPlus} size={0.7} />
        </button>
        <button
          onClick={handleZoomOut}
          title={t.zoom.out}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon path={mdiMinus} size={0.7} />
        </button>
        <button
          onClick={handleResetZoom}
          title={t.zoom.reset}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon path={mdiRefresh} size={0.7} />
        </button>
      </div>

      {/* Main SVG Container with D3 Zoom */}
      <svg
        ref={svgRef}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'grab',
        }}
      />

      {/* Hover Floating Card Tooltip matching Treemap */}
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

      {/* Bottom Status & Breadcrumbs Bar matching CodeScene */}
      <div
        style={{
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-color)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {breadcrumbSegments.map((segment, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span style={{ opacity: 0.5 }}>/</span>}
              <span
                style={{
                  fontWeight: idx === 0 ? 700 : idx === breadcrumbSegments.length - 1 ? 600 : 400,
                  color: idx === 0 ? 'var(--accent-color)' : idx === breadcrumbSegments.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {segment}
              </span>
            </React.Fragment>
          ))}
        </div>

        <div style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
          {t.codeHealth.showingFiles}: {totalFiles.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
        </div>
      </div>
    </div>
  );
};
