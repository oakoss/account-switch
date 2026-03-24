import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createMockProvider,
  createFailingProvider,
} from './helpers/mock-providers';

describe('profiles - validateProfileName', () => {
  it('validates profile names correctly', async () => {
    const { validateProfileName } = await import('@lib/profiles');

    expect(validateProfileName('personal')).toBeNull();
    expect(validateProfileName('my-work')).toBeNull();
    expect(validateProfileName('test_123')).toBeNull();
    expect(validateProfileName('')).not.toBeNull();
    expect(validateProfileName('has space')).not.toBeNull();
    expect(validateProfileName('has/slash')).not.toBeNull();
    expect(validateProfileName('has.dot')).not.toBeNull();
  });
});

describe('profiles - mock provider', () => {
  it('createMockProvider returns snapshot and tracks restores', async () => {
    const snap = {
      credentials: { token: 'abc' },
      identity: { email: 'a@b.com' },
    };
    const provider = createMockProvider(snap);

    const result = await provider.snapshot();
    expect(result).toEqual(snap);

    const target = {
      credentials: { token: 'xyz' },
      identity: { email: 'x@y.com' },
    };
    await provider.restore(target);
    expect(provider.current).toEqual(target);
    expect(provider.restoreCalls).toHaveLength(1);
    expect(provider.restoreCalls[0]).toEqual(target);

    await provider.clear();
    expect(provider.clearCalled).toBe(true);
    expect(provider.current).toBeNull();
  });

  it('createMockProvider displayInfo extracts fields', () => {
    const provider = createMockProvider();
    const snap = {
      credentials: { tier: 'max' },
      identity: { email: 'test@example.com', org: 'Acme' },
    };
    const info = provider.displayInfo(snap);
    expect(info.label).toBe('test@example.com');
    expect(info.context).toBe('Acme');
    expect(info.tier).toBe('max');
  });

  it('createFailingProvider throws on first restore', async () => {
    const snap = { credentials: { token: 'orig' }, identity: null };
    const provider = createFailingProvider(snap, true, false);

    await expect(provider.snapshot()).resolves.toEqual(snap);

    await expect(
      provider.restore({ credentials: {}, identity: null }),
    ).rejects.toThrow('restore failed: disk full');

    // Second restore (rollback) should succeed
    await provider.restore({ credentials: {}, identity: null });
    expect(provider.restoreCalls).toHaveLength(2);
  });

  it('createFailingProvider throws on rollback', async () => {
    const snap = { credentials: { token: 'orig' }, identity: null };
    const provider = createFailingProvider(snap, true, true);

    await expect(
      provider.restore({ credentials: {}, identity: null }),
    ).rejects.toThrow('restore failed');

    await expect(
      provider.restore({ credentials: {}, identity: null }),
    ).rejects.toThrow('rollback failed');
  });
});

describe('profiles - file structure', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('writes profile files with correct structure', async () => {
    const profileDir = join(tempDir, 'test-profile');
    await mkdir(profileDir, { recursive: true });

    const credPath = join(profileDir, 'credentials.json');
    const accountPath = join(profileDir, 'account.json');
    const metaPath = join(profileDir, 'profile.json');

    const creds = {
      claudeAiOauth: {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000,
        scopes: ['user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'default',
      },
    };

    const account = {
      accountUuid: 'test-uuid',
      emailAddress: 'test@example.com',
      organizationName: 'Test Org',
    };

    const meta = {
      name: 'test-profile',
      type: 'oauth' as const,
      provider: 'claude',
      createdAt: new Date().toISOString(),
      lastUsed: null,
    };

    await Bun.write(credPath, JSON.stringify(creds, null, 2));
    const { chmodSync } = await import('node:fs');
    chmodSync(credPath, 0o600);
    await Bun.write(accountPath, JSON.stringify(account, null, 2));
    await Bun.write(metaPath, JSON.stringify(meta, null, 2));

    const readCreds = await Bun.file(credPath).json();
    expect(readCreds.claudeAiOauth.accessToken).toBe('test-token');
    expect(readCreds.claudeAiOauth.subscriptionType).toBe('max');

    const readAccount = await Bun.file(accountPath).json();
    expect(readAccount.emailAddress).toBe('test@example.com');

    const readMeta = await Bun.file(metaPath).json();
    expect(readMeta.name).toBe('test-profile');
    expect(readMeta.type).toBe('oauth');
    expect(readMeta.provider).toBe('claude');

    const st = await stat(credPath);
    expect(st.mode & 0o777).toBe(0o600);
  });
});
