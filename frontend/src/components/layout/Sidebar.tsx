import { NavLink, useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  Map,
  Flame,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  Telescope,
} from 'lucide-react';
import { useRepoStore } from '../../store/useRepoStore';
import { clsx } from 'clsx';
import { wsClient } from '../../services/websocket';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { to: '/', icon: FolderGit2, label: 'Repositories', end: true },
  { to: '/treemap', icon: Map, label: 'Treemap', end: false },
  { to: '/hotspots', icon: Flame, label: 'Hotspots', end: false },
  { to: '/settings', icon: Settings, label: 'Settings', end: false },
];

export function Sidebar() {
  const { repositories, activeRepoId, setActiveRepoId, sidebarCollapsed, toggleSidebar } =
    useRepoStore();
  const navigate = useNavigate();
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const check = () => setWsConnected(wsClient.isConnected);
    const interval = setInterval(check, 1500);
    return () => clearInterval(interval);
  }, []);

  const repoList = Array.isArray(repositories) ? repositories : [];
  const activeRepo = repoList.find((r) => r.id === activeRepoId);

  return (
    <aside
      className="flex flex-col h-full transition-all duration-200 ease-in-out shrink-0"
      style={{
        width: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        backgroundColor: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          }}
        >
          <Telescope size={20} color="white" />
        </div>
        {!sidebarCollapsed && (
          <div>
            <p style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 15 }}>
              Auspex
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Code Analysis</p>
          </div>
        )}
      </div>

      {/* Active Repo Quick Switcher */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <p
            style={{
              color: 'var(--color-text-muted)',
              fontSize: 11,
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Active Repository
          </p>
          <select
            value={activeRepoId ?? ''}
            onChange={(e) => {
              setActiveRepoId(e.target.value || null);
              if (e.target.value) navigate(`/repo/${e.target.value}/treemap`);
            }}
            className="w-full rounded-md px-2 py-1.5 text-sm cursor-pointer"
            style={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          >
            <option value="">— Select repository —</option>
            {repoList.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => {
          // For repo-specific routes, use active repo ID
          const resolvedTo =
            (to === '/treemap' || to === '/hotspots') && activeRepoId
              ? `/repo/${activeRepoId}${to}`
              : to;

          return (
            <NavLink
              key={to}
              to={resolvedTo}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150',
                  'group select-none',
                  isActive ? 'active-nav' : 'hover-nav'
                )
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                textDecoration: 'none',
              })}
            >
              <Icon size={18} className="shrink-0" />
              {!sidebarCollapsed && (
                <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer: WS status + Collapse toggle */}
      <div
        className="px-3 py-3 flex flex-col gap-2"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        {/* WebSocket status */}
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-1">
            <Activity size={13} color={wsConnected ? 'var(--color-success)' : 'var(--color-danger)'} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {wsConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        )}

        {/* Collapse button */}
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center rounded-lg p-2 transition-colors duration-150 cursor-pointer"
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            width: '100%',
          }}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!sidebarCollapsed && (
            <span style={{ marginLeft: 8, fontSize: 13 }}>Collapse</span>
          )}
        </button>
      </div>
    </aside>
  );
}
