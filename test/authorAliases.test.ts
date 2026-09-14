import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const mockUpdate = vi.fn();
const mockGetConfig = vi.fn(() => ({
  update: mockUpdate,
  get: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => mockGetConfig(),
  },
  ConfigurationTarget: {
    Workspace: 2,
  },
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  env: {
    language: 'de-DE',
  },
}));

import { saveAuthorAliases } from '../src/utils/authorAliases';

describe('saveAuthorAliases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves author aliases to VS Code workspace settings', async () => {
    const aliases = {
      'Marc Lammers': ['marc2016', 'Marc'],
      'Alice Dev': ['adeveloper'],
    };

    const rescanMock = vi.fn().mockResolvedValue(undefined);

    await saveAuthorAliases('/mock/workspace', 'settings', aliases, rescanMock);

    expect(mockUpdate).toHaveBeenCalledWith(
      'authorAliases',
      aliases,
      2 // ConfigurationTarget.Workspace
    );
    expect(rescanMock).toHaveBeenCalledTimes(1);
  });

  it('saves author aliases to .mailmap file', async () => {
    const tempDir = fs.mkdtempSync(path.join('/tmp', 'auspex-mailmap-test-'));
    try {
      const aliases = {
        'Marc Lammers': ['marc2016', 'marc@personal.de', 'Marc <marc@work.de>'],
      };

      const rescanMock = vi.fn().mockResolvedValue(undefined);

      await saveAuthorAliases(tempDir, 'mailmap', aliases, rescanMock);

      const mailmapFile = path.join(tempDir, '.mailmap');
      expect(fs.existsSync(mailmapFile)).toBe(true);

      const content = fs.readFileSync(mailmapFile, 'utf-8');
      expect(content).toContain('Marc Lammers <marc2016> marc2016 <marc2016>');
      expect(content).toContain('Marc Lammers <marc@personal.de>');
      expect(content).toContain('Marc Lammers Marc <marc@work.de>');
      expect(rescanMock).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
