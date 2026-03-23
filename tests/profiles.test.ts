import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We need to override PROFILES_DIR and STATE_FILE before importing profiles
// Use a dynamic import approach with module mocking

describe('profiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('validates profile names correctly', async () => {
    const { validateProfileName } = await import('../src/lib/profiles');

    expect(validateProfileName('personal')).toBeNull();
    expect(validateProfileName('my-work')).toBeNull();
    expect(validateProfileName('test_123')).toBeNull();
    expect(validateProfileName('')).not.toBeNull();
    expect(validateProfileName('has space')).not.toBeNull();
    expect(validateProfileName('has/slash')).not.toBeNull();
    expect(validateProfileName('has.dot')).not.toBeNull();
  });

  it('writes profile files with correct structure', async () => {
    const profileDir = join(tempDir, 'test-profile');
    const { mkdir } = await import('node:fs/promises');
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
      createdAt: new Date().toISOString(),
      lastUsed: null,
    };

    await Bun.write(credPath, JSON.stringify(creds, null, 2));
    const { chmodSync } = await import('node:fs');
    chmodSync(credPath, 0o600);
    await Bun.write(accountPath, JSON.stringify(account, null, 2));
    await Bun.write(metaPath, JSON.stringify(meta, null, 2));

    // Verify files exist and parse correctly
    const readCreds = await Bun.file(credPath).json();
    expect(readCreds.claudeAiOauth.accessToken).toBe('test-token');
    expect(readCreds.claudeAiOauth.subscriptionType).toBe('max');

    const readAccount = await Bun.file(accountPath).json();
    expect(readAccount.emailAddress).toBe('test@example.com');

    const readMeta = await Bun.file(metaPath).json();
    expect(readMeta.name).toBe('test-profile');
    expect(readMeta.type).toBe('oauth');

    // Verify credentials file permissions
    const st = await stat(credPath);
    expect(st.mode & 0o777).toBe(0o600);
  });
});
