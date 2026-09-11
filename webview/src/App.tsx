import React, { useState, useEffect, useMemo } from 'react';
import { getVsCodeApi } from './services/vscode';
import { TreemapViewer, type TreemapViewMode, type SizeMetric, type ColorMetric } from './components/TreemapViewer';
import { SystemMapViewer } from './components/SystemMapViewer';
import { TreemapDetailsPanel } from './components/TreemapDetailsPanel';
import { TopBar } from './components/TopBar';
import { WEBVIEW_STRINGS, useLanguage } from './i18n';
import { Icon } from './components/Icon';
import { mdiInformationOutline, mdiHeartPulse } from '@mdi/js';
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

export const App: React.FC = () => {
  const vscode = getVsCodeApi();
  const [language, setLanguage] = useLanguage();
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [viewModeType, setViewModeType] = useState<'main' | 'details' | 'health'>(() => {
    if (typeof window !== 'undefined') {
      const v = (window as any).__AUSPEX_VIEW__;
      if (v === 'health' || window.location.search.includes('view=health')) return 'health';
      if (v === 'details' || window.location.search.includes('view=details')) return 'details';
    }
    return 'main';
  });

  const [chartType, setChartType] = useState<'treemap' | 'systemMap'>('treemap');
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
        if (msg.view === 'details' || msg.view === 'health') {
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
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '24px 16px',
              textAlign: 'center',
              gap: 12,
              color: 'var(--text-secondary)',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon path={mdiHeartPulse} size={1.2} color="#10b981" />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t.codeHealth.noNodeSelectedHealthTitle}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 260 }}>
              {t.codeHealth.noNodeSelectedHealthDesc}
            </div>

            {snapshot?.tree?.codeHealth !== undefined && (() => {
              const sysScore = snapshot.tree.codeHealth;
              const isHealthy = sysScore >= 9.0;
              const isProblematic = sysScore >= 6.0 && sysScore < 9.0;
              const color = isHealthy ? '#10b981' : isProblematic ? '#f59e0b' : '#ef4444';
              const statusLabel = isHealthy ? t.codeHealth.healthy : isProblematic ? t.codeHealth.problematic : t.codeHealth.unhealthy;

              return (
                <div
                  style={{
                    marginTop: 12,
                    padding: '12px 14px',
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-card)',
                    border: `1px solid ${color}40`,
                    width: '100%',
                    maxWidth: 280,
                    textAlign: 'left',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                      Workspace {t.codeHealth.score}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color,
                        backgroundColor: `${color}20`,
                        padding: '1px 6px',
                        borderRadius: 3,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color }}>
                      {sysScore.toFixed(1)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>/ 10.0</span>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '24px 16px',
              textAlign: 'center',
              gap: 12,
              color: 'var(--text-secondary)',
              boxSizing: 'border-box',
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
              }}
            >
              <Icon path={mdiInformationOutline} size={1} color="var(--accent-color)" />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t.noNodeSelectedTitle}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 240 }}>
              {t.noNodeSelectedDesc}
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
        language={language}
      />

      <div className="main-content" style={{ position: 'relative', display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="treemap-area" style={{ flex: 1, position: 'relative', height: '100%' }}>
          {displayTree ? (
            chartType === 'systemMap' ? (
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
