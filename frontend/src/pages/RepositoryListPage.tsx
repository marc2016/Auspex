import { useEffect, useState } from 'react';
import { Icon } from '../components/common/Icon';
import {
  mdiPlus,
  mdiSourceRepository,
  mdiRefresh,
  mdiTrashCanOutline,
  mdiCheckCircle,
  mdiAlertCircleOutline,
  mdiLoading,
  mdiArrowRight,
} from '@mdi/js';
import { useRepoStore } from '../store/useRepoStore';
import { wsClient } from '../services/websocket';
import type {
  WsScanProgressPayload,
  WsScanCompletePayload,
  WsScanErrorPayload,
} from '@auspex/shared';
import { useNavigate } from 'react-router-dom';

interface AddRepoForm {
  name: string;
  urlOrPath: string;
  isRemote: boolean;
  shallowClone: boolean;
  pat: string;
}

const INITIAL_FORM: AddRepoForm = {
  name: '',
  urlOrPath: '',
  isRemote: false,
  shallowClone: false,
  pat: '',
};

export function RepositoryListPage() {
  const {
    repositories,
    fetchRepositories,
    setScanActive,
    activeScans,
    scanProgress,
    setScanProgress,
    scanErrors,
    setScanError,
    setActiveRepoId,
  } = useRepoStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddRepoForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRepositories();
    wsClient.connect();

    const offProgress = wsClient.on('scan:progress', (payload: WsScanProgressPayload) => {
      setScanActive(payload.repositoryId, true);
      setScanProgress(payload.repositoryId, payload);
      setScanError(payload.repositoryId, null);
    });

    const offComplete = wsClient.on('scan:complete', (payload: WsScanCompletePayload) => {
      setScanActive(payload.repositoryId, false);
      setScanProgress(payload.repositoryId, null);
      setScanError(payload.repositoryId, null);
      fetchRepositories();
    });

    const offError = wsClient.on('scan:error', (payload: WsScanErrorPayload) => {
      setScanActive(payload.repositoryId, false);
      setScanProgress(payload.repositoryId, null);
      setScanError(payload.repositoryId, payload.message);
    });

    return () => {
      offProgress();
      offComplete();
      offError();
    };
  }, [fetchRepositories, setScanActive, setScanProgress, setScanError]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        urlOrPath: form.urlOrPath,
        isRemote: form.isRemote,
        shallowClone: form.shallowClone,
      };
      const res = await fetch('/api/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowForm(false);
        setForm(INITIAL_FORM);
        fetchRepositories();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/repositories/${id}`, { method: 'DELETE' });
    fetchRepositories();
  };

  const handleScan = async (id: string) => {
    setScanActive(id, true);
    setScanError(id, null);
    try {
      const res = await fetch(`/api/repositories/${id}/scan`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setScanActive(id, false);
        setScanError(id, data.error || 'Fehler beim Starten des Scans.');
      }
    } catch {
      setScanActive(id, false);
      setScanError(id, 'Netzwerkfehler beim Starten des Scans.');
    }
  };

  const handleOpen = (id: string) => {
    setActiveRepoId(id);
    navigate(`/repo/${id}/treemap`);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ color: 'var(--color-text-primary)', fontSize: 22, fontWeight: 700 }}>
            Repositories
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
            {repositories.length}{' '}
            {repositories.length === 1 ? 'Repository' : 'Repositories'} registriert
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 cursor-pointer transition-colors duration-150"
          style={{
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <Icon path={mdiPlus} size={0.75} />
          Repository hinzufügen
        </button>
      </div>

      {/* Add repo form */}
      {showForm && (
        <div
          className="rounded-xl p-5 mb-6"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <h2
            style={{
              color: 'var(--color-text-primary)',
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Neues Repository anbinden
          </h2>
          <div className="flex flex-col gap-3">
            {[
              { label: 'Name', key: 'name', placeholder: 'Mein Projekt' },
              {
                label: 'Pfad oder Git-URL',
                key: 'urlOrPath',
                placeholder: '/pfad/zum/repo oder https://github.com/...',
              },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  {label}
                </label>
                <input
                  type="text"
                  value={form[key as keyof AddRepoForm] as string}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full rounded-lg px-3 py-2"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>
            ))}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isRemote}
                  onChange={(e) => setForm({ ...form, isRemote: e.target.checked })}
                />
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                  Remote-Repository (Git Clone)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shallowClone}
                  onChange={(e) => setForm({ ...form, shallowClone: e.target.checked })}
                />
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                  Shallow Clone (schneller)
                </span>
              </label>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={handleAdd}
                disabled={saving || !form.name || !form.urlOrPath}
                className="rounded-lg px-4 py-2 cursor-pointer"
                style={{
                  background: 'var(--color-accent)',
                  color: 'white',
                  border: 'none',
                  fontSize: 14,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setForm(INITIAL_FORM);
                }}
                className="rounded-lg px-4 py-2 cursor-pointer"
                style={{
                  background: 'var(--color-surface-elevated)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  fontSize: 14,
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repository list */}
      <div className="flex flex-col gap-3">
        {repositories.length === 0 && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}
          >
            <Icon
              path={mdiSourceRepository}
              size={1.6}
              color="var(--color-text-muted)"
              style={{ margin: '0 auto 12px' }}
            />
            <p style={{ color: 'var(--color-text-muted)' }}>
              Noch keine Repositories registriert. Füge eines hinzu, um zu starten.
            </p>
          </div>
        )}
        {repositories.map((repo) => {
          const isScanning = activeScans.has(repo.id);
          const progress = scanProgress[repo.id];
          const error = scanErrors[repo.id];

          return (
            <div
              key={repo.id}
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: 40, height: 40, background: 'var(--color-accent-subtle)' }}
                >
                  <Icon path={mdiSourceRepository} size={0.9} color="var(--color-accent)" />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{repo.name}</p>
                  <p
                    style={{
                      color: 'var(--color-text-muted)',
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {repo.urlOrPath}
                  </p>
                  {repo.lastScan && !isScanning && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Icon path={mdiCheckCircle} size={0.55} color="var(--color-success)" />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                        {repo.lastScan.totalFiles} Dateien ·{' '}
                        {repo.lastScan.totalLoc.toLocaleString()} LOC · Letzter Scan:{' '}
                        {new Date(repo.lastScan.scannedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {repo.lastScan && !isScanning && (
                    <button
                      onClick={() => handleOpen(repo.id)}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 cursor-pointer text-sm font-medium"
                      style={{
                        background: 'var(--color-accent-subtle)',
                        color: 'var(--color-accent)',
                        border: '1px solid var(--color-accent)40',
                      }}
                    >
                      Treemap
                      <Icon path={mdiArrowRight} size={0.65} />
                    </button>
                  )}
                  <button
                    onClick={() => handleScan(repo.id)}
                    disabled={isScanning}
                    className="rounded-lg p-2 cursor-pointer transition-colors"
                    style={{
                      background: 'var(--color-surface-elevated)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                    }}
                    title={isScanning ? 'Scan läuft…' : 'Jetzt scannen'}
                  >
                    {isScanning ? (
                      <Icon
                        path={mdiLoading}
                        size={0.7}
                        color="var(--color-accent)"
                        className="animate-spin"
                      />
                    ) : (
                      <Icon path={mdiRefresh} size={0.7} />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(repo.id)}
                    className="rounded-lg p-2 cursor-pointer transition-colors"
                    style={{
                      background: 'var(--color-surface-elevated)',
                      color: 'var(--color-danger)',
                      border: '1px solid var(--color-border)',
                    }}
                    title="Repository entfernen"
                  >
                    <Icon path={mdiTrashCanOutline} size={0.7} />
                  </button>
                </div>
              </div>

              {/* Live Scan Progress */}
              {isScanning && progress && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'var(--color-accent-subtle)',
                    border: '1px solid var(--color-accent)40',
                  }}
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <span style={{ color: 'var(--color-accent)', fontSize: 12, fontWeight: 500 }}>
                      {progress.message}
                    </span>
                    <span style={{ color: 'var(--color-accent)', fontSize: 12, fontWeight: 600 }}>
                      {progress.percent}%
                    </span>
                  </div>
                  <div
                    className="w-full rounded-full overflow-hidden"
                    style={{ height: 5, background: 'rgba(99, 102, 241, 0.2)' }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${progress.percent}%`,
                        background: 'var(--color-accent)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Error display */}
              {error && (
                <div
                  className="flex items-center gap-2 rounded-lg p-3"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  <Icon path={mdiAlertCircleOutline} size={0.7} color="var(--color-danger)" />
                  <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>
                    Scan-Fehler: {error}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
