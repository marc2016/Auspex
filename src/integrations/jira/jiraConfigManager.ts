import * as vscode from 'vscode';

export const JIRA_SECRET_KEY = 'auspex.jira.apiToken';

export const DEFAULT_BUG_TYPES = ['Bug', 'Defect', 'Fehler', 'Incident', 'Problem'];

export interface JiraConfig {
  enabled: boolean;
  host: string;
  email: string;
  bugTypes: string[];
  projectKeys: string[];
}

export class JiraConfigManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Retrieves the current Jira configuration from VS Code workspace settings.
   */
  public getConfig(): JiraConfig {
    const config = vscode.workspace.getConfiguration('auspex.jira');
    const enabled = config.get<boolean>('enabled', false);
    let host = (config.get<string>('host', '') || '').trim();
    if (host.endsWith('/')) {
      host = host.slice(0, -1);
    }
    const email = (config.get<string>('email', '') || '').trim();
    const bugTypes = config.get<string[]>('bugTypes', DEFAULT_BUG_TYPES);
    const projectKeys = config.get<string[]>('projectKeys', []);

    return {
      enabled,
      host,
      email,
      bugTypes: bugTypes.length > 0 ? bugTypes : DEFAULT_BUG_TYPES,
      projectKeys,
    };
  }

  /**
   * Retrieves the API token securely from VS Code SecretStorage (OS Keychain).
   */
  public async getApiToken(): Promise<string | undefined> {
    return await this.secrets.get(JIRA_SECRET_KEY);
  }

  /**
   * Stores the API token securely in VS Code SecretStorage (OS Keychain).
   */
  public async setApiToken(token: string): Promise<void> {
    await this.secrets.store(JIRA_SECRET_KEY, token.trim());
  }

  /**
   * Removes the API token from VS Code SecretStorage.
   */
  public async clearApiToken(): Promise<void> {
    await this.secrets.delete(JIRA_SECRET_KEY);
  }

  /**
   * Checks whether Jira integration is enabled and has valid host + token.
   */
  public async isConfigured(): Promise<boolean> {
    const config = this.getConfig();
    if (!config.enabled || !config.host) {
      return false;
    }
    const token = await this.getApiToken();
    return Boolean(token && token.length > 0);
  }

  /**
   * Checks whether an issue type name is considered a bug based on configured bugTypes.
   */
  public isBugType(issueTypeName: string, bugTypes?: string[]): boolean {
    if (!issueTypeName) return false;
    const types = (bugTypes && bugTypes.length > 0) ? bugTypes : DEFAULT_BUG_TYPES;
    const lowerName = issueTypeName.toLowerCase().trim();

    return types.some((bt) => {
      const lowerBt = bt.toLowerCase().trim();
      return lowerName === lowerBt || lowerName.includes(lowerBt);
    });
  }
}
