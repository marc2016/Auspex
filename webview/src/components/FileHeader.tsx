import React from 'react';
import { Icon } from './Icon';
import { mdiOpenInNew, mdiClose } from '@mdi/js';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import type { TreeNode } from '../../../src/analyzer/types';

export interface FileHeaderProps {
  node: TreeNode | {
    name: string;
    path: string;
    type?: string;
    startLine?: number;
    endLine?: number;
    loc?: number;
    commitCount?: number;
  } | null;
  /** Optional custom file path override */
  filePath?: string;
  /** Optional custom subtitle (e.g. formatted LOC, commits, or path) */
  subtitle?: React.ReactNode;
  /** Callback to open file in editor */
  onOpenFile?: (filePath: string, startLine?: number, endLine?: number) => void;
  /** Callback to deselect / clear selection */
  onClearSelection?: () => void;
  /** Current language */
  language: Language;
  /** Tooltip overrides */
  openFileTooltip?: string;
  clearSelectionTooltip?: string;
  /** Optional extra action buttons placed before the close button */
  extraActions?: React.ReactNode;
  /** Custom root style */
  style?: React.CSSProperties;
}

/**
 * Reusable header component for selected files/nodes across all Auspex panels.
 * Displays node type badge, name, separator, path/subtitle, and action buttons (Open in Editor, Clear Selection).
 */
export const FileHeader: React.FC<FileHeaderProps> = ({
  node,
  filePath,
  subtitle,
  onOpenFile,
  onClearSelection,
  language,
  openFileTooltip,
  clearSelectionTooltip,
  extraActions,
  style,
}) => {
  if (!node) return null;

  const t = WEBVIEW_STRINGS[language] || WEBVIEW_STRINGS.de;
  const targetFilePath = (filePath || node.path || '').split('#')[0].replace(/^\//, '');

  const defaultOpenTooltip =
    openFileTooltip ||
    t.coupling?.openFile ||
    (language === 'de' ? 'Im Editor öffnen' : 'Open in Editor');

  const defaultClearTooltip =
    clearSelectionTooltip ||
    t.clearSelection ||
    (language === 'de' ? 'Auswahl aufheben' : 'Clear selection');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        paddingBottom: 6,
        borderBottom: '1px solid var(--border-color)',
        color: 'var(--text-secondary)',
        minWidth: 0,
        ...style,
      }}
    >

      <span
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        title={`${node.name} (${targetFilePath})`}
      >
        {node.name}
      </span>

      <span style={{ opacity: 0.4, flexShrink: 0 }}>—</span>

      {subtitle ? (
        typeof subtitle === 'string' ? (
          <span
            style={{
              fontFamily: 'var(--vscode-editor-font-family, monospace)',
              fontSize: 10,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
            title={subtitle}
          >
            {subtitle}
          </span>
        ) : (
          subtitle
        )
      ) : (
        <span
          style={{
            fontFamily: 'var(--vscode-editor-font-family, monospace)',
            fontSize: 10,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
          title={targetFilePath}
        >
          {targetFilePath}
        </span>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
        {extraActions}

        {onOpenFile && targetFilePath && (
          <button
            onClick={() => onOpenFile(targetFilePath, node.startLine, node.endLine)}
            title={defaultOpenTooltip}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '2px 3px',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <Icon path={mdiOpenInNew} size={0.6} />
          </button>
        )}

        {onClearSelection && (
          <button
            onClick={onClearSelection}
            title={defaultClearTooltip}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '2px 3px',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <Icon path={mdiClose} size={0.6} />
          </button>
        )}
      </div>
    </div>
  );
};
