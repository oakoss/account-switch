import { createKeychainStore } from '@lib/credentials/keychain';
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

function fakeSpawn(stdout: string, stderr: string, exitCode: number) {
  return {
    stdout: new Response(stdout).body!,
    stderr: new Response(stderr).body!,
    exited: Promise.resolve(exitCode),
    pid: 0,
    kill: () => {},
  };
}

// -- read --

describe('keychainStore.read', () => {
  it('returns parsed credentials in JSON format', async () => {
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn(JSON.stringify(mockCreds), '', 0) as never,
    );
    const store = createKeychainStore();
    const result = await store.read();
    expect(result).toEqual(mockCreds);
    spy.mockRestore();
  });

  it('returns parsed credentials in hex format', async () => {
    const hex = Buffer.from(JSON.stringify(mockCreds), 'utf8').toString('hex');
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn(hex, '', 0) as never,
    );
    const store = createKeychainStore();
    const result = await store.read();
    expect(result).toEqual(mockCreds);
    spy.mockRestore();
  });

  it('returns null when stderr says "could not be found"', async () => {
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn(
        '',
        'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.',
        44,
      ) as never,
    );
    const store = createKeychainStore();
    const result = await store.read();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null on exit code 44', async () => {
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn('', 'some error', 44) as never,
    );
    const store = createKeychainStore();
    const result = await store.read();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('throws on unexpected exit code', async () => {
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn('', 'permission denied', 1) as never,
    );
    const store = createKeychainStore();
    await expect(store.read()).rejects.toThrow('Keychain read failed (exit 1)');
    spy.mockRestore();
  });

  it('throws on unparseable keychain data', async () => {
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn('{not valid json', '', 0) as never,
    );
    const store = createKeychainStore();
    await expect(store.read()).rejects.toThrow(
      'Found credentials in keychain but failed to parse them',
    );
    spy.mockRestore();
  });

  it('throws on unparseable hex data', async () => {
    // Hex that decodes to invalid JSON
    const hex = Buffer.from('not json', 'utf8').toString('hex');
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn(hex, '', 0) as never,
    );
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
    const spy = spyOn(Bun, 'spawn').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // find-generic-password: not found
        return fakeSpawn('', '', 44) as never;
      }
      if (callCount === 2) {
        // delete-generic-password: not found (ok)
        return fakeSpawn('', '', 44) as never;
      }
      // add-generic-password: success
      return fakeSpawn('', '', 0) as never;
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
    const spy = spyOn(Bun, 'spawn').mockImplementation((...args: unknown[]) => {
      callCount++;
      if (callCount === 1) {
        // find-generic-password: existing JSON entry
        return fakeSpawn(existingJson, '', 0) as never;
      }
      if (callCount === 2) {
        // delete: success
        return fakeSpawn('', '', 0) as never;
      }
      addArgs = (args[0] as string[]) ?? [];
      return fakeSpawn('', '', 0) as never;
    });

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
    const spy = spyOn(Bun, 'spawn').mockImplementation((...args: unknown[]) => {
      callCount++;
      if (callCount === 1) {
        // find-generic-password: existing hex entry
        return fakeSpawn(existingHex, '', 0) as never;
      }
      if (callCount === 2) {
        // delete: success
        return fakeSpawn('', '', 0) as never;
      }
      // add: capture the args to verify hex format
      addArgs = (args[0] as string[]) ?? [];
      return fakeSpawn('', '', 0) as never;
    });

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
    const spy = spyOn(Bun, 'spawn').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return fakeSpawn('', '', 44) as never; // find: not found
      // delete: unexpected failure
      return fakeSpawn('', 'access denied', 1) as never;
    });

    const store = createKeychainStore();
    await expect(store.write(mockCreds)).rejects.toThrow(
      'Failed to delete existing keychain entry',
    );
    spy.mockRestore();
  });

  it('throws when add fails', async () => {
    let callCount = 0;
    const spy = spyOn(Bun, 'spawn').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return fakeSpawn('', '', 44) as never; // find: not found
      if (callCount === 2) return fakeSpawn('', '', 44) as never; // delete: ok
      // add: failure
      return fakeSpawn('', 'duplicate entry', 1) as never;
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
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn('', '', 0) as never,
    );
    const store = createKeychainStore();
    await store.delete();
    spy.mockRestore();
  });

  it('succeeds on exit code 44 (already gone)', async () => {
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn('', '', 44) as never,
    );
    const store = createKeychainStore();
    await store.delete();
    spy.mockRestore();
  });

  it('throws on unexpected exit code', async () => {
    const spy = spyOn(Bun, 'spawn').mockReturnValue(
      fakeSpawn('', 'permission denied', 1) as never,
    );
    const store = createKeychainStore();
    await expect(store.delete()).rejects.toThrow(
      'Failed to delete keychain entry (exit 1)',
    );
    spy.mockRestore();
  });
});
