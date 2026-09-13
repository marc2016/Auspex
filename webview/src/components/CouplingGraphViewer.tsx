import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import type { TreeNode, AnalysisSnapshot, CouplingGraphNode, CouplingGraphLink } from '../../../src/analyzer/types';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import { mdiPlus, mdiMinus, mdiRefresh, mdiLinkVariant, mdiCrosshairsGps } from '@mdi/js';
import { getCodeHealthColor } from './SystemMapViewer';
import './CouplingGraphViewer.css';

interface Props {
  tree: TreeNode;
  snapshot: AnalysisSnapshot | null;
  selectedNode: TreeNode | null;
  onNodeClick?: (node: TreeNode | string) => void;
  minCouplingThreshold?: number;
  language: Language;
}

interface SimNode extends d3.SimulationNodeDatum, CouplingGraphNode {
  radius: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode | string;
  target: SimNode | string;
  coChanges: number;
  degree: number;
}

function getCouplingClass(degree: number): 'critical' | 'moderate' | 'slight' {
  if (degree >= 0.7) return 'critical';
  if (degree >= 0.4) return 'moderate';
  return 'slight';
}

export const CouplingGraphViewer: React.FC<Props> = ({
  tree,
  snapshot,
  selectedNode,
  onNodeClick,
  minCouplingThreshold = 0.2,
  language,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);

  const t = WEBVIEW_STRINGS[language];
  const cStrings = t.coupling;

  // Selected file path
  const selectedPath = useMemo(() => {
    return selectedNode?.path ? selectedNode.path.split('#')[0].replace(/^\//, '') : null;
  }, [selectedNode]);

  // Extract all file nodes from tree for metadata lookup
  const fileNodesMap = useMemo(() => {
    const map = new Map<string, TreeNode>();
    function traverse(n: TreeNode) {
      if (n.type === 'file') {
        const cleanPath = n.path.replace(/^\//, '');
        map.set(cleanPath, n);
      }
      n.children?.forEach(traverse);
    }
    traverse(tree);
    return map;
  }, [tree]);

  // Filtered graph data based on minCouplingThreshold
  const { filteredNodes, filteredLinks } = useMemo(() => {
    const projectPairs = snapshot?.projectCouplings || [];
    const validPairs = projectPairs.filter(
      (p) => Math.max(p.degreeA, p.degreeB) >= minCouplingThreshold
    );

    const nodeIds = new Set<string>();
    const links: CouplingGraphLink[] = [];

    for (const p of validPairs) {
      nodeIds.add(p.fileA);
      nodeIds.add(p.fileB);
      links.push({
        source: p.fileA,
        target: p.fileB,
        coChanges: p.coChanges,
        degree: Math.max(p.degreeA, p.degreeB),
      });
    }

    const nodes: CouplingGraphNode[] = Array.from(nodeIds).map((id) => {
      const treeFile = fileNodesMap.get(id);
      return {
        id,
        name: id.split('/').pop() || id,
        loc: treeFile?.loc ?? 50,
        commitCount: treeFile?.commitCount ?? 1,
        codeHealth: treeFile?.codeHealth ?? 10.0,
      };
    });

    return { filteredNodes: nodes, filteredLinks: links };
  }, [snapshot, minCouplingThreshold, fileNodesMap]);

  const zoomToFit = useCallback((transition = true) => {
    if (!svgRef.current || !containerRef.current || !zoomBehaviorRef.current || nodesRef.current.length === 0) return;
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x - n.radius - 28);
      maxX = Math.max(maxX, n.x + n.radius + 28);
      minY = Math.min(minY, n.y - n.radius - 28);
      maxY = Math.max(maxY, n.y + n.radius + 28);
    }

    if (!isFinite(minX) || !isFinite(maxX) || minX >= maxX || minY >= maxY) return;

    const dx = maxX - minX;
    const dy = maxY - minY;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const padding = 50;
    const availableWidth = Math.max(width - padding * 2, 200);
    const availableHeight = Math.max(height - padding * 2, 200);
    const scale = Math.max(0.2, Math.min(1.5, 0.88 / Math.max(dx / availableWidth, dy / availableHeight)));
    const translateX = width / 2 - scale * midX;
    const translateY = height / 2 - scale * midY;

    const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);

    if (transition) {
      d3.select(svgRef.current)
        .transition()
        .duration(450)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, transform);
    } else {
      d3.select(svgRef.current).call(zoomBehaviorRef.current.transform, transform);
    }
  }, []);

  // D3 Force Simulation & Render Effect
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || filteredNodes.length === 0) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Defs for drop-shadow
    const defs = svg.append('defs');
    const filter = defs
      .append('filter')
      .attr('id', 'coupling-node-glow')
      .attr('x', '-30%')
      .attr('y', '-30%')
      .attr('width', '160%')
      .attr('height', '160%');
    filter
      .append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 2)
      .attr('stdDeviation', 3)
      .attr('flood-opacity', 0.4);

    // Main Zoom Container
    const g = svg.append('g').attr('class', 'coupling-graph-root');

    // Zoom setup
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Clone data for simulation with circular initial placement around center
    const nodes: SimNode[] = filteredNodes.map((n, i) => {
      const radius = Math.max(12, Math.min(28, Math.sqrt(n.loc || 50) * 1.5));
      const angle = (i / Math.max(filteredNodes.length, 1)) * 2 * Math.PI;
      const r = Math.min(width, height) * 0.22;
      return {
        ...n,
        radius,
        x: width / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 15,
        y: height / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 15,
      };
    });
    nodesRef.current = nodes;

    const links: SimLink[] = filteredLinks.map((l) => ({
      ...l,
      source: l.source,
      target: l.target,
    }));

    // Setup Force Simulation with tight, cohesive physics
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            // Stronger coupling pulls nodes closer together (32px to 80px)
            const degree = d.degree || 0.2;
            return Math.max(32, 80 - degree * 50);
          })
          .strength((d) => {
            const degree = d.degree || 0.2;
            return Math.min(1.0, 0.4 + degree * 0.6);
          })
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(-110).distanceMax(350))
      .force('x', d3.forceX(width / 2).strength(0.08))
      .force('y', d3.forceY(height / 2).strength(0.08))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collide',
        d3.forceCollide<SimNode>().radius((d) => d.radius + 8).iterations(2)
      )
      .velocityDecay(0.35);

    // Warm up simulation so layout settles compactly before first paint
    for (let i = 0; i < 90; ++i) {
      simulation.tick();
    }

    // Render Links
    const linkElements = g
      .append('g')
      .attr('class', 'coupling-links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', (d) => `coupling-link ${getCouplingClass(d.degree)}`)
      .attr('stroke-width', (d) => Math.max(1.8, Math.min(7, Math.sqrt(d.coChanges) * 1.5)))
      .on('mouseenter', function (_event, d) {
        const srcId = typeof d.source === 'string' ? d.source : (d.source as any).id;
        const tgtId = typeof d.target === 'string' ? d.target : (d.target as any).id;
        setHoveredLinkId(`${srcId}->${tgtId}`);
      })
      .on('mouseleave', function () {
        setHoveredLinkId(null);
      });

    linkElements.append('title').text((d: any) => {
      const srcName = d.source.name || (typeof d.source === 'string' ? d.source : d.source.id);
      const tgtName = d.target.name || (typeof d.target === 'string' ? d.target : d.target.id);
      return `${srcName} ↔ ${tgtName}\n${Math.round(d.degree * 100)}% Kopplung · ${d.coChanges} gemeinsame Commits`;
    });

    // Drag behavior for nodes
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    // Render Nodes Group
    const nodeElements = g
      .append('g')
      .attr('class', 'coupling-nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', (d) => {
        const isSel = selectedPath === d.id;
        return `coupling-node ${isSel ? 'selected' : ''}`;
      })
      .call(drag as any)
      .on('click', (_event, d) => {
        const treeNode = fileNodesMap.get(d.id);
        if (treeNode && onNodeClick) {
          onNodeClick(treeNode);
        } else if (onNodeClick) {
          onNodeClick(d.id);
        }
      })
      .on('mouseenter', (_event, d) => {
        setHoveredNodeId(d.id);
      })
      .on('mouseleave', () => {
        setHoveredNodeId(null);
      });

    // Node Circles
    nodeElements
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => getCodeHealthColor(d.codeHealth));

    // Node Text Labels
    nodeElements
      .append('text')
      .attr('dy', (d) => d.radius + 12)
      .text((d) => {
        const label = d.name;
        return label.length > 18 ? `${label.slice(0, 16)}…` : label;
      });

    nodeElements.append('title').text((d) => {
      return `${d.name}\n${d.id}\nLOC: ${d.loc} · Commits: ${d.commitCount}\nCode Health: ${d.codeHealth.toFixed(1)}/10`;
    });

    // Simulation Tick Updates
    simulation.on('tick', () => {
      linkElements
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      nodeElements.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Immediate auto-fit to center and scale everything cleanly
    zoomToFit(false);

    return () => {
      simulation.stop();
    };
  }, [filteredNodes, filteredLinks, selectedPath, fileNodesMap, onNodeClick, zoomToFit]);

  // Update Visual Dimming / Highlighting on Hover
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    if (!hoveredNodeId && !hoveredLinkId) {
      svg.selectAll('.coupling-node').classed('dimmed', false);
      svg.selectAll('.coupling-link').classed('dimmed', false).classed('highlighted', false);
      return;
    }

    if (hoveredLinkId) {
      const [srcId, tgtId] = hoveredLinkId.split('->');
      svg.selectAll('.coupling-node').classed('dimmed', (d: any) => d.id !== srcId && d.id !== tgtId);
      svg.selectAll('.coupling-link').each(function (d: any) {
        const s = typeof d.source === 'string' ? d.source : d.source.id;
        const t = typeof d.target === 'string' ? d.target : d.target.id;
        const isMatch = (s === srcId && t === tgtId) || (s === tgtId && t === srcId);
        d3.select(this)
          .classed('dimmed', !isMatch)
          .classed('highlighted', isMatch);
      });
      return;
    }

    // Find connected partners of hovered node
    const connectedIds = new Set<string>([hoveredNodeId!]);
    filteredLinks.forEach((l) => {
      const src = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id;
      if (src === hoveredNodeId) connectedIds.add(tgt);
      if (tgt === hoveredNodeId) connectedIds.add(src);
    });

    svg.selectAll('.coupling-node').classed('dimmed', (d: any) => !connectedIds.has(d.id));

    svg.selectAll('.coupling-link').each(function (d: any) {
      const src = typeof d.source === 'string' ? d.source : d.source.id;
      const tgt = typeof d.target === 'string' ? d.target : d.target.id;
      const isConnected = src === hoveredNodeId || tgt === hoveredNodeId;
      d3.select(this)
        .classed('dimmed', !isConnected)
        .classed('highlighted', isConnected);
    });
  }, [hoveredNodeId, hoveredLinkId, filteredLinks]);

  const handleZoomIn = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.3);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.77);
    }
  };

  const handleResetZoom = () => {
    zoomToFit(true);
  };

  const handleFitView = () => {
    zoomToFit(true);
  };

  return (
    <div className="coupling-graph-viewer" ref={containerRef}>
      {filteredNodes.length > 0 ? (
        <>
          {/* Info HUD */}
          <div className="coupling-graph-hud">
            <div className="coupling-hud-item">
              <span>{cStrings.nodesCount}:</span>
              <span className="coupling-hud-value">{filteredNodes.length}</span>
            </div>
            <div className="coupling-hud-item">
              <span>{cStrings.linksCount}:</span>
              <span className="coupling-hud-value">{filteredLinks.length}</span>
            </div>
          </div>

          <svg ref={svgRef} className="coupling-graph-svg" />

          {/* Floating Zoom Controls */}
          <div className="coupling-zoom-controls">
            <button className="coupling-zoom-btn" onClick={handleZoomIn} title="Zoom in">
              <Icon path={mdiPlus} size={0.75} />
            </button>
            <button className="coupling-zoom-btn" onClick={handleZoomOut} title="Zoom out">
              <Icon path={mdiMinus} size={0.75} />
            </button>
            <button className="coupling-zoom-btn" onClick={handleFitView} title={cStrings.fitView}>
              <Icon path={mdiCrosshairsGps} size={0.75} />
            </button>
            <button className="coupling-zoom-btn" onClick={handleResetZoom} title="Reset view">
              <Icon path={mdiRefresh} size={0.75} />
            </button>
          </div>
        </>
      ) : (
        <div className="coupling-graph-empty">
          <Icon path={mdiLinkVariant} size={2.5} />
          <h3>{cStrings.noProjectCouplings}</h3>
          <p>{cStrings.projectSubtitle}</p>
        </div>
      )}
    </div>
  );
};
