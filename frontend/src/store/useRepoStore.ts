import { create } from 'zustand';
import type { RepositoryConfig, AnalysisSnapshot, WsScanProgressPayload } from '@auspex/shared';

export interface RepoListItem extends Omit<RepositoryConfig, 'ignorePatterns' | 'authTokenId'> {
  lastScan: {
    headCommitSha: string;
    scannedAt: string;
    totalFiles: number;
    totalLoc: number;
  } | null;
}

interface ScanProgress {
  stage: string;
  message: string;
  percent: number;
  filesProcessed?: number;
  totalFiles?: number;
}

export type Theme = 'dark' | 'light';

interface RepoStore {
  // Repository list
  repositories: RepoListItem[];
  setRepositories: (repos: RepoListItem[]) => void;
  fetchRepositories: () => Promise<void>;

  // Active repository
  activeRepoId: string | null;
  setActiveRepoId: (id: string | null) => void;

  // Treemap data (cached per repo)
  snapshots: Record<string, AnalysisSnapshot>;
  setSnapshot: (repoId: string, snapshot: AnalysisSnapshot) => void;
  fetchSnapshot: (repoId: string) => Promise<void>;

  // Scan progress & errors
  scanProgress: Record<string, ScanProgress>;
  setScanProgress: (repoId: string, progress: WsScanProgressPayload | null) => void;
  scanErrors: Record<string, string>;
  setScanError: (repoId: string, error: string | null) => void;
  activeScans: Set<string>;
  setScanActive: (repoId: string, active: boolean) => void;

  // UI state
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  theme: Theme;
  toggleTheme: () => void;
}

const API_BASE = '/api';

const initialTheme = (typeof window !== 'undefined'
  ? (localStorage.getItem('auspex_theme') as Theme) || 'dark'
  : 'dark') as Theme;

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme);
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  repositories: [],
  setRepositories: (repos) => set({ repositories: repos }),

  fetchRepositories: async () => {
    try {
      const res = await fetch(`${API_BASE}/repositories`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          set({ repositories: data });
        }
      }
    } catch (err) {
      console.error('Failed to fetch repositories:', err);
    }
  },

  activeRepoId: null,
  setActiveRepoId: (id) => set({ activeRepoId: id }),

  snapshots: {},
  setSnapshot: (repoId, snapshot) =>
    set((s) => ({ snapshots: { ...s.snapshots, [repoId]: snapshot } })),

  fetchSnapshot: async (repoId) => {
    try {
      const res = await fetch(`${API_BASE}/repositories/${repoId}/treemap`);
      if (res.ok) {
        const snapshot = (await res.json()) as AnalysisSnapshot;
        get().setSnapshot(repoId, snapshot);
      }
    } catch (err) {
      console.error(`Failed to fetch snapshot for ${repoId}:`, err);
    }
  },

  scanProgress: {},
  setScanProgress: (repoId, progress) =>
    set((s) => ({
      scanProgress: progress
        ? { ...s.scanProgress, [repoId]: progress }
        : Object.fromEntries(Object.entries(s.scanProgress).filter(([k]) => k !== repoId)),
    })),

  scanErrors: {},
  setScanError: (repoId, error) =>
    set((s) => ({
      scanErrors: error
        ? { ...s.scanErrors, [repoId]: error }
        : Object.fromEntries(Object.entries(s.scanErrors).filter(([k]) => k !== repoId)),
    })),

  activeScans: new Set(),
  setScanActive: (repoId, active) =>
    set((s) => {
      const next = new Set(s.activeScans);
      if (active) next.add(repoId);
      else next.delete(repoId);
      return { activeScans: next };
    }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  theme: initialTheme,
  toggleTheme: () => {
    const nextTheme: Theme = get().theme === 'dark' ? 'light' : 'dark';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auspex_theme', nextTheme);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }
    set({ theme: nextTheme });
  },
}));
