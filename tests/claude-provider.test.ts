import type { ProviderConfig } from '@lib/types';

import { createClaudeProvider } from '@lib/providers/claude';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockCreds = {
  claudeAiOauth: {
    accessToken: 'sk-test',
    refreshToken: 'ref-test',
    expiresAt: Date.now() + 3600000,
    scopes: ['user:inference'],
    subscriptionType: 'max',
    rateLimitTier: 'default',
  },
};

const mockAccount = {
  emailAddress: 'test@example.com',
  organizationName: 'Test Org',
  displayName: 'Test User',
};

describe('createClaudeProvider (file backend)', () => {
  let tempDir: string;
  let config: ProviderConfig;
  let claudeJsonPath: string;
  let credentialsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-claude-'));
    config = { platform: 'linux', homedir: tempDir, env: {} };
    claudeJsonPath = join(tempDir, '.claude.json');
    credentialsPath = join(tempDir, '.claude', '.credentials.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('snapshot returns credentials and identity', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await Bun.write(credentialsPath, JSON.stringify(mockCreds));
    await Bun.write(
      claudeJsonPath,
      JSON.stringify({ oauthAccount: mockAccount, theme: 'dark' }),
    );

    const provider = createClaudeProvider(config);
    const snap = await provider.snapshot();

    expect(snap).not.toBeNull();
    expect(snap!.credentials).toEqual(mockCreds);
    expect((snap!.identity as typeof mockAccount).emailAddress).toBe(
      'test@example.com',
    );
  });

  it('snapshot returns null when no credentials exist', async () => {
    const provider = createClaudeProvider(config);
    const snap = await provider.snapshot();
    expect(snap).toBeNull();
  });

  it('restore writes credentials and identity', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await Bun.write(claudeJsonPath, JSON.stringify({ theme: 'dark' }));

    const provider = createClaudeProvider(config);
    await provider.restore({ credentials: mockCreds, identity: mockAccount });

    const creds = await Bun.file(credentialsPath).json();
    expect(creds.claudeAiOauth.accessToken).toBe('sk-test');

    const claude = await Bun.file(claudeJsonPath).json();
    expect(claude.oauthAccount.emailAddress).toBe('test@example.com');
    expect(claude.theme).toBe('dark');
  });

  it('displayInfo extracts email, org, and tier', () => {
    const provider = createClaudeProvider(config);
    const info = provider.displayInfo({
      credentials: mockCreds,
      identity: mockAccount,
    });

    expect(info.label).toBe('test@example.com');
    expect(info.context).toBe('Test Org');
    expect(info.tier).toBe('max');
  });

  it('displayInfo handles null identity', () => {
    const provider = createClaudeProvider(config);
    const info = provider.displayInfo({
      credentials: mockCreds,
      identity: null,
    });

    expect(info.label).toBeNull();
    expect(info.context).toBeNull();
    expect(info.tier).toBe('max');
  });

  it('restore with null identity removes oauthAccount', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await Bun.write(
      claudeJsonPath,
      JSON.stringify({
        theme: 'dark',
        oauthAccount: { emailAddress: 'old@test.com' },
      }),
    );

    const provider = createClaudeProvider(config);
    await provider.restore({ credentials: mockCreds, identity: null });

    const claude = await Bun.file(claudeJsonPath).json();
    expect(claude.oauthAccount).toBeUndefined();
    expect(claude.theme).toBe('dark');
  });

  it('clear deletes credentials and removes oauthAccount', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await Bun.write(credentialsPath, JSON.stringify(mockCreds));
    await Bun.write(
      claudeJsonPath,
      JSON.stringify({ theme: 'dark', oauthAccount: mockAccount }),
    );

    const provider = createClaudeProvider(config);
    await provider.clear();

    const credsExist = await Bun.file(credentialsPath).exists();
    expect(credsExist).toBe(false);

    const claude = await Bun.file(claudeJsonPath).json();
    expect(claude.oauthAccount).toBeUndefined();
    expect(claude.theme).toBe('dark');
  });

  it('clear succeeds when claude.json is missing', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await Bun.write(credentialsPath, JSON.stringify(mockCreds));

    const provider = createClaudeProvider(config);
    await provider.clear();

    const credsExist = await Bun.file(credentialsPath).exists();
    expect(credsExist).toBe(false);
  });
});
