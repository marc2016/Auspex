import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { mdiFitToScreenOutline, mdiTarget, mdiClose } from '@mdi/js';
import type { CallDiagramData } from '../../../src/analyzer/calls/diagramData';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import { createLayoutRunner, type LayoutRunner } from '../utils/callDiagram/client';
import type { DiagramResponse, DiagramStage } from '../utils/callDiagram/protocol';
import type { DiagramLayout, LaidOutNode, RoutedEdge } from '../utils/callDiagram/layout';
import { FRAME_LABEL_HEIGHT } from '../utils/callDiagram/constants';
import {
  aggregateEdges,
  aggregationDepth,
  applyFilters,
  cullEdges,
  cullToViewport,
  folderOptions,
  functionColor,
  neighborsOf,
  restoreSelection,
  zoomBand,
  ZOOM_FAR,
  FOCUS_DEFAULT_DEPTH,
  FOCUS_DEPTH_OPTIONS,
  functionLabel,
  isLargeFocus,
  layoutRequestFor,
  type DiagramColorMode,
  type DiagramFocus,
  type FocusDepthOption,
} from '../utils/callDiagram/view';
import { createElk } from '../utils/callDiagram/elkFactory';

interface VsCodeLike {
  postMessage(message: unknown): void;
}

interface Props {
  language: Language;
  vscode: VsCodeLike;
}

