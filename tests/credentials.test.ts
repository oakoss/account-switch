import type { OAuthCredentials } from '@lib/types';

import {
  readCredentials,
  writeCredentials,
  deleteCredentials,
  copyCredentials,
} from '@lib/credentials';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockCreds: OAuthCredentials = {
  claudeAiOauth: {
    accessToken: 'sk-ant-test-token',
    refreshToken: 'sk-ant-test-refresh',
    expiresAt: Date.now() + 3600000,
    scopes: ['user:inference'],
    subscriptionType: 'max',
    rateLimitTier: 'default',
  },
};

describe('credentials - file-based via path param', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-creds-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('writeCredentials + readCredentials roundtrip', async () => {
    const credPath = join(tempDir, 'credentials.json');

    await writeCredentials(mockCreds, credPath);
    const result = await readCredentials(credPath);

    expect(result).toEqual(mockCreds);
  });

  it('writeCredentials sets 0o600 permissions', async () => {
    const credPath = join(tempDir, 'credentials.json');

    await writeCredentials(mockCreds, credPath);

    const st = await stat(credPath);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('writeCredentials uses atomic temp-file-then-rename', async () => {
    const credPath = join(tempDir, 'credentials.json');

    await writeCredentials(mockCreds, credPath);

    // No .tmp file should remain
    const tmpExists = await Bun.file(`${credPath}.tmp`).exists();
    expect(tmpExists).toBe(false);
  });

  it('writeCredentials creates parent directories', async () => {
    const nested = join(tempDir, 'sub', 'dir', 'credentials.json');

    await writeCredentials(mockCreds, nested);

    const result = await readCredentials(nested);
    expect(result).not.toBeNull();
  });

  it('writeCredentials overwrites existing credentials', async () => {
    const credPath = join(tempDir, 'credentials.json');
    await writeCredentials(mockCreds, credPath);

    const updated: OAuthCredentials = {
      claudeAiOauth: {
        ...mockCreds.claudeAiOauth,
        accessToken: 'sk-ant-updated-token',
      },
    };
    await writeCredentials(updated, credPath);

    const result = await readCredentials(credPath);
    expect(result!.claudeAiOauth.accessToken).toBe('sk-ant-updated-token');
  });

  it('readCredentials returns null for nonexistent file', async () => {
    const credPath = join(tempDir, 'nonexistent.json');
    const result = await readCredentials(credPath);
    expect(result).toBeNull();
  });

  it('readCredentials throws on corrupted file', async () => {
    const credPath = join(tempDir, 'bad.json');
    await Bun.write(credPath, '{{not json');

    await expect(readCredentials(credPath)).rejects.toThrow(
      'could not be read',
    );
  });

  it('deleteCredentials removes the file', async () => {
    const credPath = join(tempDir, 'credentials.json');
    await writeCredentials(mockCreds, credPath);

    await deleteCredentials(credPath);

    const exists = await Bun.file(credPath).exists();
    expect(exists).toBe(false);
  });

  it('readCredentials returns null after deleteCredentials', async () => {
    const credPath = join(tempDir, 'credentials.json');
    await writeCredentials(mockCreds, credPath);
    await deleteCredentials(credPath);

    const result = await readCredentials(credPath);
    expect(result).toBeNull();
  });

  it('deleteCredentials is silent for nonexistent file', async () => {
    const credPath = join(tempDir, 'nonexistent.json');
    await deleteCredentials(credPath);
    // Should not throw
  });

  it('copyCredentials copies from one path to another', async () => {
    const src = join(tempDir, 'src.json');
    const dst = join(tempDir, 'dst.json');

    await writeCredentials(mockCreds, src);
    await copyCredentials(src, dst);

    const result = await readCredentials(dst);
    expect(result).not.toBeNull();
    expect(result!.claudeAiOauth.accessToken).toBe('sk-ant-test-token');

    const st = await stat(dst);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('copyCredentials throws when source does not exist', async () => {
    const src = join(tempDir, 'missing.json');
    const dst = join(tempDir, 'dst.json');

    await expect(copyCredentials(src, dst)).rejects.toThrow(
      'No credentials found',
    );
  });
});
