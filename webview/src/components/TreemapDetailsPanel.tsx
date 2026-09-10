import React, { useState } from 'react';
import type { TreeNode } from '../../../src/analyzer/types';
import { Icon } from './Icon';
import {
  mdiClose,
  mdiOpenInApp,
  mdiBugOutline,
  mdiFire,
  mdiGit,
  mdiFormatListNumbered,
  mdiAccountMultipleOutline,
  mdiAccountOutline,
  mdiSourceCommit,
  mdiChevronDown,
  mdiChevronUp,
  mdiInformationOutline,
  mdiCompare,
  mdiCompareHorizontal,
  mdiCheck,
  mdiFilterVariant,
  mdiTicketOutline,
  mdiOpenInNew,
} from '@mdi/js';
import { WEBVIEW_STRINGS, type Language } from '../i18n';

export function isBugfixCommit(commit: {
  isFix?: boolean;
  message?: string;
  jiraIssues?: { isBug?: boolean }[];
}): boolean {
  if (typeof commit.isFix === 'boolean') {
    return commit.isFix;
  }
  if (commit.jiraIssues && commit.jiraIssues.some((j) => j.isBug)) {
    return true;
  }
  const subject = (commit.message || '').toLowerCase().trim();
  if (
    subject.startsWith('fix:') ||
    subject.startsWith('fix(') ||
    subject.startsWith('hotfix:') ||
    subject.startsWith('bugfix:')
  ) {
    return true;
  }
  return /\b(fix|fixed|fixes|bug|bugs|hotfix|patch|resolve|resolved)\b/i.test(subject);
}

interface Props {
  node: TreeNode | null;
  onClose: () => void;
  onOpenFile: (filePath: string, startLine?: number, endLine?: number) => void;
  onOpenCommitDiff?: (commitHash: string, filePath?: string, baseCommitHash?: string) => void;
  onOpenExternal?: (url: string) => void;
  language: Language;
  isSidebarView?: boolean;
}

const getAuthorColor = (name: string) => {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name.slice(0, 2) || '?').toUpperCase();
};

