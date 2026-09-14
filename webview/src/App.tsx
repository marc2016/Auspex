import React, { useState, useEffect, useMemo } from 'react';
import { getVsCodeApi } from './services/vscode';
import { TreemapViewer, type TreemapViewMode, type SizeMetric, type ColorMetric } from './components/TreemapViewer';
import { SystemMapViewer } from './components/SystemMapViewer';
import { CouplingGraphViewer } from './components/CouplingGraphViewer';
import { TreemapDetailsPanel } from './components/TreemapDetailsPanel';
import { CouplingPanel } from './components/CouplingPanel';
import { KnowledgePanel } from './components/KnowledgePanel';
import { TopBar } from './components/TopBar';
import { Icon } from './components/Icon';
import { WEBVIEW_STRINGS, useLanguage } from './i18n';
import {
  mdiInformationOutline,
  mdiHeartPulse,
  mdiShieldCheckOutline,
  mdiAlertCircleOutline,
  mdiFormatListNumbered,
  mdiFileCodeOutline,
} from '@mdi/js';
import type { AnalysisSnapshot, TreeNode, PipelineProgress } from '../../src/analyzer/types';
import { type TimeframeOption, filterTreeByTimeframe } from './utils/timeframeFilter';

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'java', 'cs', 'py', 'go', 'rs', 'c', 'cpp', 'h', 'hpp',
]);

function filterSourceCodeOnly(node: TreeNode): TreeNode | null {
  if (node.type === 'file') {
    const ext = node.name.split('.').pop()?.toLowerCase() ?? '';
    return CODE_EXTENSIONS.has(ext) ? { ...node } : null;
  }

  if (node.children) {
    const filtered = node.children
      .map(filterSourceCodeOnly)
      .filter((c): c is TreeNode => c !== null);

    if (filtered.length === 0) return null;

    const totalLoc = filtered.reduce((sum, c) => sum + c.loc, 0);
    return {
      ...node,
      loc: totalLoc,
      value: totalLoc,
      children: filtered,
    };
  }

  return { ...node };
}

