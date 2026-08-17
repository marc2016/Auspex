import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRepoStore } from '../store/useRepoStore';
import { TreemapViewer } from '../components/treemap/TreemapViewer';
import { TreemapDetailsPanel } from '../components/treemap/TreemapDetailsPanel';
import type { TreeNode } from '@auspex/shared';
import { ZoomIn, Loader2, BarChart3 } from 'lucide-react';
import { wsClient } from '../services/websocket';
import type { WsScanProgressPayload, WsScanCompletePayload } from '@auspex/shared';

export function TreemapPage() {
  const { id } = useParams<{ id: string }>();
  const { snapshots, fetchSnapshot, repositories, setActiveRepoId, scanProgress, setScanProgress, setScanActive } =
    useRepoStore();
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [treemapKey, setTreemapKey] = useState(0);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div>
          <h1 style={{ color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600 }}>
            {repo?.name ?? 'Treemap'}
          </h1>
          {snapshot && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
              {snapshot.totalFiles} files · {snapshot.totalLoc.toLocaleString()} LOC ·{' '}
              Commit {snapshot.headCommitSha.slice(0, 7)} ·{' '}
              {snapshot.isIncremental ? '⚡ Incremental' : '🔄 Full scan'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTreemapKey((k) => k + 1)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 cursor-pointer text-sm"
            style={{
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <ZoomIn size={14} />
            Reset View
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
          <span style={{ color: 'var(--color-accent)', fontSize: 13 }}>
            {progress.message}
          </span>
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
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Treemap area */}
        <div style={{ flex: 1, padding: 12, overflow: 'hidden' }}>
          {!snapshot && !progress && (
            <div
              className="flex flex-col items-center justify-center h-full"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
              <p style={{ fontSize: 15, fontWeight: 500 }}>No scan data available.</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>
                Go to Repositories and run a scan for this repository.
              </p>
            </div>
          )}
          {snapshot && (
            <TreemapViewer
              key={treemapKey}
              tree={snapshot.tree}
              onNodeClick={setSelectedNode}
            />
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
