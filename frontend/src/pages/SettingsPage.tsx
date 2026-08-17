import { useState } from 'react';
import { Settings, Save, Plus, Trash2 } from 'lucide-react';

const DEFAULT_IGNORES = ['node_modules', 'dist', 'build', '.git', 'bin', 'obj', '__pycache__', '.next', 'coverage'];

export function SettingsPage() {
  const [ignoreList, setIgnoreList] = useState<string[]>(DEFAULT_IGNORES);
  const [newPattern, setNewPattern] = useState('');
  const [saved, setSaved] = useState(false);

  const addPattern = () => {
    if (newPattern && !ignoreList.includes(newPattern)) {
      setIgnoreList([...ignoreList, newPattern]);
      setNewPattern('');
    }
  };

  const removePattern = (p: string) => setIgnoreList(ignoreList.filter((x) => x !== p));

  const handleSave = () => {
    // TODO: persist via API
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Settings size={22} color="var(--color-accent)" />
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 22, fontWeight: 700 }}>Settings</h1>
      </div>

      {/* Ignore patterns */}
      <section
        className="rounded-xl p-5 mb-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <h2 style={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          Global Ignore Patterns
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 16 }}>
          Folders and files matching these patterns will be excluded from all scans.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {ignoreList.map((p) => (
            <span
              key={p}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm"
              style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {p}
              <button
                onClick={() => removePattern(p)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
              >
                <Trash2 size={12} />
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
            placeholder="Add pattern (e.g. vendor)"
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
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 cursor-pointer"
            style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)40', fontSize: 14 }}
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </section>

      <button
        onClick={handleSave}
        className="flex items-center gap-2 rounded-lg px-5 py-2.5 cursor-pointer"
        style={{ background: 'var(--color-accent)', color: 'white', border: 'none', fontSize: 14, fontWeight: 500 }}
      >
        <Save size={15} />
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  );
}
