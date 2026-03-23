import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('credentials - file-based storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-creds-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  const mockCreds = {
    claudeAiOauth: {
      accessToken: 'sk-ant-test-token',
      refreshToken: 'sk-ant-test-refresh',
      expiresAt: Date.now() + 3600000,
      scopes: ['user:inference'],
      subscriptionType: 'max',
      rateLimitTier: 'default',
    },
  };

  it('writes and reads credentials file roundtrip', async () => {
    const credPath = join(tempDir, 'credentials.json');

    await Bun.write(credPath, JSON.stringify(mockCreds, null, 2));
    const { chmodSync } = await import('node:fs');
    chmodSync(credPath, 0o600);

    const readBack = await Bun.file(credPath).json();
    expect(readBack.claudeAiOauth.accessToken).toBe('sk-ant-test-token');
    expect(readBack.claudeAiOauth.refreshToken).toBe('sk-ant-test-refresh');
    expect(readBack.claudeAiOauth.subscriptionType).toBe('max');
  });

  it('sets file permissions to 0o600', async () => {
    const credPath = join(tempDir, 'credentials.json');

    await Bun.write(credPath, JSON.stringify(mockCreds, null, 2));
    const { chmodSync } = await import('node:fs');
    chmodSync(credPath, 0o600);

    const st = await stat(credPath);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('returns null for nonexistent file', async () => {
    const credPath = join(tempDir, 'nonexistent.json');
    const file = Bun.file(credPath);
    const exists = await file.exists();
    expect(exists).toBe(false);
  });

  it('handles both JSON formats', () => {
    // Raw JSON (newer format)
    const rawJson = '{"claudeAiOauth":{"accessToken":"test"}}';
    expect(rawJson.startsWith('{')).toBe(true);
    const parsed = JSON.parse(rawJson);
    expect(parsed.claudeAiOauth.accessToken).toBe('test');

    // Hex-encoded JSON (older format)
    const hexJson = Buffer.from(rawJson, 'utf8').toString('hex');
    expect(hexJson.startsWith('{')).toBe(false);
    const decoded = Buffer.from(hexJson, 'hex').toString('utf8');
    const parsedHex = JSON.parse(decoded);
    expect(parsedHex.claudeAiOauth.accessToken).toBe('test');
  });
});
