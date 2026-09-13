import React from 'react';
import type { TreeNode, AnalysisSnapshot, KnowledgeSummary, ContributorStat, KnowledgeRiskItem } from '../../../src/analyzer/types';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import { FileHeader } from './FileHeader';
import {
  mdiAccountMultipleOutline,
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiShieldCheckOutline,
  mdiFileCodeOutline,
  mdiInformationOutline,
} from '@mdi/js';

interface Props {
  node: TreeNode | null;
  snapshot: AnalysisSnapshot | null;
  language: Language;
  onOpenFile?: (filePath: string, startLine?: number, endLine?: number) => void;
  onSelectNode?: (nodePath: string) => void;
  onClearSelection?: () => void;
  onShowInTreemap?: (filePath?: string) => void;
}

const AUTHOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
];

function getAuthorColor(index: number): string {
  return AUTHOR_PALETTE[index % AUTHOR_PALETTE.length];
}

function getRiskBadgeStyle(risk: string | undefined): { bg: string; border: string; color: string; icon: string } {
  if (risk === 'high') {
    return {
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.35)',
      color: '#ef4444',
      icon: mdiAlertCircleOutline,
    };
  }
  if (risk === 'medium') {
    return {
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.35)',
      color: '#f59e0b',
      icon: mdiAlertOutline,
    };
  }
  return {
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.35)',
    color: '#10b981',
    icon: mdiShieldCheckOutline,
  };
}

