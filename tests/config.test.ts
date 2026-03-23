import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('config - oauthAccount surgery', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-config-'));
    configPath = join(tempDir, '.claude.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('replaces oauthAccount without touching other keys', async () => {
    const original = {
      numStartups: 592,
      installMethod: 'native',
      theme: 'dark-ansi',
      oauthAccount: {
        emailAddress: 'old@example.com',
        displayName: 'Old User',
      },
      someOtherKey: { nested: true },
    };

    await Bun.write(configPath, JSON.stringify(original, null, 2));

    // Simulate what config.ts does
    const raw = await Bun.file(configPath).text();
    const data = JSON.parse(raw);

    data.oauthAccount = {
      emailAddress: 'new@example.com',
      displayName: 'New User',
      organizationName: 'New Org',
    };

    await Bun.write(configPath, JSON.stringify(data, null, 2));

    const result = JSON.parse(await Bun.file(configPath).text());

    // oauthAccount should be replaced
    expect(result.oauthAccount.emailAddress).toBe('new@example.com');
    expect(result.oauthAccount.displayName).toBe('New User');

    // All other keys should be preserved
    expect(result.numStartups).toBe(592);
    expect(result.installMethod).toBe('native');
    expect(result.theme).toBe('dark-ansi');
    expect(result.someOtherKey.nested).toBe(true);
  });

  it('handles missing oauthAccount gracefully', async () => {
    const original = { numStartups: 1, theme: 'light' };

    await Bun.write(configPath, JSON.stringify(original, null, 2));

    const data = JSON.parse(await Bun.file(configPath).text());
    const account = data.oauthAccount ?? null;

    expect(account).toBeNull();
  });

  it('can delete oauthAccount', async () => {
    const original = {
      numStartups: 1,
      oauthAccount: { emailAddress: 'test@example.com' },
    };

    await Bun.write(configPath, JSON.stringify(original, null, 2));

    const data = JSON.parse(await Bun.file(configPath).text());
    delete data.oauthAccount;
    await Bun.write(configPath, JSON.stringify(data, null, 2));

    const result = JSON.parse(await Bun.file(configPath).text());
    expect(result.oauthAccount).toBeUndefined();
    expect(result.numStartups).toBe(1);
  });
});
