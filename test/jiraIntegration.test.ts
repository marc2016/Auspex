import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('vscode', () => {
  return {
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defVal: any) => defVal),
      })),
    },
  };
});

import { JiraConfigManager, DEFAULT_BUG_TYPES } from '../src/integrations/jira/jiraConfigManager';
import { JiraClient } from '../src/integrations/jira/jiraClient';
import { isBugfixCommit } from '../webview/src/components/TreemapDetailsPanel';

describe('JiraConfigManager', () => {
  let mockSecrets: any;
  let secretStore: Map<string, string>;

  beforeEach(() => {
    secretStore = new Map<string, string>();
    mockSecrets = {
      get: vi.fn(async (key: string) => secretStore.get(key)),
      store: vi.fn(async (key: string, val: string) => {
        secretStore.set(key, val);
      }),
      delete: vi.fn(async (key: string) => {
        secretStore.delete(key);
      }),
    };
  });

  it('stores, retrieves and clears API token securely', async () => {
    const manager = new JiraConfigManager(mockSecrets);

    await manager.setApiToken('secret-test-token-123');
    const token = await manager.getApiToken();
    expect(token).toBe('secret-test-token-123');

    await manager.clearApiToken();
    const cleared = await manager.getApiToken();
    expect(cleared).toBeUndefined();
  });

  it('identifies bug types correctly based on default and custom lists', () => {
    const manager = new JiraConfigManager(mockSecrets);

    expect(manager.isBugType('Bug')).toBe(true);
    expect(manager.isBugType('Defect')).toBe(true);
    expect(manager.isBugType('Critical Incident')).toBe(true);
    expect(manager.isBugType('Softwarefehler')).toBe(true); // contains "fehler"
    expect(manager.isBugType('Story')).toBe(false);
    expect(manager.isBugType('Task')).toBe(false);
    expect(manager.isBugType('Improvement')).toBe(false);

    // Custom list
    expect(manager.isBugType('Production Glitch', ['Glitch'])).toBe(true);
    expect(manager.isBugType('Bug', ['Glitch'])).toBe(false);
  });
});

describe('JiraClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('generates Basic Auth header when email is provided', async () => {
    let capturedHeader = '';
    globalThis.fetch = vi.fn(async (url: any, options: any) => {
      capturedHeader = options.headers.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          displayName: 'Test User',
        }),
      } as any;
    });

    const client = new JiraClient(
      {
        enabled: true,
        host: 'https://test.atlassian.net',
        email: 'user@example.com',
        bugTypes: DEFAULT_BUG_TYPES,
        projectKeys: [],
      },
      'my-api-token'
    );

    const testRes = await client.testConnection();
    expect(testRes.success).toBe(true);
    expect(testRes.user).toBe('Test User');

    const expectedB64 = Buffer.from('user@example.com:my-api-token').toString('base64');
    expect(capturedHeader).toBe(`Basic ${expectedB64}`);
  });

  it('generates Bearer header when email is empty (Data Center PAT)', async () => {
    let capturedHeader = '';
    globalThis.fetch = vi.fn(async (url: any, options: any) => {
      capturedHeader = options.headers.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: 'pat-user',
        }),
      } as any;
    });

    const client = new JiraClient(
      {
        enabled: true,
        host: 'https://jira.datacenter.internal',
        email: '',
        bugTypes: DEFAULT_BUG_TYPES,
        projectKeys: [],
      },
      'datacenter-pat-token'
    );

    const testRes = await client.testConnection();
    expect(testRes.success).toBe(true);
    expect(capturedHeader).toBe('Bearer datacenter-pat-token');
  });

  it('fetches issue details and caches result in memory', async () => {
    const fetchMock = vi.fn(async (url: any) => {
      if (url.includes('PROJ-101')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            fields: {
              issuetype: { name: 'Bug' },
              summary: 'Null pointer in auth handler',
              status: { name: 'Closed' },
            },
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });
    globalThis.fetch = fetchMock;

    const client = new JiraClient(
      {
        enabled: true,
        host: 'https://test.atlassian.net',
        email: 'dev@test.com',
        bugTypes: DEFAULT_BUG_TYPES,
        projectKeys: [],
      },
      'token',
      undefined,
      (type) => type === 'Bug'
    );

    const issue = await client.fetchIssue('PROJ-101');
    expect(issue).toBeDefined();
    expect(issue?.key).toBe('PROJ-101');
    expect(issue?.issueType).toBe('Bug');
    expect(issue?.isBug).toBe(true);
    expect(issue?.summary).toBe('Null pointer in auth handler');
    expect(issue?.status).toBe('Closed');
    expect(issue?.url).toBe('https://test.atlassian.net/browse/PROJ-101');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call should hit in-memory cache without fetch
    const cached = await client.fetchIssue('PROJ-101');
    expect(cached).toEqual(issue);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles 404 not found gracefully without throwing', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }) as any);

    const client = new JiraClient(
      {
        enabled: true,
        host: 'https://test.atlassian.net',
        email: 'dev@test.com',
        bugTypes: DEFAULT_BUG_TYPES,
        projectKeys: [],
      },
      'token'
    );

    const res = await client.fetchIssue('NONEXISTENT-999');
    expect(res).toBeNull();
  });
});

describe('isBugfixCommit with Jira issues', () => {
  it('identifies commit as bugfix when Jira issue has isBug = true', () => {
    const commit = {
      message: 'Implement user login workflow',
      jiraIssues: [
        {
          key: 'PROJ-123',
          issueType: 'Bug',
          isBug: true,
        },
      ],
    };

    expect(isBugfixCommit(commit)).toBe(true);
  });

  it('does not classify commit as bugfix when Jira issues are only Story/Task and message is non-fix', () => {
    const commit = {
      message: 'Add new feature for export',
      jiraIssues: [
        {
          key: 'PROJ-456',
          issueType: 'Story',
          isBug: false,
        },
      ],
    };

    expect(isBugfixCommit(commit)).toBe(false);
  });

  it('respects explicit isFix flag when present', () => {
    expect(isBugfixCommit({ isFix: true, message: 'something' })).toBe(true);
    expect(isBugfixCommit({ isFix: false, message: 'fix: something' })).toBe(false);
  });
});