export const KnowledgePanel: React.FC<Props> = ({
  node,
  snapshot,
  language,
  onOpenFile,
  onSelectNode,
  onClearSelection,
}) => {
  const t = WEBVIEW_STRINGS[language];
  const kStrings = t.knowledge;

  const isFileMode = Boolean(node && node.path);
  const targetFilePath = node?.path ? (node.path.split('#')[0] || '').replace(/^\//, '') : '';
  const contributors: ContributorStat[] = node?.contributors || [];
  const knowledgeSummary: KnowledgeSummary | undefined = snapshot?.knowledgeSummary;

  const hasContributors = contributors.length > 0 || Boolean(node?.primaryAuthor);
  const primaryAuthor = node?.primaryAuthor || (contributors[0]?.name);
  const primaryPercentage = hasContributors
    ? (node?.primaryAuthorPercentage ?? (contributors[0]?.percentage ?? (node?.commitCount && contributors[0]?.commits ? Number(((contributors[0].commits / node.commitCount) * 100).toFixed(1)) : 100)))
    : 0;
  const riskLevel = node?.knowledgeRisk || (
    !hasContributors
      ? 'low'
      : primaryPercentage >= 75
      ? 'high'
      : primaryPercentage >= 50
      ? 'medium'
      : 'low'
  );

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
      {/* 1. Header with single-line node indicator if file mode */}
      {isFileMode && node && (
        <FileHeader
          node={node}
          filePath={targetFilePath}
          onOpenFile={onOpenFile}
          onClearSelection={onClearSelection}
          language={language}
          openFileTooltip={kStrings.openFile}
          clearSelectionTooltip={kStrings.backToProject}
          style={{ padding: '2px 0 6px 0', flexShrink: 0 }}
        />
      )}

      {/* 2. FILE MODE: Specific File Knowledge Distribution */}
      {isFileMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Status KPI Section (structured like Health) */}
          {(() => {
            const style = getRiskBadgeStyle(riskLevel);
            const riskLabel =
              !hasContributors
                ? (language === 'de' ? 'Kein Risiko / Keine Daten' : 'No Risk / No Data')
                : riskLevel === 'high'
                ? kStrings.highRisk
                : riskLevel === 'medium'
                ? kStrings.mediumRisk
                : kStrings.lowRisk;

            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: style.color }}>
                    {hasContributors ? `${primaryPercentage.toFixed(1)}%` : '0%'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{kStrings.ownership}</span>
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
                  <span>{riskLabel}</span>
                </span>
              </div>
            );
          })()}

          {/* Section Header: Contributors / Knowledge Distribution */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
              <Icon path={mdiAccountMultipleOutline} size={0.7} color="var(--accent-color)" />
              <span>{kStrings.fileTitle}</span>
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
              {contributors.length}
            </span>
          </div>

          {/* Stacked Ownership Bar */}
          {contributors.length > 0 && (
            <div
              style={{
                height: 10,
                width: '100%',
                borderRadius: 5,
                overflow: 'hidden',
                display: 'flex',
                backgroundColor: 'var(--border-color)',
              }}
            >
              {contributors.map((c, i) => {
                const pct = c.percentage ?? (node?.commitCount ? (c.commits / node.commitCount) * 100 : 0);
                if (pct <= 0) return null;
                return (
                  <div
                    key={c.name}
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: getAuthorColor(i),
                    }}
                    title={`${c.name}: ${pct.toFixed(1)}% (${c.commits} ${kStrings.commitsLabel})`}
                  />
                );
              })}
            </div>
          )}

          {/* Contributors Breakdown List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {contributors.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 0', textAlign: 'center' }}>
                {kStrings.noAuthors}
              </div>
            ) : (
              contributors.map((c, i) => {
                const color = getAuthorColor(i);
                const pct = c.percentage ?? (node?.commitCount ? (c.commits / node.commitCount) * 100 : 0);
                const linesInfo = (c.linesAdded || c.linesDeleted)
                  ? ` (+${c.linesAdded || 0}/-${c.linesDeleted || 0})`
                  : '';

                return (
                  <div
                    key={c.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: 4,
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontWeight: i === 0 ? 700 : 500,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.name}
                      </span>
                      {i === 0 && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: '1px 4px',
                            borderRadius: 3,
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            color: 'var(--accent-color)',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {kStrings.primaryAuthor}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
                        {c.commits}c{linesInfo}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', width: 42, textAlign: 'right' }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Explanation & Recommendation (at the bottom) */}
          {hasContributors ? (
            (() => {
              const style = getRiskBadgeStyle(riskLevel);
              return (
                <div
                  style={{
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 6,
                    backgroundColor: style.bg,
                    border: `1px solid ${style.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon path={mdiInformationOutline} size={0.7} color={style.color} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: style.color }}>
                      {riskLevel === 'high' ? kStrings.singleAuthorWarningTitle : kStrings.sharedKnowledgeTitle}
                    </span>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {riskLevel === 'high' ? (
                      <span>{kStrings.singleAuthorWarningText(primaryAuthor || kStrings.unknownAuthor, Number(primaryPercentage.toFixed(1)))}</span>
                    ) : (
                      <span>{kStrings.sharedKnowledgeText}</span>
                    )}
                  </div>

                  {riskLevel === 'high' && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        borderTop: `1px solid ${style.border}`,
                        paddingTop: 4,
                      }}
                    >
                      <Icon path={mdiInformationOutline} size={0.55} color="var(--text-secondary)" />
                      <span><strong>{kStrings.recommendation}:</strong> {kStrings.recommendationText}</span>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div
              style={{
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon path={mdiInformationOutline} size={0.7} color="var(--text-secondary)" />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {kStrings.noAuthors}
              </span>
            </div>
          )}
        </div>
      ) : (
        /* 3. GLOBAL / PROJECT MODE: Team Overview, Truck Factor, Key Developer Risks */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiAccountMultipleOutline} size={0.8} color="var(--accent-color)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {kStrings.projectTitle}
            </span>
          </div>

          {/* KPI Cards: Truck Factor, Monopoly Files, Active Authors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {/* Card 1: Truck Factor */}
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
              title={kStrings.truckFactorDesc}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  {kStrings.truckFactor}
                </span>
                <Icon
                  path={
                    (knowledgeSummary?.truckFactor ?? 0) <= 1
                      ? mdiAlertCircleOutline
                      : mdiShieldCheckOutline
                  }
                  size={0.65}
                  color={(knowledgeSummary?.truckFactor ?? 0) <= 1 ? '#ef4444' : '#10b981'}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color:
                      (knowledgeSummary?.truckFactor ?? 0) <= 1
                        ? '#ef4444'
                        : (knowledgeSummary?.truckFactor ?? 0) <= 2
                        ? '#f59e0b'
                        : '#10b981',
                  }}
                >
                  {knowledgeSummary?.truckFactor ?? 0}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {(knowledgeSummary?.truckFactor ?? 0) === 1 ? kStrings.developerSingle : kStrings.developerPlural}
                </span>
              </div>
              <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                {(knowledgeSummary?.truckFactor ?? 0) <= 1
                  ? kStrings.criticalRiskBadge
                  : kStrings.healthyRiskBadge}
              </span>
            </div>

            {/* Card 2: Monopoly Files */}
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
              title={kStrings.monopolyFilesDesc}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  {kStrings.monopolyFiles}
                </span>
                <Icon
                  path={
                    (knowledgeSummary?.monopolyPercentage ?? 0) >= 25
                      ? mdiAlertCircleOutline
                      : mdiShieldCheckOutline
                  }
                  size={0.65}
                  color={(knowledgeSummary?.monopolyPercentage ?? 0) >= 25 ? '#ef4444' : '#10b981'}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color:
                      (knowledgeSummary?.monopolyPercentage ?? 0) >= 50
                        ? '#ef4444'
                        : (knowledgeSummary?.monopolyPercentage ?? 0) >= 25
                        ? '#f59e0b'
                        : 'var(--text-primary)',
                  }}
                >
                  {knowledgeSummary?.monopolyFileCount ?? 0}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  ({knowledgeSummary?.monopolyPercentage ?? 0}%)
                </span>
              </div>
              <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                {kStrings.singleOwnership}
              </span>
            </div>
          </div>

          {/* Key Authors Distribution */}
          {knowledgeSummary && (knowledgeSummary.topAuthors?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {kStrings.topAuthors}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {knowledgeSummary.totalAuthors} {kStrings.total}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(knowledgeSummary.topAuthors || []).slice(0, 6).map((author, i) => {
                  const color = getAuthorColor(i);
                  return (
                    <div
                      key={author.name}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 4,
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: color,
                            }}
                          />
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {author.name}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color }}>
                          {author.percentageOfCodebase}% {kStrings.codebaseShare}
                        </span>
                      </div>

                      {/* Bar indicator */}
                      <div
                        style={{
                          height: 5,
                          width: '100%',
                          borderRadius: 3,
                          backgroundColor: 'var(--border-color)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${author.percentageOfCodebase}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)' }}>
                        <span>{author.fileCount} {kStrings.filesLabel} ({author.monopolyFileCount} {kStrings.monopoliesLabel})</span>
                        <span>{author.totalCommits} {kStrings.commitsLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Critical Risk Monopoly Hotspots */}
          {knowledgeSummary && (knowledgeSummary.highestRiskFiles?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {kStrings.riskHotspots}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {kStrings.riskHotspotsSubtitle}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(knowledgeSummary.highestRiskFiles || []).slice(0, 8).map((rf: KnowledgeRiskItem) => {
                  const badgeStyle = getRiskBadgeStyle(rf.riskLevel);
                  return (
                    <div
                      key={rf.filePath}
                      onClick={() => onSelectNode?.(rf.filePath)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 4,
                        backgroundColor: 'var(--bg-card)',
                        border: `1px solid var(--border-color)`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent-color)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                          <Icon path={mdiFileCodeOutline} size={0.65} color="var(--text-secondary)" />
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={rf.filePath}
                          >
                            {rf.name}
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 3,
                            backgroundColor: badgeStyle.bg,
                            color: badgeStyle.color,
                            border: `1px solid ${badgeStyle.border}`,
                            flexShrink: 0,
                          }}
                        >
                          {rf.ownershipPercentage}% {rf.primaryAuthor}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                          {rf.filePath}
                        </span>
                        <span>{rf.loc} LOC · {rf.commitCount}c</span>
                      </div>
                    </div>
                  );
                })}
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
                {kStrings.projectSubtitle}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              <span>{kStrings.truckFactorDesc}. {kStrings.monopolyFilesDesc}.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
