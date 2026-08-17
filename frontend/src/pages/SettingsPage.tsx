import { useState } from 'react';
import { Icon } from '../components/common/Icon';
import {
  mdiCog,
  mdiContentSave,
  mdiPlus,
  mdiTrashCanOutline,
  mdiShieldCheckOutline,
} from '@mdi/js';

const CATEGORIZED_DEFAULTS = [
  // Lockfiles
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'composer.lock',
  // Directories
  'node_modules',
  'dist',
  'build',
  '.git',
  'bin',
  'obj',
  '__pycache__',
  '.next',
  'coverage',
  // Bundles & Assets
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.svg',
  '*.png',
  '*.jpg',
  '*.wasm',
  '*.sqlite',
  '*.log',
];

export function SettingsPage() {
  const [ignoreList, setIgnoreList] = useState<string[]>(CATEGORIZED_DEFAULTS);
  const [newPattern, setNewPattern] = useState('');
  const [saved, setSaved] = useState(false);

  const addPattern = () => {
    const trimmed = newPattern.trim();
    if (trimmed && !ignoreList.includes(trimmed)) {
      setIgnoreList([...ignoreList, trimmed]);
      setNewPattern('');
    }
  };

  const removePattern = (p: string) => setIgnoreList(ignoreList.filter((x) => x !== p));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Icon path={mdiCog} size={0.9} color="var(--color-accent)" />
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 22, fontWeight: 700 }}>
          Einstellungen
        </h1>
      </div>

      {/* Ignore patterns */}
      <section
        className="rounded-xl p-5 mb-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Icon path={mdiShieldCheckOutline} size={0.75} color="var(--color-accent)" />
          <h2 style={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 600 }}>
            Globale Ignore-Muster (Lockfiles, Assets & Build-Ordner)
          </h2>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 16 }}>
          Übereinstimmende Dateien und Ordner werden automatisch von Repository-Scans und
          Treemap-Berechnungen ausgeschlossen. Unterstützt Wildcards wie <code style={{ color: 'var(--color-accent)' }}>*.lock</code>, <code style={{ color: 'var(--color-accent)' }}>*.min.js</code>, <code style={{ color: 'var(--color-accent)' }}>*.map</code>.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {ignoreList.map((p) => (
            <span
              key={p}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm"
              style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {p}
              <button
                onClick={() => removePattern(p)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Muster entfernen"
              >
                <Icon path={mdiTrashCanOutline} size={0.55} />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPattern()}
            placeholder="Muster hinzufügen (z. B. *.lock, vendor, *.generated.ts)"
            className="flex-1 rounded-lg px-3 py-2"
            style={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            onClick={addPattern}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 cursor-pointer text-sm font-medium"
            style={{
              background: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)40',
            }}
          >
            <Icon path={mdiPlus} size={0.65} />
            Hinzufügen
          </button>
        </div>
      </section>

      <button
        onClick={handleSave}
        className="flex items-center gap-2 rounded-lg px-5 py-2.5 cursor-pointer text-sm font-medium"
        style={{
          background: 'var(--color-accent)',
          color: 'white',
          border: 'none',
        }}
      >
        <Icon path={mdiContentSave} size={0.7} />
        {saved ? '✓ Gespeichert' : 'Einstellungen speichern'}
      </button>
    </div>
  );
}
