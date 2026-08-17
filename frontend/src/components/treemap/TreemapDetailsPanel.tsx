import { X, FileCode, GitCommit, Layers, TrendingUp } from 'lucide-react';
import type { TreeNode } from '@auspex/shared';

interface Props {
  node: TreeNode | null;
  onClose: () => void;
}

function ChurnBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score < 0.33 ? 'var(--color-success)' : score < 0.66 ? 'var(--color-warning)' : 'var(--color-danger)';
  const label = score < 0.33 ? 'Stable' : score < 0.66 ? 'Moderate' : 'Hotspot';

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: `${color}18`, border: `1px solid ${color}40` }}
    >
      <TrendingUp size={14} color={color} />
      <span style={{ color, fontSize: 13, fontWeight: 600 }}>
        {label} ({pct}%)
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export function TreemapDetailsPanel({ node, onClose }: Props) {
  if (!node) return null;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 280,
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
          <FileCode size={16} color="var(--color-accent)" />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {node.type}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Name */}
        <div>
          <h3 style={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 600, wordBreak: 'break-all' }}>
            {node.name}
          </h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
            {node.path}
          </p>
        </div>

        {/* Churn badge */}
        <ChurnBadge score={node.churnScore} />

        {/* Stats */}
        <div>
          <StatRow label="Lines of Code" value={node.loc.toLocaleString()} />
          <StatRow label="Commit Count" value={node.commitCount} />
          {node.startLine != null && (
            <>
              <StatRow label="Start Line" value={node.startLine} />
              <StatRow label="End Line" value={node.endLine ?? '-'} />
            </>
          )}
        </div>

        {/* Methods list (if file node with children) */}
        {node.children && node.type === 'file' && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Layers size={14} color="var(--color-text-muted)" />
              <span style={{ color: 'var(--color-text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Methods ({node.children.length})
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {node.children.map((method) => (
                <div
                  key={method.path}
                  className="rounded-md px-3 py-2"
                  style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500 }}>
                      {method.name}
                    </span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                      {method.loc} LOC
                    </span>
                  </div>
                  {method.startLine != null && (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 2 }}>
                      L{method.startLine}–{method.endLine}
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
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)' }}
          >
            <GitCommit size={14} color="var(--color-text-muted)" />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
              Changed in <strong style={{ color: 'var(--color-text-primary)' }}>{node.commitCount}</strong> commit{node.commitCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
