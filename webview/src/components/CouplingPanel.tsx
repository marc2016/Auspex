import React from 'react';
import type { TreeNode, AnalysisSnapshot, TemporalCoupling, ProjectCouplingPair } from '../../../src/analyzer/types';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import {
  mdiLinkVariant,
  mdiAlertOutline,
  mdiFileCodeOutline,
  mdiOpenInNew,
  mdiGit,
} from '@mdi/js';

interface Props {
  node: TreeNode | null;
  snapshot: AnalysisSnapshot | null;
  language: Language;
  onOpenFile?: (filePath: string, startLine?: number, endLine?: number) => void;
  onSelectNode?: (nodePath: string) => void;
  onClearSelection?: () => void;
  onShowInGraph?: (filePath?: string) => void;
}

function getCouplingBadgeStyle(degree: number): { bg: string; border: string; color: string } {
  if (degree >= 0.7) {
    return {
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.35)',
      color: '#ef4444',
    };
  }
  if (degree >= 0.4) {
    return {
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.35)',
      color: '#f59e0b',
    };
  }
  return {
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)',
    color: 'var(--accent-color)',
  };
}

export const CouplingPanel: React.FC<Props> = ({
  node,
  snapshot,
  language,
  onOpenFile,
  onSelectNode,
}) => {
  const t = WEBVIEW_STRINGS[language];
  const cStrings = t.coupling;

  const isFileMode = Boolean(node && node.path);
  const targetFilePath = node?.path ? (node.path.split('#')[0] || '').replace(/^\//, '') : '';
  const couplings: TemporalCoupling[] = node?.temporalCoupling || [];
  const projectCouplings: ProjectCouplingPair[] = snapshot?.projectCouplings || [];

  // Check for cross-directory architectural risk
  const hasCrossDirRisk = isFileMode && couplings.some((c) => {
    if (c.couplingDegree < 0.7) return false;
    const dirA = targetFilePath.split('/').slice(0, -1).join('/');
    const dirB = c.filePath.split('/').slice(0, -1).join('/');
    return dirA !== dirB;
  });

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 10px',
        gap: 10,
        overflowY: 'auto',
      }}
    >
      {/* 1. Single-line File Indicator (matches Details & Health panels 100%) */}
      {isFileMode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            padding: '2px 0 6px 0',
            borderBottom: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            flexShrink: 0,
          }}
          title={`${node?.name} (${targetFilePath})`}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'var(--accent-color)',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              padding: '1px 5px',
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            {node?.type || 'FILE'}
          </span>
          <span
            style={{
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {node?.name}
          </span>
          <span style={{ opacity: 0.4, flexShrink: 0 }}>—</span>
          <span
            style={{
              fontFamily: 'var(--vscode-editor-font-family, monospace)',
              fontSize: 10,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {targetFilePath}
          </span>
        </div>
      )}

      {/* 2. Section Header (matches Contributors & Biomarkers header style) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
          <Icon path={mdiLinkVariant} size={0.7} color="var(--accent-color)" />
          <span>{isFileMode ? cStrings.fileTitle : cStrings.projectTitle}</span>
        </div>
        <span
          style={{
            fontSize: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            padding: '2px 6px',
            borderRadius: 10,
            color: 'var(--text-secondary)',
          }}
        >
          {isFileMode ? couplings.length : projectCouplings.length}
        </span>
      </div>

      {!isFileMode && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: -4 }}>
          {cStrings.projectSubtitle}
        </div>
      )}

      {/* 3. Main Content List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        {/* FILE FOCUS MODE */}
        {isFileMode ? (
          <>
            {/* Architectural Alert Box if cross-module coupling */}
            {hasCrossDirRisk && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderRadius: 6,
                  padding: 8,
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: '#ef4444',
                  lineHeight: 1.4,
                }}
              >
                <Icon path={mdiAlertOutline} size={0.7} color="#ef4444" style={{ flexShrink: 0 }} />
                <span>{cStrings.hiddenArchitecturalRisk}</span>
              </div>
            )}

            {couplings.length > 0 ? (
              couplings.map((c) => {
                const badge = getCouplingBadgeStyle(c.couplingDegree);
                const percent = Math.round(c.couplingDegree * 100);

                return (
                  <div
                    key={c.filePath}
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderRadius: 6,
                      padding: 8,
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <button
                        onClick={() => onSelectNode?.(c.filePath)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          minWidth: 0,
                          textAlign: 'left',
                        }}
                        title={c.filePath}
                      >
                        <Icon path={mdiFileCodeOutline} size={0.55} color="var(--accent-color)" />
                        <span
                          style={{
                            fontFamily: 'var(--vscode-editor-font-family, monospace)',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.filePath}
                        </span>
                      </button>

                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 10,
                          backgroundColor: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.color,
                          flexShrink: 0,
                        }}
                      >
                        {percent}%
                      </span>
                    </div>

                    {/* Progress track */}
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        overflow: 'hidden',
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(percent, 100)}%`,
                          backgroundColor: badge.color,
                          borderRadius: 2,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>

                    {/* Meta info */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon path={mdiGit} size={0.5} />
                        <span>
                          {c.coChanges} {cStrings.coCommits} ({c.totalCommits} total)
                        </span>
                      </div>

                      {onOpenFile && (
                        <button
                          onClick={() => onOpenFile(c.filePath)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '2px 4px',
                            cursor: 'pointer',
                            color: 'var(--accent-color)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 10,
                            borderRadius: 3,
                          }}
                          title={cStrings.openFile}
                        >
                          <span>{cStrings.openFile}</span>
                          <Icon path={mdiOpenInNew} size={0.45} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 4,
                  }}
                >
                  <Icon path={mdiLinkVariant} size={1} color="var(--accent-color)" />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {cStrings.noCouplings}
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 240 }}>
                  {cStrings.fileSubtitle}
                </div>
              </div>
            )}
          </>
        ) : (
          /* PROJECT-WIDE VIEW */
          <>
            {projectCouplings.length > 0 ? (
              projectCouplings.map((pair, idx) => {
                const maxDegree = Math.max(pair.degreeA, pair.degreeB);
                const badge = getCouplingBadgeStyle(maxDegree);
                const percent = Math.round(maxDegree * 100);

                return (
                  <div
                    key={`${pair.fileA}-${pair.fileB}-${idx}`}
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderRadius: 6,
                      padding: 8,
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        #{idx + 1}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 10,
                          backgroundColor: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.color,
                        }}
                      >
                        {percent}%
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button
                        onClick={() => onSelectNode?.(pair.fileA)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          textAlign: 'left',
                        }}
                        title={pair.fileA}
                      >
                        <Icon path={mdiFileCodeOutline} size={0.5} color="var(--accent-color)" />
                        <span
                          style={{
                            fontFamily: 'var(--vscode-editor-font-family, monospace)',
                            fontSize: 11,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {pair.fileA}
                        </span>
                      </button>

                      <span style={{ fontSize: 9, color: 'var(--text-secondary)', paddingLeft: 14 }}>
                        ↕
                      </span>

                      <button
                        onClick={() => onSelectNode?.(pair.fileB)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          textAlign: 'left',
                        }}
                        title={pair.fileB}
                      >
                        <Icon path={mdiFileCodeOutline} size={0.5} color="var(--accent-color)" />
                        <span
                          style={{
                            fontFamily: 'var(--vscode-editor-font-family, monospace)',
                            fontSize: 11,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {pair.fileB}
                        </span>
                      </button>
                    </div>

                    {/* Progress track */}
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        overflow: 'hidden',
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(percent, 100)}%`,
                          backgroundColor: badge.color,
                          borderRadius: 2,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon path={mdiGit} size={0.5} />
                        <span>{pair.coChanges} {cStrings.coCommits}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 4,
                  }}
                >
                  <Icon path={mdiLinkVariant} size={1} color="var(--accent-color)" />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {cStrings.noProjectCouplings}
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 240 }}>
                  {cStrings.projectSubtitle}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
