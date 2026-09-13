import React from 'react';
import type { TreeNode, AnalysisSnapshot, TemporalCoupling, ProjectCouplingPair } from '../../../src/analyzer/types';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import { FileHeader } from './FileHeader';
import {
  mdiLinkVariant,
  mdiAlertOutline,
  mdiFileCodeOutline,
  mdiOpenInNew,
  mdiGit,
  mdiClose,
  mdiShieldCheckOutline,
  mdiAlertCircleOutline,
  mdiInformationOutline,
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
  onClearSelection,
  onShowInGraph,
}) => {
  const t = WEBVIEW_STRINGS[language];
  const cStrings = t.coupling;

  const isFileMode = Boolean(node && node.path);
  const targetFilePath = node?.path ? (node.path.split('#')[0] || '').replace(/^\//, '') : '';
  const couplings: TemporalCoupling[] = node?.temporalCoupling || [];
  const projectCouplings: ProjectCouplingPair[] = snapshot?.projectCouplings || [];

  const maxCouplingDegree = couplings.length > 0
    ? Math.max(...couplings.map((c) => c.couplingDegree))
    : 0;
  const strongCouplingsCount = projectCouplings.filter(
    (p) => Math.max(p.degreeA, p.degreeB) >= 0.7
  ).length;

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
      {/* 1. File / Component Indicator & Actions Bar */}
      {isFileMode && node && (
        <FileHeader
          node={node}
          filePath={targetFilePath}
          onOpenFile={onOpenFile}
          onClearSelection={onClearSelection}
          language={language}
          openFileTooltip={cStrings.openFile}
          clearSelectionTooltip={cStrings.backToProject}
          style={{ padding: '2px 0 6px 0', flexShrink: 0 }}
        />
      )}

      {/* 2. Top Status / Value Section (File Mode, structured like Health) */}
      {isFileMode && (() => {
        const pct = Math.round(maxCouplingDegree * 100);
        const isHigh = maxCouplingDegree >= 0.7;
        const isMed = maxCouplingDegree >= 0.4 && maxCouplingDegree < 0.7;
        const isLow = maxCouplingDegree > 0 && maxCouplingDegree < 0.4;
        const style = isHigh
          ? { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.35)', color: '#ef4444', icon: mdiAlertCircleOutline, label: cStrings.highCouplingRisk }
          : isMed
          ? { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)', color: '#f59e0b', icon: mdiAlertOutline, label: cStrings.moderateCouplingRisk }
          : isLow
          ? { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', color: 'var(--accent-color)', icon: mdiLinkVariant, label: cStrings.slightCouplingRisk }
          : { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', color: '#10b981', icon: mdiShieldCheckOutline, label: cStrings.noCouplingRisk };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: style.color }}>
                  {pct}%
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cStrings.maxCoupling}</span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: style.color,
                  backgroundColor: style.bg,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: `1px solid ${style.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Icon path={style.icon} size={0.55} color={style.color} />
                <span>{style.label}</span>
              </span>
            </div>

            {/* Coupling Progress Bar (like Health) */}
            <div
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: 'var(--border-color)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(pct > 0 ? 5 : 0, Math.min(100, pct))}%`,
                  height: '100%',
                  backgroundColor: style.color,
                  transition: 'width 0.3s ease',
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        );
      })()}

      {/* 2. Project Mode Header & Top KPI Cards */}
      {!isFileMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiLinkVariant} size={0.8} color="var(--accent-color)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {cStrings.projectTitle}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  {cStrings.coupledPairs}
                </span>
                <Icon path={mdiLinkVariant} size={0.65} color="var(--accent-color)" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {projectCouplings.length}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {cStrings.linksCount}
                </span>
              </div>
              <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                {cStrings.minCoupling} ≥ 20%
              </span>
            </div>

            <div
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  {cStrings.strongCouplings}
                </span>
                <Icon
                  path={strongCouplingsCount > 0 ? mdiAlertCircleOutline : mdiShieldCheckOutline}
                  size={0.65}
                  color={strongCouplingsCount > 0 ? '#ef4444' : '#10b981'}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: strongCouplingsCount > 0 ? '#ef4444' : '#10b981',
                  }}
                >
                  {strongCouplingsCount}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  ({projectCouplings.length > 0 ? Math.round((strongCouplingsCount / projectCouplings.length) * 100) : 0}%)
                </span>
              </div>
              <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                {strongCouplingsCount > 0 ? cStrings.criticalCoupling : cStrings.noCouplingRisk}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Section Header for File Mode */}
      {isFileMode && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <Icon path={mdiLinkVariant} size={0.7} color="var(--accent-color)" />
            <span>{cStrings.fileTitle}</span>
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
            {couplings.length}
          </span>
        </div>
      )}

      {/* 4. Main Content List */}
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
                          {c.coChanges} {cStrings.coCommits} ({c.totalCommits} {t.total})
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

            {/* File Mode Explanation & Recommendation Card (at the bottom) */}
            <div
              style={{
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiInformationOutline} size={0.7} color="var(--accent-color)" />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {cStrings.explanationTitle}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <span>{cStrings.explanationText}</span>
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: 4,
                }}
              >
                <Icon path={mdiInformationOutline} size={0.55} color="var(--text-secondary)" />
                <span><strong>{cStrings.recommendation}:</strong> {cStrings.recommendationText}</span>
              </div>
            </div>
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

            {/* Project Mode Explanation Card (at the bottom) */}
            <div
              style={{
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiInformationOutline} size={0.7} color="var(--accent-color)" />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {cStrings.projectSubtitle}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <span>{cStrings.explanationText}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
