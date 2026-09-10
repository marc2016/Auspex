import React, { useState, useEffect, useMemo } from 'react';
import { getVsCodeApi } from './services/vscode';
import { TreemapViewer, type TreemapViewMode, type SizeMetric, type ColorMetric } from './components/TreemapViewer';
import { TreemapDetailsPanel } from './components/TreemapDetailsPanel';
import { TopBar } from './components/TopBar';
import { WEBVIEW_STRINGS, useLanguage } from './i18n';
import { Icon } from './components/Icon';
import { mdiInformationOutline } from '@mdi/js';
import type { AnalysisSnapshot, TreeNode, PipelineProgress } from '../../src/analyzer/types';

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
  const [isDetailsView, setIsDetailsView] = useState<boolean>(() => {
    return (
      typeof window !== 'undefined' &&
      ((window as any).__AUSPEX_VIEW__ === 'details' ||
        window.location.search.includes('view=details'))
    );
  });

  const [viewMode, setViewMode] = useState<TreemapViewMode>('files');
  const [sizeMetric, setSizeMetric] = useState<SizeMetric>('loc');
  const [colorMetric, setColorMetric] = useState<ColorMetric>('fixes');
  const [sourceCodeOnly, setSourceCodeOnly] = useState(true);
  const [maxItems, setMaxItems] = useState(100);

  useEffect(() => {
    // Notify extension host that webview is mounted and ready
    vscode.postMessage({ type: 'ready' });

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'init') {
        if (msg.view === 'details') {
          setIsDetailsView(true);
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
    return sourceCodeOnly ? filterSourceCodeOnly(snapshot.tree) : snapshot.tree;
  }, [snapshot, sourceCodeOnly]);

  if (isDetailsView) {
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
          />
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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sizeMetric={sizeMetric}
        onSizeMetricChange={setSizeMetric}
        colorMetric={colorMetric}
        onColorMetricChange={setColorMetric}
        maxItems={maxItems}
        onMaxItemsChange={setMaxItems}
        sourceCodeOnly={sourceCodeOnly}
        onSourceCodeOnlyChange={setSourceCodeOnly}
        onRescan={handleRescan}
        totalLoc={snapshot?.totalLoc ?? 0}
        totalFiles={snapshot?.totalFiles ?? 0}
        language={language}
      />

      <div className="main-content">
        <div className="treemap-area">
          {displayTree ? (
            <TreemapViewer
              tree={displayTree}
              viewMode={viewMode}
              sizeMetric={sizeMetric}
              colorMetric={colorMetric}
              maxItems={maxItems}
              onNodeClick={handleNodeClick}
            />
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