export const TreemapDetailsPanel: React.FC<Props> = ({
  node,
  onClose,
  onOpenFile,
  onOpenCommitDiff,
  onOpenExternal,
  language,
  isSidebarView = false,
}) => {
  const [showAllCommits, setShowAllCommits] = useState(false);
  const [baseCommitHash, setBaseCommitHash] = useState<string | null>(null);
  const [filterBugfixes, setFilterBugfixes] = useState(false);

  if (!node) return null;

  const t = WEBVIEW_STRINGS[language];
  const targetFilePath = node.path.split('#')[0].replace(/^\//, '');
  const defectPercent = Math.round((node.defectRatio ?? 0) * 100);
  const churnPercent = Math.round((node.churnScore ?? 0) * 100);

  const contributors = node.contributors ?? [];
  const commits = node.commits ?? [];
  const bugfixCommits = commits.filter(isBugfixCommit);
  const hasBugfixes = (node.fixCount ?? 0) > 0 || bugfixCommits.length > 0;
  const filteredCommits = filterBugfixes ? bugfixCommits : commits;
  const displayedCommits = showAllCommits ? filteredCommits : filteredCommits.slice(0, 10);

  React.useEffect(() => {
    setBaseCommitHash(null);
    setFilterBugfixes(false);
  }, [node?.path]);

  const handleCommitClick = (commit: { hash: string }) => {
    if (!onOpenCommitDiff) return;
    if (baseCommitHash && baseCommitHash !== commit.hash) {
      onOpenCommitDiff(commit.hash, targetFilePath, baseCommitHash);
    } else {
      onOpenCommitDiff(commit.hash, targetFilePath);
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      style={{
        position: isSidebarView ? 'relative' : 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: isSidebarView ? '100%' : 360,
        maxWidth: isSidebarView ? '100%' : '90vw',
        height: isSidebarView ? '100%' : undefined,
        boxSizing: 'border-box',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: isSidebarView ? 'none' : '1px solid var(--border-color)',
        boxShadow: isSidebarView ? 'none' : '-4px 0 24px rgba(0, 0, 0, 0.5)',
        zIndex: isSidebarView ? 1 : 50,
        display: 'flex',
        flexDirection: 'column',
        padding: isSidebarView ? '12px 14px' : 16,
        gap: 12,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: 'var(--accent-color)',
          }}
        >
          {node.type}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={t.close}
        >
          <Icon path={mdiClose} size={0.75} />
        </button>
      </div>

      <div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-all' }}>
        {node.name}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
        {node.path}
      </div>

      <button
        onClick={() => onOpenFile(targetFilePath, node.startLine, node.endLine)}
        style={{
          backgroundColor: 'var(--button-bg)',
          color: 'var(--button-fg)',
          border: 'none',
          borderRadius: 4,
          padding: '8px 12px',
          cursor: 'pointer',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 4,
        }}
      >
        <Icon path={mdiOpenInApp} size={0.8} />
        <span>{t.jumpToCode}</span>
      </button>

      {/* Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginTop: 8,
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            padding: 8,
            borderRadius: 4,
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
            <Icon path={mdiFormatListNumbered} size={0.6} />
            <span>{t.metrics.loc}</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 2 }}>
            {(node.loc || 0).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
          </div>
        </div>

        <div
          onClick={() => {
            if (filterBugfixes) {
              setFilterBugfixes(false);
            }
          }}
          style={{
            backgroundColor: 'var(--bg-card)',
            padding: 8,
            borderRadius: 4,
            border: '1px solid var(--border-color)',
            cursor: filterBugfixes ? 'pointer' : 'default',
            transition: 'all 0.15s ease',
            userSelect: 'none',
          }}
          title={filterBugfixes ? t.showAllCommitsTooltip : undefined}
          onMouseEnter={(e) => {
            if (filterBugfixes) {
              e.currentTarget.style.borderColor = 'var(--accent-color)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-color)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon path={mdiGit} size={0.6} />
              <span>{t.metrics.commits}</span>
            </div>
            {filterBugfixes && (
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--accent-color)',
                  textDecoration: 'underline',
                }}
              >
                {t.allCommits}
              </span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 2 }}>
            {node.commitCount || 0}
          </div>
        </div>

        <div
          onClick={() => {
            if (hasBugfixes) {
              setFilterBugfixes((prev) => !prev);
            }
          }}
          style={{
            backgroundColor: filterBugfixes ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-card)',
            padding: 8,
            borderRadius: 4,
            border: filterBugfixes ? '1px solid #ef4444' : '1px solid var(--border-color)',
            cursor: hasBugfixes ? 'pointer' : 'default',
            transition: 'all 0.15s ease',
            userSelect: 'none',
          }}
          title={
            hasBugfixes
              ? (filterBugfixes ? t.filterActiveTooltip : t.filterByBugfixesTooltip)
              : undefined
          }
          onMouseEnter={(e) => {
            if (hasBugfixes && !filterBugfixes) {
              e.currentTarget.style.borderColor = '#ef4444';
            }
          }}
          onMouseLeave={(e) => {
            if (!filterBugfixes) {
              e.currentTarget.style.borderColor = 'var(--border-color)';
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon path={mdiBugOutline} size={0.6} color="#ef4444" />
              <span style={{ color: filterBugfixes ? '#ef4444' : undefined, fontWeight: filterBugfixes ? 700 : undefined }}>
                {t.metrics.bugFixes}
              </span>
            </div>
            {filterBugfixes && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  padding: '1px 5px',
                  borderRadius: 3,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Icon path={mdiCheck} size={0.35} />
                {t.filterBugfixes}
              </span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#ef4444', marginTop: 2 }}>
            {node.fixCount || 0} ({defectPercent}%)
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            padding: 8,
            borderRadius: 4,
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
            <Icon path={mdiFire} size={0.6} color="#f59e0b" />
            <span>{t.metrics.churnScore}</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#f59e0b', marginTop: 2 }}>
            {churnPercent}%
          </div>
        </div>
      </div>

      {((node.linesAdded ?? 0) > 0 || (node.linesDeleted ?? 0) > 0) && (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            padding: 8,
            borderRadius: 4,
            border: '1px solid var(--border-color)',
            fontSize: 12,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {t.metrics.lineChurn}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>+{node.linesAdded?.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}</span>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>-{node.linesDeleted?.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}</span>
          </div>
        </div>
      )}

      {node.startLine && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {t.metrics.lines}: {node.startLine} – {node.endLine}
        </div>
      )}

      {node.commitCount === 0 ? (
        <div
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 6,
            padding: '10px 12px',
            marginTop: 4,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            <Icon path={mdiInformationOutline} size={0.75} color="var(--accent-color)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t.uncommittedNoticeTitle}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {t.uncommittedNoticeText}
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* Contributors Section */}
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <Icon path={mdiAccountMultipleOutline} size={0.7} color="var(--accent-color)" />
                <span>{t.contributors}</span>
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

            {contributors.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 0' }}>
                {t.noContributors}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contributors.map((contrib) => {
                  const avatarColor = getAuthorColor(contrib.name);
                  const initials = getInitials(contrib.name);
                  const pct = contrib.percentage ?? 0;

                  return (
                    <div
                      key={contrib.name}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              backgroundColor: avatarColor,
                              color: '#fff',
                              fontSize: 10,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={contrib.name}
                          >
                            {contrib.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-color)' }}>
                            {pct}%
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                            ({contrib.commits} {t.commitsCount})
                          </span>
                        </div>
                      </div>

                      {/* Percentage progress bar */}
                      <div
                        style={{
                          height: 4,
                          width: '100%',
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: avatarColor,
                            borderRadius: 2,
                          }}
                        />
                      </div>

                      {/* Lines added / deleted */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, fontSize: 10 }}>
                        <span style={{ color: '#22c55e', fontWeight: 600 }}>
                          +{contrib.linesAdded.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
                        </span>
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>
                          -{contrib.linesDeleted.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Commit History Section */}
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <Icon path={mdiSourceCommit} size={0.7} color="var(--accent-color)" />
                <span>{t.commitHistory}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {filterBugfixes && (
                  <span
                    style={{
                      fontSize: 10,
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      padding: '2px 6px',
                      borderRadius: 10,
                      fontWeight: 600,
                    }}
                  >
                    {filteredCommits.length} / {commits.length}
                  </span>
                )}
                {!filterBugfixes && (
                  <span
                    style={{
                      fontSize: 10,
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      padding: '2px 6px',
                      borderRadius: 10,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {commits.length}
                  </span>
                )}
              </div>
            </div>

            {filterBugfixes && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  fontSize: 11,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', fontWeight: 600 }}>
                  <Icon path={mdiBugOutline} size={0.6} color="#ef4444" />
                  <span>{t.filteredByBugfixesBadge} ({filteredCommits.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFilterBugfixes(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 10,
                    textDecoration: 'underline',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {t.clearFilter}
                </button>
              </div>
            )}

            {filteredCommits.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic',
                  padding: '12px 4px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div>{filterBugfixes ? t.noBugfixCommits : t.noCommits}</div>
                {filterBugfixes && (
                  <button
                    type="button"
                    onClick={() => setFilterBugfixes(false)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-color)',
                      color: 'var(--accent-color)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 4,
                    }}
                  >
                    {t.allCommits}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {commits.length >= 2 && baseCommitHash && (
                  <div
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid var(--accent-color)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600 }}>
                        <Icon path={mdiCompareHorizontal} size={0.65} color="var(--accent-color)" />
                        <span>{t.activeBaseBadge}:</span>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            color: 'var(--accent-color)',
                            backgroundColor: 'rgba(59, 130, 246, 0.2)',
                            padding: '1px 5px',
                            borderRadius: 3,
                          }}
                        >
                          {baseCommitHash.slice(0, 7)}
                        </span>
                      </div>
                      <button
                        onClick={() => setBaseCommitHash(null)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: 10,
                          textDecoration: 'underline',
                          padding: 0,
                          flexShrink: 0,
                        }}
                      >
                        {t.clearBase}
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {t.baseActiveHint}
                    </div>
                  </div>
                )}

                {commits.length >= 2 && !baseCommitHash && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    {t.chooseBaseHint}
                  </div>
                )}

                {displayedCommits.map((commit, idx) => {
                  const shortSha = commit.hash ? commit.hash.slice(0, 7) : '-------';
                  const isBase = baseCommitHash === commit.hash;
                  const isComparingWithBase = Boolean(baseCommitHash && !isBase);
                  const isCommitFix = isBugfixCommit(commit);

                  return (
                    <div
                      key={`${commit.hash}-${idx}`}
                      onClick={() => handleCommitClick(commit)}
                      style={{
                        backgroundColor: isBase
                          ? 'rgba(59, 130, 246, 0.14)'
                          : 'var(--bg-card)',
                        borderRadius: 6,
                        padding: 8,
                        border: isBase
                          ? '1px solid var(--accent-color)'
                          : '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                        cursor: onOpenCommitDiff ? 'pointer' : 'default',
                        transition: 'border-color 0.15s ease, background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isBase) {
                          e.currentTarget.style.borderColor = isComparingWithBase
                            ? '#10b981'
                            : 'var(--accent-color)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isBase) {
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                        }
                      }}
                      title={
                        isBase
                          ? t.viewDiffTooltip
                          : isComparingWithBase
                          ? `${t.compareWithBaseTooltip} (${baseCommitHash?.slice(0, 7)})`
                          : t.viewDiffTooltip
                      }
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 10,
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              padding: '1px 4px',
                              borderRadius: 3,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {shortSha}
                          </span>
                          {isBase && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                color: 'var(--accent-color)',
                                padding: '1px 5px',
                                borderRadius: 3,
                                textTransform: 'uppercase',
                                letterSpacing: 0.3,
                              }}
                            >
                              {t.baseCommitBadge}
                            </span>
                          )}
                          {isCommitFix && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                backgroundColor: 'rgba(239, 68, 68, 0.18)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                padding: '1px 5px',
                                borderRadius: 3,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                textTransform: 'uppercase',
                                letterSpacing: 0.3,
                              }}
                            >
                              <Icon path={mdiBugOutline} size={0.4} color="#ef4444" />
                              <span>{t.bugfixBadge}</span>
                            </span>
                          )}
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                            {formatDate(commit.timestamp)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(commit.linesAdded > 0 || commit.linesDeleted > 0) && (
                            <div style={{ display: 'flex', gap: 4, fontSize: 10 }}>
                              <span style={{ color: '#22c55e', fontWeight: 600 }}>+{commit.linesAdded}</span>
                              <span style={{ color: '#ef4444', fontWeight: 600 }}>-{commit.linesDeleted}</span>
                            </div>
                          )}

                          {/* Base Selection Button */}
                          {commits.length >= 2 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBaseCommitHash((prev) => (prev === commit.hash ? null : commit.hash));
                              }}
                              style={{
                                background: isBase ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.08)',
                                border: isBase ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                                borderRadius: 4,
                                color: isBase ? '#fff' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                padding: '2px 6px',
                                fontSize: 10,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontWeight: isBase ? 700 : 500,
                              }}
                              title={isBase ? t.clearBase : t.setAsBase}
                            >
                              {isBase && <Icon path={mdiCheck} size={0.45} />}
                              <span>{isBase ? t.baseCommitBadge : t.setAsBase}</span>
                            </button>
                          )}

                          {/* Diff / Compare Trigger Button */}
                          {onOpenCommitDiff && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCommitClick(commit);
                              }}
                              style={{
                                background: isComparingWithBase
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : 'rgba(59, 130, 246, 0.12)',
                                border: isComparingWithBase
                                  ? '1px solid rgba(16, 185, 129, 0.4)'
                                  : '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: 4,
                                color: isComparingWithBase ? '#10b981' : 'var(--accent-color)',
                                cursor: 'pointer',
                                padding: '2px 6px',
                                fontSize: 10,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontWeight: 500,
                              }}
                              title={
                                isComparingWithBase
                                  ? `${t.compareWithBaseTooltip} (${baseCommitHash?.slice(0, 7)})`
                                  : t.viewDiffTooltip
                              }
                            >
                              <Icon path={isComparingWithBase ? mdiCompareHorizontal : mdiCompare} size={0.5} />
                              <span>{isComparingWithBase ? t.compareWithBaseBtn : t.viewDiff}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
                        <Icon path={mdiAccountOutline} size={0.5} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {commit.author}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: 11,
                          lineHeight: 1.35,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {commit.message}
                      </div>

                      {/* Jira Tickets */}
                      {commit.jiraIssues && commit.jiraIssues.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 4,
                            marginTop: 4,
                          }}
                        >
                          {commit.jiraIssues.map((issue) => {
                            const isBug = issue.isBug;
                            const badgeBg = isBug ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.12)';
                            const badgeBorder = isBug ? 'rgba(239, 68, 68, 0.35)' : 'rgba(59, 130, 246, 0.3)';
                            const badgeColor = isBug ? '#ef4444' : 'var(--accent-color)';
                            const tooltip = [
                              `${issue.key}: ${issue.issueType}`,
                              issue.status ? `[${issue.status}]` : '',
                              issue.summary || '',
                              issue.url ? `(${t.viewInJiraTooltip})` : '',
                            ]
                              .filter(Boolean)
                              .join(' - ');

                            return (
                              <span
                                key={issue.key}
                                onClick={(e) => {
                                  if (issue.url && onOpenExternal) {
                                    e.stopPropagation();
                                    onOpenExternal(issue.url);
                                  }
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  background: badgeBg,
                                  border: `1px solid ${badgeBorder}`,
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                  fontSize: 10,
                                  fontWeight: 500,
                                  color: badgeColor,
                                  cursor: issue.url ? 'pointer' : 'default',
                                }}
                                title={tooltip}
                              >
                                <Icon path={isBug ? mdiBugOutline : mdiTicketOutline} size={0.45} />
                                <span>{issue.key}</span>
                                <span style={{ opacity: 0.75, fontSize: 9 }}>({issue.issueType})</span>
                                {issue.url && <Icon path={mdiOpenInNew} size={0.4} />}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredCommits.length > 10 && (
                  <button
                    onClick={() => setShowAllCommits((prev) => !prev)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-color)',
                      borderRadius: 4,
                      color: 'var(--accent-color)',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      marginTop: 2,
                    }}
                  >
                    <span>{showAllCommits ? t.showLess : `${t.showAllCommits} (${filteredCommits.length})`}</span>
                    <Icon path={showAllCommits ? mdiChevronUp : mdiChevronDown} size={0.6} />
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