function findFileInTree(root: TreeNode, filePath: string): TreeNode | null {
  const cleanTarget = filePath.replace(/^\//, '');
  function search(node: TreeNode): TreeNode | null {
    if (node.type === 'file' && node.path.replace(/^\//, '') === cleanTarget) {
      return node;
    }
    if (node.children) {
      for (const child of node.children) {
        const res = search(child);
        if (res) return res;
      }
    }
    return null;
  }
  return search(root);
}

export const App: React.FC = () => {
  const vscode = getVsCodeApi();
  const [language, setLanguage] = useLanguage();
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [viewModeType, setViewModeType] = useState<'main' | 'details' | 'health' | 'coupling' | 'knowledge'>(() => {
    if (typeof window !== 'undefined') {
      const v = (window as any).__AUSPEX_VIEW__;
      if (v === 'health' || window.location.search.includes('view=health')) return 'health';
      if (v === 'details' || window.location.search.includes('view=details')) return 'details';
      if (v === 'coupling' || window.location.search.includes('view=coupling')) return 'coupling';
      if (v === 'knowledge' || window.location.search.includes('view=knowledge')) return 'knowledge';
    }
    return 'main';
  });

  const [chartType, setChartType] = useState<'treemap' | 'systemMap' | 'couplingGraph'>('treemap');
  const [minCouplingThreshold, setMinCouplingThreshold] = useState<number>(0.2);
  const [viewMode, setViewMode] = useState<TreemapViewMode>('files');
  const [sizeMetric, setSizeMetric] = useState<SizeMetric>('loc');
  const [colorMetric, setColorMetric] = useState<ColorMetric>('health');
  const [timeframe, setTimeframe] = useState<TimeframeOption>('all');
  const [sourceCodeOnly, setSourceCodeOnly] = useState(true);
  const [maxItems, setMaxItems] = useState(100);

  useEffect(() => {
    // Notify extension host that webview is mounted and ready
    vscode.postMessage({ type: 'ready' });

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'init') {
        if (msg.view === 'details' || msg.view === 'health' || msg.view === 'coupling' || msg.view === 'knowledge') {
          setViewModeType(msg.view);
        }
        if (msg.language && (msg.language === 'de' || msg.language === 'en')) {
          setLanguage(msg.language);
        }
        if (msg.node !== undefined) {
          setSelectedNode(msg.node);
        }
      } else if (msg.type === 'node:set') {
        setSelectedNode(msg.payload);
      } else if (msg.type === 'snapshot:update') {
        setSnapshot(msg.payload);
        setProgress(null);
      } else if (msg.type === 'progress:update') {
        setProgress(msg.payload);
        if (msg.payload.stage === 'done') {
          setTimeout(() => setProgress(null), 1200);
        }
      } else if (msg.type === 'language:set' && (msg.payload === 'de' || msg.payload === 'en')) {
        setLanguage(msg.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setLanguage]);

  const handleNodeClick = (node: TreeNode) => {
    setSelectedNode(node);
    // Update and focus the dedicated VS Code Sidebar ("Auspex Details")
    vscode.postMessage({ type: 'nodeSelected', node });
  };

  const handleOpenFile = (filePath: string, startLine?: number, endLine?: number) => {
    vscode.postMessage({
      type: 'openFile',
      filePath,
      startLine,
      endLine,
    });
  };

  const handleOpenCommitDiff = (commitHash: string, filePath?: string, baseCommitHash?: string) => {
    vscode.postMessage({
      type: 'openCommitDiff',
      commitHash,
      filePath,
      baseCommitHash,
    });
  };

  const handleOpenExternal = (url: string) => {
    vscode.postMessage({
      type: 'openExternal',
      url,
    });
  };

  const handleRescan = () => {
    vscode.postMessage({ type: 'rescan' });
  };

  const displayTree = useMemo(() => {
    if (!snapshot?.tree) return null;
    let tree = sourceCodeOnly ? (filterSourceCodeOnly(snapshot.tree) ?? snapshot.tree) : snapshot.tree;
    if (timeframe !== 'all') {
      tree = filterTreeByTimeframe(tree, timeframe);
    }
    return tree;
  }, [snapshot, sourceCodeOnly, timeframe]);

  // Keep selectedNode synchronized when timeframe changes
  useEffect(() => {
    if (!selectedNode || !displayTree) return;
    function findInTree(n: TreeNode, targetPath: string): TreeNode | null {
      if (n.path === targetPath) return n;
      if (n.children) {
        for (const child of n.children) {
          const found = findInTree(child, targetPath);
          if (found) return found;
        }
      }
      return null;
    }
    const updated = findInTree(displayTree, selectedNode.path);
    if (updated) {
      setSelectedNode(updated);
    }
  }, [displayTree]);

  if (viewModeType === 'coupling') {
    return (
      <div
        className="app-container"
        style={{
          height: '100vh',
          width: '100%',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <CouplingPanel
          node={selectedNode}
          snapshot={snapshot}
          language={language}
          onOpenFile={handleOpenFile}
          onSelectNode={(nodePath) => {
            if (snapshot?.tree) {
              const found = findFileInTree(snapshot.tree, nodePath);
              if (found) {
                setSelectedNode(found);
                vscode.postMessage({ type: 'nodeSelected', node: found });
              }
            }
          }}
          onClearSelection={() => {
            setSelectedNode(null);
            vscode.postMessage({ type: 'clearSelection' });
          }}
          onShowInGraph={() => {
            vscode.postMessage({ type: 'openTreemap' });
          }}
        />
      </div>
    );
  }

  if (viewModeType === 'knowledge') {
    return (
      <div
        className="app-container"
        style={{
          height: '100vh',
          width: '100%',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <KnowledgePanel
          node={selectedNode}
          snapshot={snapshot}
          language={language}
          onOpenFile={handleOpenFile}
          onSelectNode={(nodePath) => {
            if (snapshot?.tree) {
              const found = findFileInTree(snapshot.tree, nodePath);
              if (found) {
                setSelectedNode(found);
                vscode.postMessage({ type: 'nodeSelected', node: found });
              }
            }
          }}
          onClearSelection={() => {
            setSelectedNode(null);
            vscode.postMessage({ type: 'clearSelection' });
          }}
          onShowInTreemap={() => {
            vscode.postMessage({ type: 'openTreemap' });
          }}
        />
      </div>
    );
  }

  if (viewModeType === 'details' || viewModeType === 'health') {
    const t = WEBVIEW_STRINGS[language];
    return (
      <div
        className="app-container"
        style={{
          height: '100vh',
          width: '100%',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {selectedNode ? (
          <TreemapDetailsPanel
            node={selectedNode}
            totalLoc={snapshot?.totalLoc ?? snapshot?.tree?.loc}
            onClose={() => {
              setSelectedNode(null);
              vscode.postMessage({ type: 'clearSelection' });
            }}
            onOpenFile={handleOpenFile}
            onOpenCommitDiff={handleOpenCommitDiff}
            onOpenExternal={handleOpenExternal}
            language={language}
            isSidebarView={true}
            initialTab={viewModeType === 'health' ? 'health' : 'details'}
            mode={viewModeType === 'health' ? 'health' : 'details'}
          />
        ) : viewModeType === 'health' ? (
          <div
            style={{
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              height: '100%',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon path={mdiHeartPulse} size={0.8} color="#10b981" />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                Workspace Code Health
              </span>
            </div>

            {/* Top KPI Cards */}
            {(() => {
              const sysScore = snapshot?.tree?.codeHealth ?? 10.0;
              const isHealthy = sysScore >= 9.0;
              const isProblematic = sysScore >= 6.0 && sysScore < 9.0;
              const color = isHealthy ? '#10b981' : isProblematic ? '#f59e0b' : '#ef4444';
              const statusLabel = isHealthy ? t.codeHealth.healthy : isProblematic ? t.codeHealth.problematic : t.codeHealth.unhealthy;

              return (
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
                        Score
                      </span>
                      <Icon path={mdiHeartPulse} size={0.65} color={color} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color }}>
                        {sysScore.toFixed(1)}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>/ 10.0</span>
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                      {statusLabel}
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
                        Status
                      </span>
                      <Icon
                        path={isHealthy ? mdiShieldCheckOutline : mdiAlertCircleOutline}
                        size={0.65}
                        color={color}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color }}>
                        {statusLabel}
                      </span>
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                      Skala 1.0 – 10.0
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Hint / Instruction */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 11,
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}
            >
              <Icon path={mdiHeartPulse} size={0.8} color="#10b981" style={{ flexShrink: 0 }} />
              <span>{t.codeHealth.noNodeSelectedHealthDesc}</span>
            </div>

            {/* Health Mode Explanation Card (at the bottom) */}
            <div
              style={{
                marginTop: 'auto',
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
                  {t.codeHealth.explanationTitle}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <span>{t.codeHealth.explanationText}</span>
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
                <span><strong>{t.codeHealth.recommendation}:</strong> {t.codeHealth.recommendationText}</span>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              height: '100%',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon path={mdiInformationOutline} size={0.8} color="var(--accent-color)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {language === 'de' ? 'Workspace-Übersicht' : 'Workspace Overview'}
              </span>
            </div>

            {/* Top KPI Cards */}
            {snapshot && (
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
                      {t.metrics.loc}
                    </span>
                    <Icon path={mdiFormatListNumbered} size={0.65} color="var(--accent-color)" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {(snapshot.totalLoc || 0).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>LOC</span>
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                    Gesamter Code
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
                      Dateien
                    </span>
                    <Icon path={mdiFileCodeOutline} size={0.65} color="var(--accent-color)" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {snapshot.totalFiles || 0}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Dateien</span>
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                    Im Projekt erfasst
                  </span>
                </div>
              </div>
            )}

            {/* Hint / Instruction */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 11,
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}
            >
              <Icon path={mdiInformationOutline} size={0.8} color="var(--accent-color)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{t.noNodeSelectedTitle}</div>
                <div>{t.noNodeSelectedDesc}</div>
              </div>
            </div>

            {/* Details Mode Explanation Card (at the bottom) */}
            <div
              style={{
                marginTop: 'auto',
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
                  {t.detailsExplanationTitle}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <span>{t.detailsExplanationText}</span>
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
                <span><strong>{t.codeHealth.recommendation}:</strong> {t.detailsRecommendationText}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      <TopBar
        chartType={chartType}
        onChartTypeChange={setChartType}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sizeMetric={sizeMetric}
        onSizeMetricChange={setSizeMetric}
        colorMetric={colorMetric}
        onColorMetricChange={setColorMetric}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        maxItems={maxItems}
        onMaxItemsChange={setMaxItems}
        sourceCodeOnly={sourceCodeOnly}
        onSourceCodeOnlyChange={setSourceCodeOnly}
        onRescan={handleRescan}
        totalLoc={snapshot?.totalLoc ?? 0}
        totalFiles={snapshot?.totalFiles ?? 0}
        minCouplingThreshold={minCouplingThreshold}
        onMinCouplingThresholdChange={setMinCouplingThreshold}
        language={language}
      />

      <div className="main-content" style={{ position: 'relative', display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="treemap-area" style={{ flex: 1, position: 'relative', height: '100%' }}>
          {displayTree ? (
            chartType === 'couplingGraph' ? (
              <CouplingGraphViewer
                tree={displayTree}
                snapshot={snapshot}
                selectedNode={selectedNode}
                minCouplingThreshold={minCouplingThreshold}
                language={language}
                onNodeClick={(nodeOrPath) => {
                  if (typeof nodeOrPath === 'string') {
                    if (snapshot?.tree) {
                      const found = findFileInTree(snapshot.tree, nodeOrPath);
                      if (found) handleNodeClick(found);
                    }
                  } else {
                    handleNodeClick(nodeOrPath);
                  }
                }}
              />
            ) : chartType === 'systemMap' ? (
              <SystemMapViewer
                tree={displayTree}
                selectedNode={selectedNode}
                onNodeClick={handleNodeClick}
                colorMetric={colorMetric}
                language={language}
              />
            ) : (
              <TreemapViewer
                tree={displayTree}
                viewMode={viewMode}
                sizeMetric={sizeMetric}
                colorMetric={colorMetric}
                maxItems={maxItems}
                onNodeClick={handleNodeClick}
                selectedNode={selectedNode}
                language={language}
              />
            )
          ) : (
            <div
              style={{
                display: 'flex',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <span>
                {progress
                  ? progress.message
                  : language === 'de'
                  ? 'Workspace wird analysiert…'
                  : 'Analyzing workspace…'}
              </span>
            </div>
          )}

          {/* Progress Overlay */}
          {progress && progress.stage !== 'done' && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '8px 16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 12,
                zIndex: 100,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  border: '2px solid var(--accent-color)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <span>{progress.message} ({progress.percentage}%)</span>
              <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              `}</style>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
