import type { OAuthCredentials } from '@lib/types';

import { createFileStore } from '@lib/credentials/file';
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

describe('credentials - file store', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-creds-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('write + read roundtrip', async () => {
    const store = createFileStore(join(tempDir, 'credentials.json'));

    await store.write(mockCreds);
    const result = await store.read();

    expect(result).toEqual(mockCreds);
  });

  it('write sets 0o600 permissions', async () => {
    const credPath = join(tempDir, 'credentials.json');
    const store = createFileStore(credPath);

    await store.write(mockCreds);

    const st = await stat(credPath);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('write uses atomic temp-file-then-rename', async () => {
    const credPath = join(tempDir, 'credentials.json');
    const store = createFileStore(credPath);

    await store.write(mockCreds);

    const tmpExists = await Bun.file(`${credPath}.tmp`).exists();
    expect(tmpExists).toBe(false);
  });

  it('write creates parent directories', async () => {
    const nested = join(tempDir, 'sub', 'dir', 'credentials.json');
    const store = createFileStore(nested);

    await store.write(mockCreds);

    const result = await store.read();
    expect(result).not.toBeNull();
  });

  it('write overwrites existing credentials', async () => {
    const store = createFileStore(join(tempDir, 'credentials.json'));
    await store.write(mockCreds);

    const updated: OAuthCredentials = {
      claudeAiOauth: {
        ...mockCreds.claudeAiOauth,
        accessToken: 'sk-ant-updated-token',
      },
    };
    await store.write(updated);

    const result = await store.read();
    expect(result!.claudeAiOauth.accessToken).toBe('sk-ant-updated-token');
  });

  it('read returns null for nonexistent file', async () => {
    const store = createFileStore(join(tempDir, 'nonexistent.json'));
    const result = await store.read();
    expect(result).toBeNull();
  });

  it('read throws on corrupted file', async () => {
    const credPath = join(tempDir, 'bad.json');
    await Bun.write(credPath, '{{not json');
    const store = createFileStore(credPath);

    await expect(store.read()).rejects.toThrow('could not be read');
  });

  it('delete removes the file', async () => {
    const credPath = join(tempDir, 'credentials.json');
    const store = createFileStore(credPath);
    await store.write(mockCreds);

    await store.delete();

    const exists = await Bun.file(credPath).exists();
    expect(exists).toBe(false);
  });

  it('read returns null after delete', async () => {
    const store = createFileStore(join(tempDir, 'credentials.json'));
    await store.write(mockCreds);
    await store.delete();

    const result = await store.read();
    expect(result).toBeNull();
  });

  it('delete is silent for nonexistent file', async () => {
    const store = createFileStore(join(tempDir, 'nonexistent.json'));
    await store.delete();
    // Should not throw
  });
});
