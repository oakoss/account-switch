import { readOAuthAccount, writeOAuthAccount } from '@lib/config';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('readOAuthAccount', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-config-'));
    configPath = join(tempDir, '.claude.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('returns oauthAccount when present', async () => {
    await Bun.write(
      configPath,
      JSON.stringify({
        numStartups: 1,
        oauthAccount: { emailAddress: 'test@example.com', displayName: 'Test' },
      }),
    );

    const result = await readOAuthAccount(configPath);
    expect(result?.emailAddress).toBe('test@example.com');
    expect(result?.displayName).toBe('Test');
  });

  it('returns null when oauthAccount is absent', async () => {
    await Bun.write(configPath, JSON.stringify({ numStartups: 1 }));

    const result = await readOAuthAccount(configPath);
    expect(result).toBeNull();
  });

  it('returns null when file does not exist', async () => {
    const result = await readOAuthAccount(join(tempDir, 'nonexistent.json'));
    expect(result).toBeNull();
  });

  it('throws on corrupted JSON', async () => {
    await Bun.write(configPath, '{{not json');

    await expect(readOAuthAccount(configPath)).rejects.toThrow(
      'could not be parsed',
    );
  });
});

describe('writeOAuthAccount', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-config-'));
    configPath = join(tempDir, '.claude.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('adds oauthAccount to file without one', async () => {
    await Bun.write(configPath, JSON.stringify({ numStartups: 1 }));

    await writeOAuthAccount({ emailAddress: 'new@example.com' }, configPath);

    const result = await Bun.file(configPath).json();
    expect(result.oauthAccount.emailAddress).toBe('new@example.com');
    expect(result.numStartups).toBe(1);
  });

  it('writes oauthAccount preserving other keys', async () => {
    await Bun.write(
      configPath,
      JSON.stringify({
        numStartups: 592,
        theme: 'dark-ansi',
        oauthAccount: { emailAddress: 'old@example.com' },
      }),
    );

    await writeOAuthAccount(
      { emailAddress: 'new@example.com', displayName: 'New' },
      configPath,
    );

    const result = await Bun.file(configPath).json();
    expect(result.oauthAccount.emailAddress).toBe('new@example.com');
    expect(result.numStartups).toBe(592);
    expect(result.theme).toBe('dark-ansi');
  });

  it('deletes oauthAccount when null', async () => {
    await Bun.write(
      configPath,
      JSON.stringify({
        numStartups: 1,
        oauthAccount: { emailAddress: 'test@example.com' },
      }),
    );

    await writeOAuthAccount(null, configPath);

    const result = await Bun.file(configPath).json();
    expect(result.oauthAccount).toBeUndefined();
    expect(result.numStartups).toBe(1);
  });

  it('throws when file does not exist', async () => {
    await expect(
      writeOAuthAccount(
        { emailAddress: 'test@example.com' },
        join(tempDir, 'nonexistent.json'),
      ),
    ).rejects.toThrow('not found');
  });

  it('throws on corrupted file', async () => {
    await Bun.write(configPath, '{{not json');

    await expect(
      writeOAuthAccount({ emailAddress: 'test@example.com' }, configPath),
    ).rejects.toThrow('corrupted');
  });
});
