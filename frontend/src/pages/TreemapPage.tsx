import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRepoStore } from '../store/useRepoStore';
import { TreemapViewer, type TreemapViewMode } from '../components/treemap/TreemapViewer';
import { TreemapDetailsPanel } from '../components/treemap/TreemapDetailsPanel';
import type { TreeNode } from '@auspex/shared';
import {
  ZoomIn,
  Loader2,
  BarChart3,
  Code2,
  FileCode,
  Box,
  Zap,
  FolderTree,
} from 'lucide-react';
import { wsClient } from '../services/websocket';
import type { WsScanProgressPayload, WsScanCompletePayload } from '@auspex/shared';

const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'java',
  'cs',
  'py',
  'go',
  'rs',
  'c',
  'cpp',
  'h',
  'hpp',
]);

function filterSourceCodeOnly(node: TreeNode): TreeNode | null {
  if (node.type === 'file') {
    const ext = node.name.split('.').pop()?.toLowerCase() ?? '';
    return CODE_EXTENSIONS.has(ext) ? { ...node } : null;
  }

  if (node.children) {
    const filteredChildren = node.children
      .map(filterSourceCodeOnly)
      .filter((c): c is TreeNode => c !== null);

    if (filteredChildren.length === 0) return null;

    const totalLoc = filteredChildren.reduce((sum, c) => sum + c.loc, 0);
    return {
      ...node,
      loc: totalLoc,
      value: totalLoc,
      children: filteredChildren,
    };
  }

  return { ...node };
}

export function TreemapPage() {
  const { id } = useParams<{ id: string }>();
  const {
    snapshots,
    fetchSnapshot,
    repositories,
    setActiveRepoId,
    scanProgress,
    setScanProgress,
    setScanActive,
  } = useRepoStore();
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [treemapKey, setTreemapKey] = useState(0);
  const [viewMode, setViewMode] = useState<TreemapViewMode>('files');
  const [sourceCodeOnly, setSourceCodeOnly] = useState(true);

  useEffect(() => {
    if (!id) return;
    setActiveRepoId(id);
    if (!snapshots[id]) fetchSnapshot(id);

    wsClient.connect();

    const offProgress = wsClient.on('scan:progress', (payload: WsScanProgressPayload) => {
      if (payload.repositoryId === id) {
        setScanProgress(id, payload);
      }
    });

    const offComplete = wsClient.on('scan:complete', (payload: WsScanCompletePayload) => {
      if (payload.repositoryId === id) {
        setScanActive(id, false);
        setScanProgress(id, null);
        fetchSnapshot(id);
      }
    });

    return () => {
      offProgress();
      offComplete();
    };
  }, [id, fetchSnapshot, snapshots, setActiveRepoId, setScanProgress, setScanActive]);

  const snapshot = id ? snapshots[id] : null;
  const repo = repositories.find((r) => r.id === id);
  const progress = id ? scanProgress[id] : null;

  const displayTree = useMemo(() => {
    if (!snapshot?.tree) return null;
    if (!sourceCodeOnly) return snapshot.tree;
    return filterSourceCodeOnly(snapshot.tree) ?? snapshot.tree;
  }, [snapshot, sourceCodeOnly]);

  const viewButtons = [
    { id: 'files' as const, label: 'Dateien', icon: FileCode },
    { id: 'classes' as const, label: 'Klassen', icon: Box },
    { id: 'functions' as const, label: 'Funktionen', icon: Zap },
    { id: 'hierarchy' as const, label: 'Ordnerbaum', icon: FolderTree },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0 flex-wrap gap-2"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div>
          <h1 style={{ color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600 }}>
            {repo?.name ?? 'Treemap'}
          </h1>
          {snapshot && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
              {snapshot.totalFiles} Dateien · {snapshot.totalLoc.toLocaleString()} LOC · Commit{' '}
              {snapshot.headCommitSha.slice(0, 7)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Granularitäts-Modi: Dateien, Klassen, Funktionen, Ordner */}
          <div
            className="flex items-center rounded-lg p-0.5"
            style={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)',
            }}
          >
            {viewButtons.map(({ id: btnId, label, icon: Icon }) => {
              const active = viewMode === btnId;
              return (
                <button
                  key={btnId}
                  onClick={() => setViewMode(btnId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs cursor-pointer transition-all"
                  style={{
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? 'white' : 'var(--color-text-secondary)',
                    fontWeight: active ? 600 : 500,
                    border: 'none',
                  }}
                  title={`Visualisierungsmodus: ${label}`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Source code only toggle */}
          <button
            onClick={() => setSourceCodeOnly((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 cursor-pointer text-xs transition-colors duration-150"
            style={{
              background: sourceCodeOnly ? 'var(--color-accent-subtle)' : 'var(--color-surface-elevated)',
              color: sourceCodeOnly ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              border: `1px solid ${sourceCodeOnly ? 'var(--color-accent)40' : 'var(--color-border)'}`,
              fontWeight: 500,
            }}
            title="Nicht-Code-Dateien (z.B. Markdown, Configs) ein-/ausblenden"
          >
            <Code2 size={13} />
            {sourceCodeOnly ? 'Nur Code' : 'Alle Dateien'}
          </button>

          <button
            onClick={() => setTreemapKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer text-xs"
            style={{
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <ZoomIn size={13} />
            Reset
          </button>
        </div>
      </div>

      {/* Scan progress bar */}
      {progress && (
        <div
          className="flex items-center gap-3 px-5 py-2"
          style={{ background: 'var(--color-accent-subtle)', borderBottom: '1px solid var(--color-accent)40' }}
        >
          <Loader2 size={14} color="var(--color-accent)" className="animate-spin" />
          <span style={{ color: 'var(--color-accent)', fontSize: 13 }}>{progress.message}</span>
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: 4, background: 'rgba(99,102,241,0.2)' }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress.percent}%`,
                background: 'var(--color-accent)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{progress.percent}%</span>
        </div>
      )}

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Treemap area */}
        <div style={{ flex: 1, padding: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!snapshot && !progress && (
            <div
              className="flex flex-col items-center justify-center h-full"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
              <p style={{ fontSize: 15, fontWeight: 500 }}>Keine Scandaten vorhanden.</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>
                Starte einen Scan in der Repositories-Übersicht.
              </p>
            </div>
          )}
          {displayTree && (
            <div style={{ flex: 1, position: 'relative' }}>
              <TreemapViewer
                key={`${treemapKey}-${sourceCodeOnly}-${viewMode}`}
                tree={displayTree}
                viewMode={viewMode}
                onNodeClick={setSelectedNode}
              />
            </div>
          )}

          {/* Color Legend at bottom */}
          {displayTree && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg mt-2 shrink-0"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                fontSize: 11,
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>
                Modus: <strong style={{ color: 'var(--color-text-primary)' }}>{viewButtons.find(b => b.id === viewMode)?.label}</strong> (Kachelgröße = LOC · Farbe = Git-Churn)
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} />
                  <span style={{ color: 'var(--color-text-secondary)' }}>Stabil (wenig Churn)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#eab308' }} />
                  <span style={{ color: 'var(--color-text-secondary)' }}>Mittel</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444' }} />
                  <span style={{ color: 'var(--color-text-secondary)' }}>Hotspot (hoher Churn)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <TreemapDetailsPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </div>
  );
}
