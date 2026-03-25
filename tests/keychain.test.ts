import { createKeychainStore } from '@lib/credentials/keychain';
import * as spawnModule from '@lib/spawn';
import { describe, it, expect, spyOn } from 'bun:test';

const mockCreds = {
  claudeAiOauth: {
    accessToken: 'sk-test',
    refreshToken: 'ref-test',
    expiresAt: 9999999999999,
    scopes: ['user:inference'],
    subscriptionType: 'max',
    rateLimitTier: 'default',
  },
};

// -- read --

describe('keychainStore.read', () => {
  it('returns parsed credentials in JSON format', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: JSON.stringify(mockCreds),
      stderr: '',
      exitCode: 0,
    });
    const store = createKeychainStore();
    const result = await store.read();
    expect(result).toEqual(mockCreds);
    spy.mockRestore();
  });

  it('returns parsed credentials in hex format', async () => {
    const hex = Buffer.from(JSON.stringify(mockCreds), 'utf8').toString('hex');
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: hex,
      stderr: '',
      exitCode: 0,
    });
    const store = createKeychainStore();
    const result = await store.read();
    expect(result).toEqual(mockCreds);
    spy.mockRestore();
  });

  it('returns null when stderr says "could not be found"', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr:
        'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.',
      exitCode: 44,
    });
    const store = createKeychainStore();
    const result = await store.read();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null on exit code 44', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: 'some error',
      exitCode: 44,
    });
    const store = createKeychainStore();
    const result = await store.read();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('throws on unexpected exit code', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: 'permission denied',
      exitCode: 1,
    });
    const store = createKeychainStore();
    await expect(store.read()).rejects.toThrow('Keychain read failed (exit 1)');
    spy.mockRestore();
  });

  it('throws on unparseable keychain data', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '{not valid json',
      stderr: '',
      exitCode: 0,
    });
    const store = createKeychainStore();
    await expect(store.read()).rejects.toThrow(
      'Found credentials in keychain but failed to parse them',
    );
    spy.mockRestore();
  });

  it('throws on unparseable hex data', async () => {
    // Hex that decodes to invalid JSON
    const hex = Buffer.from('not json', 'utf8').toString('hex');
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: hex,
      stderr: '',
      exitCode: 0,
    });
    const store = createKeychainStore();
    await expect(store.read()).rejects.toThrow(
      'Found credentials in keychain but failed to parse them',
    );
    spy.mockRestore();
  });
});

// -- write --

describe('keychainStore.write', () => {
  it('writes in JSON format when no existing entry', async () => {
    let callCount = 0;
    const spy = spyOn(spawnModule, 'exec').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // find-generic-password: not found
        return { stdout: '', stderr: '', exitCode: 44 };
      }
      if (callCount === 2) {
        // delete-generic-password: not found (ok)
        return { stdout: '', stderr: '', exitCode: 44 };
      }
      // add-generic-password: success
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const store = createKeychainStore();
    await store.write(mockCreds);
    expect(callCount).toBe(3);
    spy.mockRestore();
  });

  it('preserves JSON format when existing entry is JSON', async () => {
    const existingJson = JSON.stringify({ old: 'data' });
    let callCount = 0;
    let addArgs: string[] = [];
    const spy = spyOn(spawnModule, 'exec').mockImplementation(
      async (cmd: string[]) => {
        callCount++;
        if (callCount === 1) {
          // find-generic-password: existing JSON entry
          return { stdout: existingJson, stderr: '', exitCode: 0 };
        }
        if (callCount === 2) {
          // delete: success
          return { stdout: '', stderr: '', exitCode: 0 };
        }
        addArgs = cmd;
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    );

    const store = createKeychainStore();
    await store.write(mockCreds);

    // The value passed to add-generic-password should be plain JSON (not hex)
    const valueArg = addArgs.at(-1)!;
    expect(JSON.parse(valueArg)).toEqual(mockCreds);
    spy.mockRestore();
  });

  it('preserves hex format when existing entry is hex', async () => {
    const existingHex = Buffer.from('{"old":"data"}', 'utf8').toString('hex');
    let callCount = 0;
    let addArgs: string[] = [];
    const spy = spyOn(spawnModule, 'exec').mockImplementation(
      async (cmd: string[]) => {
        callCount++;
        if (callCount === 1) {
          // find-generic-password: existing hex entry
          return { stdout: existingHex, stderr: '', exitCode: 0 };
        }
        if (callCount === 2) {
          // delete: success
          return { stdout: '', stderr: '', exitCode: 0 };
        }
        // add: capture the args to verify hex format
        addArgs = cmd;
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    );

    const store = createKeychainStore();
    await store.write(mockCreds);

    // The value passed to add-generic-password should be hex-encoded
    const valueArg = addArgs.at(-1)!;
    const decoded = Buffer.from(valueArg, 'hex').toString('utf8');
    expect(JSON.parse(decoded)).toEqual(mockCreds);
    spy.mockRestore();
  });

  it('throws when delete fails with unexpected exit code', async () => {
    let callCount = 0;
    const spy = spyOn(spawnModule, 'exec').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { stdout: '', stderr: '', exitCode: 44 }; // find: not found
      // delete: unexpected failure
      return { stdout: '', stderr: 'access denied', exitCode: 1 };
    });

    const store = createKeychainStore();
    await expect(store.write(mockCreds)).rejects.toThrow(
      'Failed to delete existing keychain entry',
    );
    spy.mockRestore();
  });

  it('throws when add fails', async () => {
    let callCount = 0;
    const spy = spyOn(spawnModule, 'exec').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { stdout: '', stderr: '', exitCode: 44 }; // find: not found
      if (callCount === 2) return { stdout: '', stderr: '', exitCode: 44 }; // delete: ok
      // add: failure
      return { stdout: '', stderr: 'duplicate entry', exitCode: 1 };
    });

    const store = createKeychainStore();
    await expect(store.write(mockCreds)).rejects.toThrow(
      'Failed to write credentials to macOS Keychain',
    );
    spy.mockRestore();
  });
});

// -- delete --

describe('keychainStore.delete', () => {
  it('succeeds on exit code 0', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    const store = createKeychainStore();
    await store.delete();
    spy.mockRestore();
  });

  it('succeeds on exit code 44 (already gone)', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 44,
    });
    const store = createKeychainStore();
    await store.delete();
    spy.mockRestore();
  });

  it('throws on unexpected exit code', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: 'permission denied',
      exitCode: 1,
    });
    const store = createKeychainStore();
    await expect(store.delete()).rejects.toThrow(
      'Failed to delete keychain entry (exit 1)',
    );
    spy.mockRestore();
  });
});
