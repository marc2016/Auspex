import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { mdiFitToScreenOutline, mdiTarget, mdiClose, mdiPin, mdiPinOffOutline, mdiCrosshairsGps, mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import type { CallDiagramData } from '../../../src/analyzer/calls/diagramData';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import { createLayoutRunner, type LayoutRunner } from '../utils/callDiagram/client';
import type { DiagramResponse, DiagramStage } from '../utils/callDiagram/protocol';
import type { DiagramLayout, LaidOutNode, RoutedEdge } from '../utils/callDiagram/layout';
import type { DiagramLevel } from '../utils/callDiagram/model';
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
  panIntoView,
  isCursorOutside,
  loadState,
  fitTransform,
  isLeafBox,
  edgeCount,
  findCycles,
  boundsOf,
  boxOf,
  boundaryByBox,
  type DiagramColorMode,
  type DiagramFocus,
  type FocusDepthOption,
} from '../utils/callDiagram/view';
import { createElk } from '../utils/callDiagram/elkFactory';
import { LoadingOverlay, CanvasMessage } from './LoadingOverlay';

/** Delay before the indicator covers a previous diagram (fast re-layouts do not flash). */
const RELAYOUT_INDICATOR_DELAY_MS = 300;
/** Largest zoom when fitting a cycle (a cycle of two small boxes would otherwise fill the canvas). */
const CYCLE_FIT_MAX_ZOOM = 1.5;

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

/** Label size of class and file boxes: always at least about 9px on screen (labels are always shown). */
const boxLabelSize = (k: number) => (k >= 9 / 13 ? 13 : Math.min(9 / Math.max(k, 0.01), 60));

/**
 * Edge count label size: about 10px on screen, but capped in diagram units like box labels, so that
 * far out the counts shrink with the diagram instead of covering the boxes.
 */
const edgeLabelSize = (k: number) => Math.min(10 / Math.max(k, 0.01), 40);

