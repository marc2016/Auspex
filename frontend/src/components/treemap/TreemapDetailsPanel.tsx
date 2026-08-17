import { Icon } from '../common/Icon';
import {
  mdiClose,
  mdiFileCodeOutline,
  mdiGit,
  mdiLayersOutline,
  mdiFire,
  mdiCheckCircleOutline,
} from '@mdi/js';
import type { TreeNode } from '@auspex/shared';

interface Props {
  node: TreeNode | null;
  onClose: () => void;
}

function ChurnBadge({ score, commitCount }: { score: number; commitCount: number }) {
  const pct = Math.round(score * 100);
  const color =
    score < 0.33 ? 'var(--color-success)' : score < 0.66 ? 'var(--color-warning)' : 'var(--color-danger)';
  const label = score < 0.33 ? 'Stabil' : score < 0.66 ? 'Moderat' : 'Hotspot';

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: `${color}18`, border: `1px solid ${color}40` }}
    >
      <Icon path={score > 0.66 ? mdiFire : mdiCheckCircleOutline} size={0.7} color={color} />
      <span style={{ color, fontSize: 13, fontWeight: 600 }}>
        {label} ({pct}% · {commitCount} Commits)
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function TreemapDetailsPanel({ node, onClose }: Props) {
  if (!node) return null;

  const typeLabels: Record<string, string> = {
    method: 'Funktion / Methode',
    class: 'Klasse / Struct',
    file: 'Datei',
    folder: 'Ordner',
    namespace: 'Namespace',
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 300,
        backgroundColor: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <Icon path={mdiFileCodeOutline} size={0.7} color="var(--color-accent)" />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {typeLabels[node.type] || node.type}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}
          title="Schließen"
        >
          <Icon path={mdiClose} size={0.7} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Name */}
        <div>
          <h3 style={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 700, wordBreak: 'break-all' }}>
            {node.name}
          </h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
            {node.filePath || node.path}
          </p>
        </div>

        {/* Churn badge */}
        <ChurnBadge score={node.churnScore} commitCount={node.commitCount} />

        {/* Stats */}
        <div className="rounded-lg p-3" style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)' }}>
          <StatRow label="Dateigröße (LOC)" value={node.loc.toLocaleString()} />
          <StatRow label="Git Commits" value={node.commitCount} />
          {node.startLine != null && (
            <>
              <StatRow label="Startzeile" value={`Zeile ${node.startLine}`} />
              <StatRow label="Endzeile" value={`Zeile ${node.endLine ?? '-'}`} />
            </>
          )}
          {node.className && (
            <StatRow label="Klasse" value={node.className} />
          )}
        </div>

        {/* Child methods (if file/class node with children) */}
        {node.children && node.children.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon path={mdiLayersOutline} size={0.65} color="var(--color-text-muted)" />
              <span style={{ color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Enthaltene Elemente ({node.children.length})
              </span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {node.children.map((child) => (
                <div
                  key={child.path}
                  className="rounded-md px-3 py-2"
                  style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500 }}>
                      {child.name}
                    </span>
                    <span style={{ color: 'var(--color-accent)', fontSize: 11, fontWeight: 600 }}>
                      {child.loc} LOC
                    </span>
                  </div>
                  {child.startLine != null && (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 2 }}>
                      L{child.startLine}–{child.endLine}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Git info */}
        {node.commitCount > 0 && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5"
            style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)' }}
          >
            <Icon path={mdiGit} size={0.7} color="var(--color-accent)" />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
              In <strong style={{ color: 'var(--color-text-primary)' }}>{node.commitCount}</strong> Commits verändert
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
