import type { JiraIssueInfo } from '../../analyzer/types';
import type { JiraConfig } from './jiraConfigManager';
import type { AuspexStorage } from '../../storage/cache';

export interface JiraTestResult {
  success: boolean;
  message: string;
  user?: string;
}

export class JiraClient {
  private readonly memoryCache = new Map<string, JiraIssueInfo>();

  constructor(
    private readonly config: JiraConfig,
    private readonly token: string,
    private readonly storage?: AuspexStorage,
    private readonly isBugTypeCheck?: (issueTypeName: string, bugTypes?: string[]) => boolean
  ) {
    if (this.storage) {
      const persisted = this.storage.loadJiraCache();
      for (const [key, val] of Object.entries(persisted)) {
        this.memoryCache.set(key, val);
      }
    }
  }

  private getAuthHeader(): string {
    if (this.config.email) {
      const creds = `${this.config.email}:${this.token}`;
      return `Basic ${Buffer.from(creds).toString('base64')}`;
    }
    return `Bearer ${this.token}`;
  }

  /**
   * Tests the connection to Jira using the /myself endpoint.
   */
  public async testConnection(): Promise<JiraTestResult> {
    if (!this.config.host) {
      return { success: false, message: 'Jira host is not configured.' };
    }
    if (!this.token) {
      return { success: false, message: 'Jira API token is not set.' };
    }

    try {
      const endpoint = `${this.config.host}/rest/api/3/myself`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const displayName = data.displayName || data.name || data.emailAddress || 'Authenticated User';
        return {
          success: true,
          message: `Connected successfully as ${displayName}`,
          user: displayName,
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message: `Authentication failed (HTTP ${response.status}). Check your email and API token.`,
        };
      }

      return {
        success: false,
        message: `Jira returned HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Connection failed: ${err?.message || String(err)}`,
      };
    }
  }

  /**
   * Fetches metadata for a single Jira issue. Cached in-memory and on disk.
   */
  public async fetchIssue(key: string): Promise<JiraIssueInfo | null> {
    const normalizedKey = key.toUpperCase().trim();
    if (this.memoryCache.has(normalizedKey)) {
      return this.memoryCache.get(normalizedKey) || null;
    }

    if (!this.config.host || !this.token) {
      return null;
    }

    try {
      const endpoint = `${this.config.host}/rest/api/3/issue/${encodeURIComponent(normalizedKey)}?fields=issuetype,summary,status`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 404) {
        // Ticket not found: do not query again in this session
        return null;
      }

      if (!response.ok) {
        console.warn(`[Auspex] Jira request for ${normalizedKey} returned HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as any;
      const issueType = data.fields?.issuetype?.name || 'Unknown';
      const summary = data.fields?.summary || '';
      const status = data.fields?.status?.name || '';

      const isBug = this.isBugTypeCheck
        ? this.isBugTypeCheck(issueType, this.config.bugTypes)
        : issueType.toLowerCase().includes('bug') || issueType.toLowerCase().includes('defect');

      const issueInfo: JiraIssueInfo = {
        key: normalizedKey,
        issueType,
        summary,
        status,
        isBug,
        url: `${this.config.host}/browse/${normalizedKey}`,
      };

      this.memoryCache.set(normalizedKey, issueInfo);
      this.persistCache();

      return issueInfo;
    } catch (err) {
      console.warn(`[Auspex] Failed to fetch Jira issue ${normalizedKey}:`, err);
      return null;
    }
  }

  /**
   * Fetches a batch of Jira issues with concurrency limit.
   */
  public async batchFetchIssues(keys: string[], concurrency = 5): Promise<Map<string, JiraIssueInfo>> {
    const results = new Map<string, JiraIssueInfo>();
    const uniqueKeys = Array.from(new Set(keys.map((k) => k.toUpperCase().trim()))).filter(Boolean);

    // Collect already cached
    const pendingKeys: string[] = [];
    for (const key of uniqueKeys) {
      if (this.memoryCache.has(key)) {
        const cached = this.memoryCache.get(key);
        if (cached) results.set(key, cached);
      } else {
        pendingKeys.push(key);
      }
    }

    if (pendingKeys.length === 0) {
      return results;
    }

    // Process pending in chunks
    for (let i = 0; i < pendingKeys.length; i += concurrency) {
      const chunk = pendingKeys.slice(i, i + concurrency);
      const promises = chunk.map(async (key) => {
        const issue = await this.fetchIssue(key);
        if (issue) {
          results.set(key, issue);
        }
      });
      await Promise.all(promises);
    }

    return results;
  }

  private persistCache(): void {
    if (!this.storage) return;
    const obj: Record<string, JiraIssueInfo> = {};
    for (const [key, val] of this.memoryCache.entries()) {
      obj[key] = val;
    }
    this.storage.saveJiraCache(obj);
  }
}
