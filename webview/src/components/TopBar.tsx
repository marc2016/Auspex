import React from 'react';
import type { TreemapViewMode, SizeMetric, ColorMetric } from './TreemapViewer';
import type { TimeframeOption } from '../utils/timeframeFilter';
import { Icon } from './Icon';
import {
  mdiTelescope,
  mdiRefresh,
  mdiFileOutline,
  mdiCubeOutline,
  mdiFunctionVariant,
  mdiFileTree,
  mdiRulerSquare,
  mdiPaletteOutline,
  mdiFilterOutline,
  mdiCalendarRangeOutline,
} from '@mdi/js';
import { WEBVIEW_STRINGS, type Language } from '../i18n';

interface Props {
  viewMode: TreemapViewMode;
  onViewModeChange: (mode: TreemapViewMode) => void;
  sizeMetric: SizeMetric;
  onSizeMetricChange: (metric: SizeMetric) => void;
  colorMetric: ColorMetric;
  onColorMetricChange: (metric: ColorMetric) => void;
  timeframe: TimeframeOption;
  onTimeframeChange: (tf: TimeframeOption) => void;
  maxItems: number;
  onMaxItemsChange: (val: number) => void;
  sourceCodeOnly: boolean;
  onSourceCodeOnlyChange: (val: boolean) => void;
  onRescan: () => void;
  totalLoc: number;
  totalFiles: number;
  language: Language;
}

const VIEW_MODE_ICONS: Record<TreemapViewMode, string> = {
  files: mdiFileOutline,
  classes: mdiCubeOutline,
  functions: mdiFunctionVariant,
  hierarchy: mdiFileTree,
};

export const TopBar: React.FC<Props> = ({
  viewMode,
  onViewModeChange,
  sizeMetric,
  onSizeMetricChange,
  colorMetric,
  onColorMetricChange,
  timeframe,
  onTimeframeChange,
  maxItems,
  onMaxItemsChange,
  sourceCodeOnly,
  onSourceCodeOnlyChange,
  onRescan,
  totalLoc,
  totalFiles,
  language,
}) => {
  const t = WEBVIEW_STRINGS[language];

  return (
    <div className="topbar-container">
      <div className="topbar-left">
        <div className="topbar-brand">
          <Icon path={mdiTelescope} size={0.9} color="var(--accent-color)" />
          <span className="topbar-title">Auspex</span>
          <span className="topbar-stats">
            ({totalFiles} {t.files} · {totalLoc.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')} LOC)
          </span>
        </div>

        {/* View Mode Toggle */}
        <div className="viewmode-group">
          {(['files', 'classes', 'functions', 'hierarchy'] as TreemapViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`viewmode-btn ${viewMode === mode ? 'active' : ''}`}
              title={t.viewModes[mode]}
            >
              <Icon path={VIEW_MODE_ICONS[mode]} size={0.65} />
              <span className="viewmode-text">{t.viewModes[mode]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="topbar-right">
        {/* Size Metric */}
        <div className="control-item" title={t.size}>
          <Icon path={mdiRulerSquare} size={0.65} color="var(--text-secondary)" />
          <span className="control-label">{t.size}</span>
          <select
            value={sizeMetric}
            onChange={(e) => onSizeMetricChange(e.target.value as SizeMetric)}
            className="topbar-select"
          >
            <option value="loc">{t.sizeOptions.loc}</option>
            <option value="churn">{t.sizeOptions.churn}</option>
            <option value="fixes">{t.sizeOptions.fixes}</option>
            <option value="added">{t.sizeOptions.added}</option>
          </select>
        </div>

        {/* Color Metric */}
        <div className="control-item" title={t.color}>
          <Icon path={mdiPaletteOutline} size={0.65} color="var(--text-secondary)" />
          <span className="control-label">{t.color}</span>
          <select
            value={colorMetric}
            onChange={(e) => onColorMetricChange(e.target.value as ColorMetric)}
            className="topbar-select"
          >
            <option value="fixes">{t.colorOptions.fixes}</option>
            <option value="churn">{t.colorOptions.churn}</option>
            <option value="growth">{t.colorOptions.growth}</option>
            <option value="recency">{t.colorOptions.recency}</option>
          </select>
        </div>

        {/* Timeframe Filter */}
        <div className="control-item" title={t.timeframe}>
          <Icon path={mdiCalendarRangeOutline} size={0.65} color="var(--text-secondary)" />
          <span className="control-label">{t.timeframe}</span>
          <select
            value={timeframe}
            onChange={(e) => onTimeframeChange(e.target.value as TimeframeOption)}
            className="topbar-select"
          >
            <option value="all">{t.timeframeOptions.all}</option>
            <option value="1w">{t.timeframeOptions['1w']}</option>
            <option value="1m">{t.timeframeOptions['1m']}</option>
            <option value="6m">{t.timeframeOptions['6m']}</option>
            <option value="1y">{t.timeframeOptions['1y']}</option>
            <option value="2y">{t.timeframeOptions['2y']}</option>
          </select>
        </div>

        {/* Item Limit Filter */}
        <div className="control-item" title={t.limit}>
          <Icon path={mdiFilterOutline} size={0.65} color="var(--text-secondary)" />
          <span className="control-label">{t.limit}</span>
          <select
            value={maxItems}
            onChange={(e) => onMaxItemsChange(Number(e.target.value))}
            className="topbar-select"
          >
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
            <option value={200}>Top 200</option>
            <option value={500}>Top 500</option>
            <option value={0}>{t.limitAll}</option>
          </select>
        </div>

        {/* Source Code Filter */}
        <label className="source-checkbox" title={t.sourceOnly}>
          <input
            type="checkbox"
            checked={sourceCodeOnly}
            onChange={(e) => onSourceCodeOnlyChange(e.target.checked)}
          />
          <span className="source-label">{t.sourceOnly}</span>
        </label>

        {/* Rescan button */}
        <button onClick={onRescan} className="rescan-btn" title={t.rescan}>
          <Icon path={mdiRefresh} size={0.65} />
          <span className="rescan-text">{t.rescan}</span>
        </button>
      </div>
    </div>
  );
};
