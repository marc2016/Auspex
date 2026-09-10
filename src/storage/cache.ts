import fs from 'fs';
import path from 'path';
import type { AnalysisSnapshot, ParsedFileInfo, JiraIssueInfo } from '../analyzer/types';

export class AuspexStorage {
  private baseDir: string;
  private snapshotFile: string;
  private fileCacheFile: string;
  private jiraCacheFile: string;

  constructor(storageDir: string) {
    this.baseDir = storageDir;
    this.snapshotFile = path.join(this.baseDir, 'snapshot.json');
    this.fileCacheFile = path.join(this.baseDir, 'file_cache.json');
    this.jiraCacheFile = path.join(this.baseDir, 'jira_cache.json');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.baseDir, { recursive: true });
      } catch {
        /* ignore */
      }
    }
  }

  loadSnapshot(): AnalysisSnapshot | null {
    try {
      if (fs.existsSync(this.snapshotFile)) {
        const data = fs.readFileSync(this.snapshotFile, 'utf-8');
        return JSON.parse(data) as AnalysisSnapshot;
      }
    } catch (err) {
      console.warn('[Auspex] Failed to read cached snapshot:', err);
    }
    return null;
  }

  saveSnapshot(snapshot: AnalysisSnapshot): void {
    try {
      this.ensureDir();
      fs.writeFileSync(this.snapshotFile, JSON.stringify(snapshot), 'utf-8');
    } catch (err) {
      console.warn('[Auspex] Failed to save snapshot:', err);
    }
  }

  loadFileCache(): Record<string, ParsedFileInfo> {
    try {
      if (fs.existsSync(this.fileCacheFile)) {
        const data = fs.readFileSync(this.fileCacheFile, 'utf-8');
        return JSON.parse(data) as Record<string, ParsedFileInfo>;
      }
    } catch {
      /* ignore */
    }
    return {};
  }

  saveFileCache(cache: Record<string, ParsedFileInfo>): void {
    try {
      this.ensureDir();
      fs.writeFileSync(this.fileCacheFile, JSON.stringify(cache), 'utf-8');
    } catch (err) {
      console.warn('[Auspex] Failed to save file cache:', err);
    }
  }

  loadJiraCache(): Record<string, JiraIssueInfo> {
    try {
      if (fs.existsSync(this.jiraCacheFile)) {
        const data = fs.readFileSync(this.jiraCacheFile, 'utf-8');
        return JSON.parse(data) as Record<string, JiraIssueInfo>;
      }
    } catch {
      /* ignore */
    }
    return {};
  }

  saveJiraCache(cache: Record<string, JiraIssueInfo>): void {
    try {
      this.ensureDir();
      fs.writeFileSync(this.jiraCacheFile, JSON.stringify(cache), 'utf-8');
    } catch (err) {
      console.warn('[Auspex] Failed to save jira cache:', err);
    }
  }
}