const isLightTheme = () =>
  typeof document !== 'undefined' &&
  (document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light'));

const edgeLine = d3.line<[number, number]>().curve(d3.curveBasis);

/** Path of an edge: smooth curve through the routed points, or a small loop for recursion. */
function edgePath(e: RoutedEdge, nodesByKey: Map<string, LaidOutNode>): string {
  if (e.self) {
    const n = nodesByKey.get(e.fromKey);
    if (!n) return '';
    const x = n.x1;
    const y = (n.y0 + n.y1) / 2;
    return `M${x},${y - 6} C${x + 22},${y - 22} ${x + 22},${y + 22} ${x},${y + 6}`;
  }
  return edgeLine(e.points) ?? '';
}

/**
 * Frame label: in the frame header when zoomed in; zoomed out, a screen-constant label centered in
 * frames that are large enough on screen.
 */
function frameLabel(n: LaidOutNode, k: number): React.ReactNode {
  const screenW = (n.x1 - n.x0) * k;
  if (k >= ZOOM_FAR) {
    // in the frame header: about 11px on screen, never taller than the header
    if (screenW < 40) return null;
    const fontSize = Math.min(FRAME_LABEL_HEIGHT * 0.7, 11 / k);
    return (
      <text x={n.x0 + 6} y={n.y0 + Math.min(FRAME_LABEL_HEIGHT - 6, fontSize + 3)} style={styles.frameLabel} fontSize={fontSize}>
        {n.name}
      </text>
    );
  }
  const screenH = (n.y1 - n.y0) * k;
  if (screenW < 70 || screenH < 24) return null;
  return (
    <text x={(n.x0 + n.x1) / 2} y={n.y0 + Math.min(14 / k, (n.y1 - n.y0) / 2)} textAnchor="middle" style={styles.frameLabel} fontSize={12 / k}>
      {n.name}
    </text>
  );
}

/**
 * Function label size in diagram units: 13 units (scales with zoom) when zoomed in; when zoomed out
 * kept at about 9px on screen, but never taller than the node allows.
 */
const functionLabelSize = (k: number) => (k >= 9 / 13 ? 13 : Math.min(9 / Math.max(k, 0.01), 16));

/** Editor tab "Call Diagram": functions in nested frames, calls flowing top to bottom. */
export const CallDiagramViewer: React.FC<Props> = ({ language, vscode }) => {
  const t = WEBVIEW_STRINGS[language].callDiagram;
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const runnerRef = useRef<LayoutRunner | null>(null);
  const requestRef = useRef(0);
  const fittedRef = useRef(false);

  const [data, setData] = useState<CallDiagramData | null>(null);
  const [layout, setLayout] = useState<DiagramLayout | null>(null);
  const [stage, setStage] = useState<DiagramStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<DiagramColorMode>('churn');
  const [hideInferred, setHideInferred] = useState(false);
  const [hotspotsOnly, setHotspotsOnly] = useState(false);
  const [folderPath, setFolderPath] = useState<string>('');
  const [k, setK] = useState(1);
  const [viewport, setViewport] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [allFolders, setAllFolders] = useState<{ path: string; name: string }[]>([]);
  const [focus, setFocus] = useState<DiagramFocus | null>(null);
  const [focusData, setFocusData] = useState<CallDiagramData | null>(null);
  const focusDataRequested = useRef(false);

  // Layout runner (ELK in its own worker, main-thread fallback)
  useEffect(() => {
    const runner = createLayoutRunner(
      (msg: DiagramResponse) => {
        if (msg.requestId !== requestRef.current) return; // stale
        if (msg.type === 'progress') setStage(msg.stage);
        else if (msg.type === 'error') {
          setStage(null);
          setError(msg.message);
        } else {
          setStage(null);
          setError(null);
          setLayout(msg.layout);
          setSelected((sel) => restoreSelection(sel, msg.layout));
        }
      },
      createElk
    );
    runnerRef.current = runner;
    return () => runner.dispose();
  }, []);

  // Messages from the extension
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'diagram:data') setData(msg.payload as CallDiagramData);
      else if (msg?.type === 'diagram:focusData') setFocusData(msg.payload as CallDiagramData);
      else if (msg?.type === 'diagram:focus' && msg.payload?.fnId) {
        setFocus({ fnId: msg.payload.fnId, label: msg.payload.label ?? msg.payload.fnId, up: FOCUS_DEFAULT_DEPTH, down: FOCUS_DEFAULT_DEPTH });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // In focus mode, the traversal depends on the inferred-edge filter; in the scope view it does not
  const focusKey = focus ? `${focus.fnId}|${focus.up}|${focus.down}|${hideInferred}` : '';

  // (Re-)layout on new data, folder restriction or focus; keeps zoom, filters and selection
  useEffect(() => {
    if (!runnerRef.current) return;
    if (focus && !focusData && !focusDataRequested.current) {
      focusDataRequested.current = true;
      vscode.postMessage({ type: 'requestFocusData' });
    }
    const req = layoutRequestFor({ data, focusData, folderPath, focus, hideInferred });
    if (!req) return;
    const requestId = ++requestRef.current;
    setStage('model');
    runnerRef.current.request({ requestId, ...req });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, focusData, folderPath, focusKey]);

  // Re-fit when entering or leaving focus or switching the focused function
  useEffect(() => {
    fittedRef.current = false;
  }, [focus?.fnId]);

  const enterFocus = (fnId: string) =>
    setFocus({ fnId, label: functionLabel(focusData ?? data, fnId), up: FOCUS_DEFAULT_DEPTH, down: FOCUS_DEFAULT_DEPTH });
  const leaveFocus = () => {
    setFocus(null);
    focusDataRequested.current = false;
    setFocusData(null);
    vscode.postMessage({ type: 'focusClosed' });
  };
  const setDepth = (which: 'up' | 'down', value: string) =>
    setFocus((f) => (f ? { ...f, [which]: value === 'all' ? 'all' : Number(value) } : f));

  // Folder list from the unrestricted layout
  useEffect(() => {
    if (layout && !folderPath && !focus) setAllFolders(folderOptions(layout));
  }, [layout, folderPath, focus]);

  const updateViewport = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const tr = transformRef.current;
    const [x0, y0] = tr.invert([0, 0]);
    const [x1, y1] = tr.invert([el.clientWidth, el.clientHeight]);
    setViewport({ x0, y0, x1, y1 });
    setK(tr.k);
  }, []);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || !layout || !svgRef.current || !zoomRef.current) return;
    const scale = Math.min(el.clientWidth / layout.width, el.clientHeight / layout.height) * 0.95;
    const tr = d3.zoomIdentity
      .translate((el.clientWidth - layout.width * scale) / 2, (el.clientHeight - layout.height * scale) / 2)
      .scale(scale);
    d3.select(svgRef.current).call(zoomRef.current.transform, tr);
  }, [layout]);

  // Pan/zoom: transform applied directly; band/culling state updated on band change and zoom end
  useEffect(() => {
    if (!svgRef.current) return;
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.02, 8])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        gRef.current?.setAttribute('transform', event.transform.toString());
        setK((prev) => (zoomBand(prev) !== zoomBand(event.transform.k) ? event.transform.k : prev));
      })
      .on('end', () => updateViewport());
    zoomRef.current = zoom;
    d3.select(svgRef.current).call(zoom).on('dblclick.zoom', null);
  }, [updateViewport]);

  // Fit when the first layout (or the first layout after a focus change) arrives
  useEffect(() => {
    if (layout && !fittedRef.current && stage === null) {
      fittedRef.current = true;
      fit();
    }
  }, [layout, fit, stage]);

  const visible = useMemo(() => (layout ? applyFilters(layout, { hideInferred, hotspotsOnly }) : null), [layout, hideInferred, hotspotsOnly]);
  const nodesByKey = useMemo(() => new Map((layout?.nodes ?? []).map((n) => [n.key, n])), [layout]);
  const band = zoomBand(k);
  const highlight = useMemo(() => (selected && visible ? neighborsOf(selected, visible.edges) : null), [selected, visible]);

  const shownNodes = useMemo(() => {
    if (!visible) return [];
    // frames smaller than a few pixels on screen are skipped; functions only outside the far band
    const base = visible.nodes.filter((n) =>
      n.kind === 'function' ? band !== 'far' : (n.x1 - n.x0) * k >= 12 && (n.y1 - n.y0) * k >= 8
    );
    return viewport ? cullToViewport(base, viewport) : base;
  }, [visible, band, viewport]);

  // Only edges with at least one visible end are drawn (keeps panning smooth on large diagrams)
  const shownEdges = useMemo(() => {
    if (!visible || band === 'far') return [];
    return cullEdges(visible.edges, new Set(shownNodes.map((n) => n.key)), highlight?.edges);
  }, [visible, band, shownNodes, highlight]);

  const farEdges = useMemo(() => {
    if (!visible || band !== 'far') return [];
    return aggregateEdges(visible.edges, visible.nodes, aggregationDepth(visible.nodes, k));
  }, [visible, band, k]);

  const light = isLightTheme();

  const onFunctionClick = (n: LaidOutNode) => {
    setSelected((sel) => (sel === n.key ? null : n.key));
    if (n.data.file && n.data.startLine) {
      vscode.postMessage({ type: 'functionSelected', filePath: n.data.file, startLine: n.data.startLine });
    }
  };
  const onFunctionDoubleClick = (n: LaidOutNode) => {
    if (n.data.file && n.data.startLine) {
      vscode.postMessage({ type: 'openFile', filePath: n.data.file, startLine: n.data.startLine, endLine: n.data.endLine ?? n.data.startLine });
    }
  };

  const dimmed = (key: string) => !!highlight && !highlight.nodes.has(key);
  const edgeDimmed = (key: string) => !!highlight && !highlight.edges.has(key);

  const status = error
    ? `${t.error} ${error}`
    : stage === 'model'
      ? t.stageModel
      : stage === 'layout' || stage === 'edges'
        ? t.stageLayout
        : !data
          ? t.waiting
          : layout === null
            ? t.empty
            : focus && isLargeFocus(layout.focusSize)
              ? t.focusLarge(layout.focusSize ?? 0)
              : null;

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <strong>{t.title}</strong>
        <select value={colorMode} onChange={(e) => setColorMode(e.target.value as DiagramColorMode)} style={styles.select}>
          <option value="churn">{t.colorChurn}</option>
          <option value="health">{t.colorHealth}</option>
        </select>
        <label style={styles.check}>
          <input type="checkbox" checked={hideInferred} onChange={(e) => setHideInferred(e.target.checked)} /> {t.hideInferred}
        </label>
        <label style={styles.check}>
          <input type="checkbox" checked={hotspotsOnly} onChange={(e) => setHotspotsOnly(e.target.checked)} /> {t.hotspotsOnly}
        </label>
        {focus ? (
          <span style={styles.focusBar}>
            <Icon path={mdiTarget} size={0.65} />
            <strong>{focus.label}</strong>
            <label style={styles.check}>
              {t.focusCallers}
              <select value={String(focus.up)} onChange={(e) => setDepth('up', e.target.value)} style={styles.select}>
                {FOCUS_DEPTH_OPTIONS.map((d: FocusDepthOption) => (
                  <option key={String(d)} value={String(d)}>
                    {d === 'all' ? t.focusAll : d}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.check}>
              {t.focusCallees}
              <select value={String(focus.down)} onChange={(e) => setDepth('down', e.target.value)} style={styles.select}>
                {FOCUS_DEPTH_OPTIONS.map((d: FocusDepthOption) => (
                  <option key={String(d)} value={String(d)}>
                    {d === 'all' ? t.focusAll : d}
                  </option>
                ))}
              </select>
            </label>
            <button style={styles.button} onClick={leaveFocus} title={t.focusLeave}>
              <Icon path={mdiClose} size={0.7} />
            </button>
          </span>
        ) : (
          <>
            <select value={folderPath} onChange={(e) => setFolderPath(e.target.value)} style={styles.select}>
              <option value="">{t.allFolders}</option>
              {allFolders.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.name}
                </option>
              ))}
            </select>
            {selected && nodesByKey.get(selected)?.kind === 'function' && (
              <button style={styles.button} onClick={() => enterFocus(selected)} title={t.focusHint}>
                <Icon path={mdiTarget} size={0.7} /> {t.focus}
              </button>
            )}
          </>
        )}
        <button style={styles.button} onClick={fit} title={t.resetZoom}>
          <Icon path={mdiFitToScreenOutline} size={0.7} />
        </button>
        <span style={styles.legend}>
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" style={styles.edgeCertain} /></svg> {t.legendCertain}
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" style={{ ...styles.edgeCertain, ...styles.edgeInferred }} /></svg> {t.legendInferred}
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" style={{ ...styles.edgeCertain, ...styles.edgeDeclarative }} /></svg> {t.legendDeclarative}
        </span>
        {status && <span style={styles.status}>{status}</span>}
      </div>
      <div ref={containerRef} style={styles.canvas}>
        <svg ref={svgRef} width="100%" height="100%">
          <defs>
            <marker id="cd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--vscode-foreground, #cccccc)" />
            </marker>
          </defs>
          <g ref={gRef} transform={transformRef.current.toString()}>
            {shownNodes
              .filter((n) => n.kind !== 'function' && n.kind !== 'root')
              .map((n) => {
                return (
                  <g key={n.key} opacity={dimmed(n.key) && highlight ? 0.85 : 1}>
                    <rect
                      x={n.x0}
                      y={n.y0}
                      width={n.x1 - n.x0}
                      height={n.y1 - n.y0}
                      rx={4}
                      style={{ ...styles.frame, ...(n.kind === 'class' ? styles.classFrame : n.kind === 'file' ? styles.fileFrame : {}) }}
                    />
                    {frameLabel(n, k)}
                  </g>
                );
              })}
            {band !== 'far' &&
              shownNodes
                .filter((n) => n.kind === 'function')
                .map((n) => {
                  const stub = layout?.stubs[n.key];
                  return (
                    <g
                      key={n.key}
                      style={{ cursor: 'pointer' }}
                      opacity={dimmed(n.key) ? 0.2 : 1}
                      onClick={() => onFunctionClick(n)}
                      onDoubleClick={() => onFunctionDoubleClick(n)}
                    >
                      <title>{`${n.data.file ?? ''}:${n.data.startLine ?? ''}`}</title>
                      <rect
                        x={n.x0}
                        y={n.y0}
                        width={n.x1 - n.x0}
                        height={n.y1 - n.y0}
                        rx={3}
                        fill={functionColor(n, colorMode, light)}
                        style={{
                          ...styles.box,
                          ...(focus?.fnId === n.key ? styles.boxFocus : {}),
                          ...(selected === n.key ? styles.boxSelected : {}),
                        }}
                      />
                      {layout?.boundary?.[n.key]?.hiddenCallers ? (
                        <text x={n.x1 - 2} y={n.y0 - 3} textAnchor="end" style={styles.boundary} fontSize={Math.max(10, 10 / Math.max(k, 0.01))}>
                          {`+${layout.boundary[n.key].hiddenCallers} \u2191`}
                        </text>
                      ) : null}
                      {layout?.boundary?.[n.key]?.hiddenCallees ? (
                        <text x={n.x1 - 2} y={n.y1 + Math.max(10, 10 / Math.max(k, 0.01))} textAnchor="end" style={styles.boundary} fontSize={Math.max(10, 10 / Math.max(k, 0.01))}>
                          {`+${layout.boundary[n.key].hiddenCallees} \u2193`}
                        </text>
                      ) : null}
                      {band === 'near' && (
                        <text x={n.x0 + 4} y={n.y0 + 4 + functionLabelSize(k)} style={styles.boxLabel} fontSize={functionLabelSize(k)}>
                          {n.name}
                        </text>
                      )}
                      {band === 'near' && stub ? (
                        <text x={n.x1 - 4} y={n.y1 - 4} textAnchor="end" style={styles.stub}>
                          {`→ ${t.outgoingStub(stub)}`}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
            <g style={{ pointerEvents: 'none' }}>
            {band !== 'far' &&
              shownEdges.map((e) => (
                <path
                  key={e.key}
                  d={edgePath(e, nodesByKey)}
                  markerEnd="url(#cd-arrow)"
                  style={{
                    ...styles.edgeCertain,
                    ...(e.confidence === 'inferred' ? styles.edgeInferred : {}),
                    ...(e.source === 'declarative' ? styles.edgeDeclarative : {}),
                    opacity: edgeDimmed(e.key) ? 0.08 : highlight ? 0.95 : 0.45,
                    strokeWidth: (highlight && !edgeDimmed(e.key) ? 2 : 1.2) / Math.max(k, 0.3),
                  }}
                />
              ))}
            {band === 'far' &&
              farEdges.map((e) => {
                const [[x1, y1], [x2, y2]] = e.points;
                return (
                  <g key={e.key}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#cd-arrow)" style={{ ...styles.edgeCertain, strokeWidth: Math.min(1 + Math.log2(e.count), 6) / k, opacity: 0.5 }} />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2} style={styles.count} fontSize={12 / k}>
                      {e.count}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', color: 'var(--vscode-foreground, #cccccc)', fontSize: 12 },
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '6px 10px', borderBottom: '1px solid var(--vscode-panel-border, #3c3c3c)' },
  select: { background: 'var(--vscode-dropdown-background, #3c3c3c)', color: 'var(--vscode-dropdown-foreground, #f0f0f0)', border: '1px solid var(--vscode-dropdown-border, #3c3c3c)', fontSize: 12 },
  check: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  button: { display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' },
  legend: { display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--vscode-descriptionForeground, #9d9d9d)' },
  status: { fontStyle: 'italic', color: 'var(--vscode-descriptionForeground, #9d9d9d)' },
  canvas: { flex: 1, overflow: 'hidden', position: 'relative' },
  frame: { fill: 'var(--vscode-editor-background, #1e1e1e)', fillOpacity: 0.35, stroke: 'var(--vscode-panel-border, #3c3c3c)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as React.CSSProperties,
  fileFrame: { fillOpacity: 0.55, strokeDasharray: '4 2' },
  classFrame: { stroke: 'var(--vscode-focusBorder, #007fd4)' },
  frameLabel: { fill: 'var(--vscode-descriptionForeground, #9d9d9d)', fontWeight: 600, pointerEvents: 'none' },
  box: { stroke: 'rgba(0,0,0,0.35)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as React.CSSProperties,
  boxSelected: { stroke: 'var(--vscode-focusBorder, #007fd4)', strokeWidth: 3 },
  boxFocus: { stroke: 'var(--vscode-foreground, #cccccc)', strokeWidth: 3 },
  boundary: { fill: 'var(--vscode-descriptionForeground, #9d9d9d)', fontWeight: 600, pointerEvents: 'none' },
  focusBar: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 8px', border: '1px solid var(--vscode-focusBorder, #007fd4)', borderRadius: 4 },
  boxLabel: { fill: '#111', pointerEvents: 'none' },
  stub: { fill: '#111', fontSize: 9, pointerEvents: 'none' },
  edgeCertain: { fill: 'none', stroke: 'var(--vscode-foreground, #cccccc)', strokeWidth: 1.2 },
  edgeInferred: { strokeDasharray: '5 4' },
  edgeDeclarative: { stroke: 'var(--vscode-charts-purple, #a855f7)' },
  count: { fill: 'var(--vscode-foreground, #cccccc)', fontWeight: 600, pointerEvents: 'none' },
};
