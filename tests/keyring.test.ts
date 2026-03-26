import {
  createKeyringStore,
  type KeyringEntry,
} from '@lib/credentials/keyring';
import { describe, it, expect } from 'bun:test';

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

function createMockEntry(stored: string | null = null): KeyringEntry {
  let value = stored;
  return {
    getPassword: () => value,
    setPassword: (v: string) => {
      value = v;
    },
    deletePassword: () => {
      if (value === null) return false;
      value = null;
      return true;
    },
  };
}

// -- read --

describe('keyringStore.read', () => {
  it('returns parsed credentials in JSON format', async () => {
    const entry = createMockEntry(JSON.stringify(mockCreds));
    const store = createKeyringStore(entry);
    const result = await store.read();
    expect(result).toEqual(mockCreds);
  });

  it('returns parsed credentials in hex format', async () => {
    const hex = Buffer.from(JSON.stringify(mockCreds), 'utf8').toString('hex');
    const entry = createMockEntry(hex);
    const store = createKeyringStore(entry);
    const result = await store.read();
    expect(result).toEqual(mockCreds);
  });

  it('returns null when no credentials stored', async () => {
    const entry = createMockEntry(null);
    const store = createKeyringStore(entry);
    const result = await store.read();
    expect(result).toBeNull();
  });

  it('throws on unparseable JSON data', async () => {
    const entry = createMockEntry('{not valid json');
    const store = createKeyringStore(entry);
    await expect(store.read()).rejects.toThrow(
      'Found credentials in keyring but failed to parse them',
    );
  });

  it('throws on unparseable hex data', async () => {
    const hex = Buffer.from('not json', 'utf8').toString('hex');
    const entry = createMockEntry(hex);
    const store = createKeyringStore(entry);
    await expect(store.read()).rejects.toThrow(
      'Found credentials in keyring but failed to parse them',
    );
  });

  it('throws when getPassword() throws', async () => {
    const entry = createMockEntry(null);
    entry.getPassword = () => {
      throw new Error('keyring locked');
    };
    const store = createKeyringStore(entry);
    await expect(store.read()).rejects.toThrow(
      'Failed to read credentials from keyring: keyring locked',
    );
  });
});

// -- write --

describe('keyringStore.write', () => {
  it('writes in JSON format when no existing entry', async () => {
    const entry = createMockEntry(null);
    const store = createKeyringStore(entry);
    await store.write(mockCreds);

    const stored = entry.getPassword()!;
    expect(JSON.parse(stored)).toEqual(mockCreds);
  });

  it('preserves JSON format when existing entry is JSON', async () => {
    const entry = createMockEntry(JSON.stringify({ old: 'data' }));
    const store = createKeyringStore(entry);
    await store.write(mockCreds);

    const stored = entry.getPassword()!;
    expect(JSON.parse(stored)).toEqual(mockCreds);
  });

  it('preserves hex format when existing entry is hex', async () => {
    const existingHex = Buffer.from('{"old":"data"}', 'utf8').toString('hex');
    const entry = createMockEntry(existingHex);
    const store = createKeyringStore(entry);
    await store.write(mockCreds);

    const stored = entry.getPassword()!;
    const decoded = Buffer.from(stored, 'hex').toString('utf8');
    expect(JSON.parse(decoded)).toEqual(mockCreds);
  });

  it('throws when setPassword() throws', async () => {
    const entry = createMockEntry(null);
    entry.setPassword = () => {
      throw new Error('access denied');
    };
    const store = createKeyringStore(entry);
    await expect(store.write(mockCreds)).rejects.toThrow(
      'Failed to write credentials to keyring: access denied',
    );
  });

  it('throws when format detection getPassword() throws', async () => {
    const entry = createMockEntry(null);
    entry.getPassword = () => {
      throw new Error('ambiguous entry');
    };
    const store = createKeyringStore(entry);
    await expect(store.write(mockCreds)).rejects.toThrow(
      'Failed to read existing credentials from keyring: ambiguous entry',
    );
  });
});

// -- delete --

describe('keyringStore.delete', () => {
  it('deletes existing entry', async () => {
    const entry = createMockEntry(JSON.stringify(mockCreds));
    const store = createKeyringStore(entry);
    await store.delete();
    expect(entry.getPassword()).toBeNull();
  });

  it('succeeds when entry does not exist', async () => {
    const entry = createMockEntry(null);
    const store = createKeyringStore(entry);
    await store.delete();
    expect(entry.getPassword()).toBeNull();
  });

  it('throws on unexpected errors', async () => {
    const entry = createMockEntry(JSON.stringify(mockCreds));
    entry.deletePassword = () => {
      throw new Error('permission denied');
    };
    const store = createKeyringStore(entry);
    await expect(store.delete()).rejects.toThrow(
      'Failed to delete credentials from keyring: permission denied',
    );
  });
});
