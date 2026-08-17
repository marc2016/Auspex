import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');

// Ensure data directory exists (important for Docker volume mounts)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'auspex.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- Repositories: core metadata for each registered repo
    CREATE TABLE IF NOT EXISTS repositories (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      url_or_path TEXT NOT NULL,
      is_remote   INTEGER NOT NULL DEFAULT 0,
      default_branch TEXT NOT NULL DEFAULT 'main',
      shallow_clone  INTEGER NOT NULL DEFAULT 0,
      ignore_patterns TEXT NOT NULL DEFAULT '["node_modules","dist",".git","bin","obj"]',
      auth_token_id   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Auth tokens: PATs for private remote repos
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id         TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      provider   TEXT NOT NULL DEFAULT 'github',
      token      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Scan snapshots: persisted analysis results
    -- tree_data is stored as JSON (hybrid relational+document approach)
    CREATE TABLE IF NOT EXISTS scan_snapshots (
      id              TEXT PRIMARY KEY,
      repo_id         TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      head_commit_sha TEXT NOT NULL,
      is_incremental  INTEGER NOT NULL DEFAULT 0,
      total_files     INTEGER NOT NULL DEFAULT 0,
      total_loc       INTEGER NOT NULL DEFAULT 0,
      tree_data       TEXT NOT NULL,  -- JSON blob of the full TreeNode hierarchy
      duration_ms     INTEGER NOT NULL DEFAULT 0,
      scanned_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Per-file cache for incremental scanning
    -- Stores AST-parsed data and metrics per file to avoid re-parsing unchanged files
    CREATE TABLE IF NOT EXISTS file_cache (
      repo_id      TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      file_path    TEXT NOT NULL,  -- relative path from repo root
      file_hash    TEXT NOT NULL,  -- SHA256 of file content
      ast_data     TEXT NOT NULL,  -- JSON: methods[], namespace, loc
      loc          INTEGER NOT NULL DEFAULT 0,
      commit_count INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (repo_id, file_path)
    );

    -- Indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_snapshots_repo_id ON scan_snapshots(repo_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_scanned_at ON scan_snapshots(scanned_at);
    CREATE INDEX IF NOT EXISTS idx_file_cache_repo_id ON file_cache(repo_id);
  `);
}

/** Return the latest snapshot for a given repository, or null if none exists */
export function getLatestSnapshot(repoId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM scan_snapshots
       WHERE repo_id = ?
       ORDER BY scanned_at DESC
       LIMIT 1`
    )
    .get(repoId) as
    | {
        id: string;
        repo_id: string;
        head_commit_sha: string;
        is_incremental: number;
        total_files: number;
        total_loc: number;
        tree_data: string;
        duration_ms: number;
        scanned_at: string;
      }
    | undefined;
}