/** Midpoint of a routed edge (middle bend point or the middle of a straight segment). */
function edgeMidpoint(points: [number, number][]): [number, number] {
  if (points.length % 2 === 1) return points[(points.length - 1) / 2];
  const a = points[points.length / 2 - 1];
  const b = points[points.length / 2];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

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
  /** A fit was asked for (start, focus or folder change); the next result with a layout takes it. */
  const fitPendingRef = useRef(true);
  /** Layout that still has to be fitted (waits while the canvas has no size). */
  const fitTargetRef = useRef<DiagramLayout | null>(null);
  /** Request the runner is working on or has answered; a newer one counts as loading already. */
  const sentReqRef = useRef<unknown>(undefined);
  const loadStartRef = useRef<number | null>(null);

  const [data, setData] = useState<CallDiagramData | null>(null);
  const [layout, setLayout] = useState<DiagramLayout | null>(null);
  const [stage, setStage] = useState<DiagramStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Functions in the running layout (from the layout progress message). */
  const [functionCount, setFunctionCount] = useState<number | null>(null);
  /** The last result had no functions to show. */
  const [settledEmpty, setSettledEmpty] = useState(false);
  const [canvasSized, setCanvasSized] = useState(false);
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
  /** Function at the text cursor (live mode); fnId null = none or not analyzed. */
  const [cursor, setCursor] = useState<{ fnId: string | null; label: string | null } | null>(null);
  const [pinned, setPinned] = useState(false);
  const [level, setLevel] = useState<DiagramLevel>('functions');
  /** Cycle the user stepped to (class and file levels); null = none. */
  const [cycleIndex, setCycleIndex] = useState<number | null>(null);
  const collapsed = level !== 'functions';

  // Layout runner (ELK in its own worker, main-thread fallback)
  useEffect(() => {
    const runner = createLayoutRunner(
      (msg: DiagramResponse) => {
        if (msg.requestId !== requestRef.current) return; // stale
        if (msg.type === 'progress') {
          setStage(msg.stage);
          setFunctionCount(msg.functionCount ?? null);
        } else if (msg.type === 'error') {
          setStage(null);
          setError(msg.message);
        } else {
          // Only a result with a layout takes a pending fit (an empty one leaves it pending). A fit
          // that could not run yet (canvas without size) moves on to the newer layout.
          if (msg.layout && (fitPendingRef.current || fitTargetRef.current)) {
            fitPendingRef.current = false;
            fitTargetRef.current = msg.layout;
          }
          setStage(null);
          setError(null);
          setSettledEmpty(msg.layout === null);
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
        const { fnId, keepDepths } = msg.payload;
        const label = msg.payload.label ?? fnId;
        setFocus((f) =>
          keepDepths && f ? { ...f, fnId, label } : { fnId, label, up: FOCUS_DEFAULT_DEPTH, down: FOCUS_DEFAULT_DEPTH }
        );
      } else if (msg?.type === 'diagram:cursor') {
        setCursor(msg.payload?.fnId || msg.payload?.label ? { fnId: msg.payload.fnId ?? null, label: msg.payload.label ?? null } : null);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // In focus mode, the traversal depends on the inferred-edge filter; in the scope view it does not
  const focusKey = focus ? `${focus.fnId}|${focus.up}|${focus.down}|${hideInferred}` : '';

  const layoutReq = useMemo(
    () => layoutRequestFor({ data, focusData, folderPath, focus, hideInferred, level }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, focusData, folderPath, focusKey, level]
  );

  // (Re-)layout on new data, folder restriction or focus; keeps filters and selection
  useEffect(() => {
    if (!runnerRef.current) return;
    if (focus && !focusData && !focusDataRequested.current) {
      focusDataRequested.current = true;
      vscode.postMessage({ type: 'requestFocusData' });
    }
    if (!layoutReq) return;
    const requestId = ++requestRef.current;
    sentReqRef.current = layoutReq;
    setStage('model');
    setFunctionCount(null);
    runnerRef.current.request({ requestId, ...layoutReq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutReq]);

  // Fit the next layout after entering or leaving focus, switching the focused function, changing
  // the folder restriction or the detail level. New data and depth changes keep the viewport.
  useEffect(() => {
    fitPendingRef.current = true;
  }, [focus?.fnId, folderPath, level]);

  const enterFocus = (fnId: string) =>
    setFocus({ fnId, label: functionLabel(focusData ?? data, fnId), up: FOCUS_DEFAULT_DEPTH, down: FOCUS_DEFAULT_DEPTH });
  const leaveFocus = () => {
    setFocus(null);
    focusDataRequested.current = false;
    setFocusData(null);
    vscode.postMessage({ type: 'focusClosed' });
  };
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    vscode.postMessage({ type: 'setPinned', pinned: next });
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

  /** Fits the layout into the canvas; false when that is not possible yet (canvas without size). */
  const fit = useCallback((): boolean => {
    const el = containerRef.current;
    if (!el || !layout || !svgRef.current || !zoomRef.current) return false;
    const ft = fitTransform(layout.width, layout.height, el.clientWidth, el.clientHeight);
    if (!ft) return false;
    d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(ft.x, ft.y).scale(ft.k));
    return true;
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

  // Whether the canvas has a size (a hidden tab may have none); changes only between zero and non-zero
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setCanvasSized(el.clientWidth > 0 && el.clientHeight > 0);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit the layout that took the pending fit; without a canvas size it waits for the resize observer
  useEffect(() => {
    if (layout && stage === null && fitTargetRef.current === layout && fit()) fitTargetRef.current = null;
  }, [layout, fit, stage, canvasSized]);

  // Function key -> key of the box showing it (itself at the function level)
  const boxes = useMemo(() => boxOf(layout), [layout]);

  // Bring the cursor function's box into view (only if it is outside the viewport; zoom unchanged)
  const cursorFnId = cursor?.fnId ?? null;
  const cursorKey = cursorFnId ? boxes.get(cursorFnId) ?? null : null;
  useEffect(() => {
    if (!cursorKey || !layout || stage !== null) return;
    const el = containerRef.current;
    const box = layout.nodes.find((n) => n.key === cursorKey);
    if (!el || !box || !svgRef.current || !zoomRef.current) return;
    const tr = transformRef.current;
    const [x0, y0] = tr.invert([0, 0]);
    const [x1, y1] = tr.invert([el.clientWidth, el.clientHeight]);
    const delta = panIntoView(box, { x0, y0, x1, y1 }, 24 / tr.k);
    if (!delta) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.translateBy, -delta.dx, -delta.dy);
  }, [cursorKey, layout, stage]);

  const cursorOutside = !!focus && pinned && isCursorOutside(layout, cursorFnId);

  const visible = useMemo(() => (layout ? applyFilters(layout, { hideInferred, hotspotsOnly }) : null), [layout, hideInferred, hotspotsOnly]);
  const nodesByKey = useMemo(() => new Map((layout?.nodes ?? []).map((n) => [n.key, n])), [layout]);
  // Class and file boxes are always shown with labels: the far band only applies to functions
  const band = collapsed ? 'near' : zoomBand(k);
  const cycles = useMemo(() => (visible && collapsed ? findCycles(visible) : null), [visible, collapsed]);
  const cycleCount = cycles?.cycles.length ?? 0;
  // A cycle index that no longer exists (filter, new data, level) is dropped
  useEffect(() => {
    if (cycleIndex !== null && cycleIndex >= cycleCount) setCycleIndex(null);
  }, [cycleIndex, cycleCount]);
  const activeCycle = cycleIndex !== null && cycles && cycleIndex < cycleCount ? cycles.cycles[cycleIndex] : null;
  const highlight = useMemo(() => {
    if (activeCycle && visible) {
      const members = new Set(activeCycle);
      const edges = new Set(visible.edges.filter((e) => members.has(e.fromKey) && members.has(e.toKey)).map((e) => e.key));
      return { nodes: members, edges };
    }
    return selected && visible ? neighborsOf(selected, visible.edges) : null;
  }, [activeCycle, selected, visible]);
  const boundary = useMemo(
    () => (collapsed ? boundaryByBox(layout?.boundary, boxes) : layout?.boundary),
    [collapsed, layout, boxes]
  );
  const focusKeyBox = focus ? boxes.get(focus.fnId) ?? focus.fnId : null;

  const shownNodes = useMemo(() => {
    if (!visible) return [];
    // frames smaller than a few pixels on screen are skipped; functions only outside the far band
    const base = visible.nodes.filter((n) =>
      isLeafBox(n) ? collapsed || band !== 'far' : (n.x1 - n.x0) * k >= 12 && (n.y1 - n.y0) * k >= 8
    );
    return viewport ? cullToViewport(base, viewport) : base;
  }, [visible, band, viewport, collapsed]);

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

  const onBoxClick = (n: LaidOutNode) => {
    setSelected((sel) => (sel === n.key ? null : n.key));
    setCycleIndex(null);
    if (!n.data.file) return;
    if (n.kind === 'function') {
      if (n.data.startLine) vscode.postMessage({ type: 'functionSelected', filePath: n.data.file, startLine: n.data.startLine });
    } else if (n.kind === 'class' && n.data.startLine) {
      vscode.postMessage({ type: 'nodeSelected', filePath: n.data.file, startLine: n.data.startLine });
    } else {
      vscode.postMessage({ type: 'nodeSelected', filePath: n.data.file });
    }
  };
  const onBoxDoubleClick = (n: LaidOutNode) => {
    if (!n.data.file) return;
    if ((n.kind === 'function' || n.kind === 'class') && n.data.startLine) {
      vscode.postMessage({ type: 'openFile', filePath: n.data.file, startLine: n.data.startLine, endLine: n.data.endLine ?? n.data.startLine });
    } else if (n.kind !== 'function') {
      vscode.postMessage({ type: 'openFile', filePath: n.data.file });
    }
  };

  /** Steps to the previous or next cycle, fits the view to its boxes and highlights them. */
  const stepCycle = (dir: 1 | -1) => {
    if (!cycles || cycleCount === 0 || !layout) return;
    const next = cycleIndex === null ? (dir === 1 ? 0 : cycleCount - 1) : (cycleIndex + dir + cycleCount) % cycleCount;
    setCycleIndex(next);
    setSelected(null);
    const b = boundsOf(layout.nodes, cycles.cycles[next]);
    const el = containerRef.current;
    if (!b || !el || !svgRef.current || !zoomRef.current) return;
    const pad = 40;
    const ft = fitTransform(b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad, el.clientWidth, el.clientHeight);
    if (!ft) return;
    const kk = Math.min(ft.k, CYCLE_FIT_MAX_ZOOM);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(el.clientWidth / 2 - cx * kk, el.clientHeight / 2 - cy * kk).scale(kk));
  };

  const dimmed = (key: string) => !!highlight && !highlight.nodes.has(key);
  const edgeDimmed = (key: string) => !!highlight && !highlight.edges.has(key);

  // What the canvas shows. A request that is not handed to the runner yet already counts as loading.
  const load = loadState({
    hasData: !!(focus ? focusData : data),
    focusPending: !!focus && !focusData,
    stage: stage ?? (layoutReq && layoutReq !== sentReqRef.current ? 'model' : null),
    error,
    hasLayout: !!layout,
    settledEmpty,
    functionCount,
  });
  // The elapsed time starts with the load and spans all of its steps
  if (load.kind !== 'loading') loadStartRef.current = null;
  else if (loadStartRef.current === null) loadStartRef.current = Date.now();
  const stepText = load.kind !== 'loading' ? '' : load.step === 1 ? t.waiting : load.step === 2 ? t.stageModel : t.stageLayout;

  const status = load.kind === 'ready' && focus && layout && isLargeFocus(layout.focusSize) ? t.focusLarge(layout.focusSize ?? 0) : null;

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <strong>{t.title}</strong>
        <label style={styles.check}>
          {t.level}
          <select value={level} onChange={(e) => setLevel(e.target.value as DiagramLevel)} style={styles.select} aria-label={t.level}>
            <option value="functions">{t.levelFunctions}</option>
            <option value="classes">{t.levelClasses}</option>
            <option value="files">{t.levelFiles}</option>
          </select>
        </label>
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
            <button style={{ ...styles.button, ...(pinned ? styles.pinActive : {}) }} onClick={togglePin} title={pinned ? t.unpin : t.pin}>
              <Icon path={pinned ? mdiPinOffOutline : mdiPin} size={0.7} />
            </button>
            {cursorOutside && cursor?.label && (
              <span style={styles.outside}>
                {t.cursorOutside(cursor.label)}
                <button style={styles.linkButton} onClick={() => vscode.postMessage({ type: 'focusHere' })}>
                  <Icon path={mdiCrosshairsGps} size={0.6} /> {t.focusHere}
                </button>
              </span>
            )}
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
            <button style={{ ...styles.button, ...(pinned ? styles.pinActive : {}) }} onClick={togglePin} title={pinned ? t.unpin : t.pin}>
              <Icon path={pinned ? mdiPinOffOutline : mdiPin} size={0.7} />
            </button>
            {selected && nodesByKey.get(selected)?.kind === 'function' && (
              <button style={styles.button} onClick={() => enterFocus(selected)} title={t.focusHint}>
                <Icon path={mdiTarget} size={0.7} /> {t.focus}
              </button>
            )}
          </>
        )}
        {collapsed && cycles && (
          <span style={{ ...styles.check, ...(cycleCount > 0 ? styles.cycleText : {}) }} data-testid="cycle-nav">
            {cycleCount === 0 ? (
              t.noCycles
            ) : (
              <>
                <button style={styles.button} onClick={() => stepCycle(-1)} title={t.cyclePrev}>
                  <Icon path={mdiChevronLeft} size={0.7} />
                </button>
                <span>{activeCycle ? t.cycleOf((cycleIndex ?? 0) + 1, cycleCount, activeCycle.length) : t.cycles(cycleCount)}</span>
                <button style={styles.button} onClick={() => stepCycle(1)} title={t.cycleNext}>
                  <Icon path={mdiChevronRight} size={0.7} />
                </button>
              </>
            )}
          </span>
        )}
        <button style={styles.button} onClick={() => fit()} title={t.resetZoom}>
          <Icon path={mdiFitToScreenOutline} size={0.7} />
        </button>
        <span style={styles.legend}>
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" style={styles.edgeCertain} /></svg> {t.legendCertain}
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" style={{ ...styles.edgeCertain, ...styles.edgeInferred }} /></svg> {t.legendInferred}
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" style={{ ...styles.edgeCertain, ...styles.edgeDeclarative }} /></svg> {t.legendDeclarative}
          {collapsed && (
            <>
              <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" style={{ ...styles.edgeCertain, ...styles.edgeCycle }} /></svg> {t.inCycle}
            </>
          )}
        </span>
        {status && <span style={styles.status}>{status}</span>}
      </div>
      <div ref={containerRef} style={styles.canvas}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          onClick={(e) => {
            if (e.target === svgRef.current) setCycleIndex(null);
          }}
        >
          <defs>
            <marker id="cd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--vscode-foreground, #cccccc)" />
            </marker>
            <marker id="cd-arrow-cycle" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={CYCLE_COLOR} />
            </marker>
          </defs>
          <g ref={gRef} transform={transformRef.current.toString()}>
            {shownNodes
              .filter((n) => !isLeafBox(n) && n.kind !== 'root')
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
                .filter((n) => isLeafBox(n))
                .map((n) => {
                  const stub = layout?.stubs[n.key];
                  const inCycle = !!cycles?.nodes.has(n.key);
                  const label = n.kind === 'loose' ? t.looseFunctions(n.name) : n.name;
                  const labelSize = n.kind === 'function' ? functionLabelSize(k) : boxLabelSize(k);
                  const tip = n.kind === 'function' || n.kind === 'class'
                    ? `${n.data.file ?? ''}:${n.data.startLine ?? ''}`
                    : n.kind === 'loose'
                      ? `${n.data.file ?? ''} - ${t.looseFunctionsHint}`
                      : n.data.file ?? n.name;
                  return (
                    <g
                      key={n.key}
                      data-key={n.key}
                      style={{ cursor: 'pointer' }}
                      opacity={dimmed(n.key) && cursorKey !== n.key ? 0.2 : 1}
                      onClick={() => onBoxClick(n)}
                      onDoubleClick={() => onBoxDoubleClick(n)}
                    >
                      <title>{inCycle ? `${tip}\n${t.inCycle}` : tip}</title>
                      <rect
                        x={n.x0}
                        y={n.y0}
                        width={n.x1 - n.x0}
                        height={n.y1 - n.y0}
                        rx={3}
                        fill={functionColor(n, colorMode, light)}
                        style={{
                          ...styles.box,
                          ...(inCycle ? styles.boxCycle : {}),
                          ...(focusKeyBox === n.key ? styles.boxFocus : {}),
                          ...(selected === n.key ? styles.boxSelected : {}),
                        }}
                      />
                      {cursorKey === n.key && (
                        <rect
                          x={n.x0 - 4 / Math.max(k, 0.3)}
                          y={n.y0 - 4 / Math.max(k, 0.3)}
                          width={n.x1 - n.x0 + 8 / Math.max(k, 0.3)}
                          height={n.y1 - n.y0 + 8 / Math.max(k, 0.3)}
                          rx={5}
                          style={styles.boxCursor}
                        >
                          <title>{t.cursorHere}</title>
                        </rect>
                      )}
                      {boundary?.[n.key]?.hiddenCallers ? (
                        <text x={n.x1 - 2} y={n.y0 - 3} textAnchor="end" style={styles.boundary} fontSize={Math.max(10, 10 / Math.max(k, 0.01))}>
                          {`+${boundary[n.key].hiddenCallers} \u2191`}
                        </text>
                      ) : null}
                      {boundary?.[n.key]?.hiddenCallees ? (
                        <text x={n.x1 - 2} y={n.y1 + Math.max(10, 10 / Math.max(k, 0.01))} textAnchor="end" style={styles.boundary} fontSize={Math.max(10, 10 / Math.max(k, 0.01))}>
                          {`+${boundary[n.key].hiddenCallees} \u2193`}
                        </text>
                      ) : null}
                      {band === 'near' && (
                        <text x={n.x0 + 4} y={n.y0 + 4 + Math.min(labelSize, 13)} style={styles.boxLabel} fontSize={labelSize}>
                          {label}
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
              shownEdges.map((e) => {
                const count = edgeCount(e);
                const inCycle = !!cycles?.edges.has(e.key);
                const base = collapsed ? Math.min(1 + Math.log2(Math.max(count, 1)), 6) : 1.2;
                const style = {
                  ...styles.edgeCertain,
                  ...(e.confidence === 'inferred' || e.certainCount === 0 ? styles.edgeInferred : {}),
                  ...(e.source === 'declarative' ? styles.edgeDeclarative : {}),
                  ...(inCycle ? styles.edgeCycle : {}),
                  opacity: edgeDimmed(e.key) ? 0.08 : highlight || inCycle ? 0.95 : 0.45,
                  strokeWidth: (highlight && !edgeDimmed(e.key) ? base + 0.8 : base) / Math.max(k, 0.3),
                };
                if (!collapsed) return <path key={e.key} d={edgePath(e, nodesByKey)} markerEnd="url(#cd-arrow)" style={style} />;
                const [mx, my] = edgeMidpoint(e.points);
                return (
                  <g key={e.key} data-edge={e.key} opacity={edgeDimmed(e.key) ? 0.3 : 1}>
                    <path d={edgePath(e, nodesByKey)} markerEnd={inCycle ? 'url(#cd-arrow-cycle)' : 'url(#cd-arrow)'} style={style} />
                    <text x={mx + 3 / Math.max(k, 0.3)} y={my} style={{ ...styles.count, ...(inCycle ? styles.cycleText : {}) }} fontSize={edgeLabelSize(k)}>
                      {count}
                      <title>{t.callCount(count)}</title>
                    </text>
                  </g>
                );
              })}
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
        {load.kind === 'loading' && loadStartRef.current !== null && (
          <LoadingOverlay
            key={loadStartRef.current}
            step={load.step}
            stepText={stepText}
            functionCount={load.functionCount}
            startedAt={loadStartRef.current}
            delayMs={layout ? RELAYOUT_INDICATOR_DELAY_MS : 0}
            dim={!!layout}
            strings={t}
          />
        )}
        {load.kind === 'error' && <CanvasMessage>{`${t.error} ${load.message}`}</CanvasMessage>}
        {load.kind === 'empty' && <CanvasMessage>{t.empty}</CanvasMessage>}
      </div>
    </div>
  );
};

/** Color of dependency cycles (VS Code error color, fixed fallback for both themes). */
const CYCLE_COLOR = 'var(--vscode-errorForeground, #ef4444)';

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
  boxCycle: { stroke: CYCLE_COLOR, strokeWidth: 2.5 },
  edgeCycle: { stroke: CYCLE_COLOR },
  cycleText: { fill: CYCLE_COLOR, color: CYCLE_COLOR },
  boxCursor: {
    fill: 'none',
    stroke: 'var(--vscode-editorCursor-foreground, #ffcc00)',
    strokeWidth: 2.5,
    strokeDasharray: '6 3',
    vectorEffect: 'non-scaling-stroke',
    pointerEvents: 'none',
  } as React.CSSProperties,
  pinActive: { color: 'var(--vscode-focusBorder, #007fd4)' },
  outside: { display: 'inline-flex', alignItems: 'center', gap: 6, fontStyle: 'italic', color: 'var(--vscode-descriptionForeground, #9d9d9d)' },
  linkButton: { display: 'inline-flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', color: 'var(--vscode-textLink-foreground, #3794ff)', cursor: 'pointer', fontSize: 12 },
  boundary: { fill: 'var(--vscode-descriptionForeground, #9d9d9d)', fontWeight: 600, pointerEvents: 'none' },
  focusBar: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 8px', border: '1px solid var(--vscode-focusBorder, #007fd4)', borderRadius: 4 },
  boxLabel: { fill: '#111', pointerEvents: 'none' },
  stub: { fill: '#111', fontSize: 9, pointerEvents: 'none' },
  edgeCertain: { fill: 'none', stroke: 'var(--vscode-foreground, #cccccc)', strokeWidth: 1.2 },
  edgeInferred: { strokeDasharray: '5 4' },
  edgeDeclarative: { stroke: 'var(--vscode-charts-purple, #a855f7)' },
  count: { fill: 'var(--vscode-foreground, #cccccc)', fontWeight: 600, pointerEvents: 'none' },
};
