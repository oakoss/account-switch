import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { rm, stat, readdir, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  Provider,
  ProviderResolver,
  ProviderSnapshot,
} from '../src/lib/types';

// Create a stable temp dir at module scope so mock.module can reference it
const TEST_DIR = mkdtempSync(join(tmpdir(), 'acsw-int-'));

mock.module('../src/lib/constants', () => ({
  PROFILES_DIR: TEST_DIR,
  STATE_FILE: join(TEST_DIR, 'state.json'),
  PROFILE_NAME_REGEX: /^[a-zA-Z0-9_-]+$/,
  profileDir: (name: string) => join(TEST_DIR, name),
  profileCredentialsFile: (name: string) =>
    join(TEST_DIR, name, 'credentials.json'),
  profileAccountFile: (name: string) => join(TEST_DIR, name, 'account.json'),
  profileMetaFile: (name: string) => join(TEST_DIR, name, 'profile.json'),
}));

const {
  addOAuthProfile,
  switchProfile,
  removeProfile,
  listProfiles,
  readState,
} = await import('../src/lib/profiles');

const stateFile = join(TEST_DIR, 'state.json');

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true });
});

// Clean test dir between tests
beforeEach(async () => {
  const entries = await readdir(TEST_DIR);
  for (const entry of entries) {
    await rm(join(TEST_DIR, entry), { recursive: true, force: true });
  }
});

function createMockProvider(
  initial: ProviderSnapshot | null = null,
): Provider & {
  current: ProviderSnapshot | null;
  restoreCalls: ProviderSnapshot[];
  clearCalled: boolean;
} {
  const m = {
    name: 'mock',
    current: initial,
    restoreCalls: [] as ProviderSnapshot[],
    clearCalled: false,

    async snapshot() {
      return m.current;
    },
    async restore(snap: ProviderSnapshot) {
      m.restoreCalls.push(snap);
      m.current = snap;
    },
    async clear() {
      m.clearCalled = true;
      m.current = null;
    },
    displayInfo(snap: ProviderSnapshot) {
      const identity = snap.identity as { email?: string; org?: string } | null;
      const creds = snap.credentials as { tier?: string } | null;
      return {
        label: identity?.email ?? null,
        context: identity?.org ?? null,
        tier: creds?.tier ?? null,
      };
    },
  };
  return m;
}

function mockResolver(provider: Provider): ProviderResolver {
  return () => provider;
}

async function setupProfile(
  name: string,
  creds: unknown,
  identity: unknown,
  providerName = 'mock',
) {
  const dir = join(TEST_DIR, name);
  await mkdir(dir, { recursive: true });
  const credPath = join(dir, 'credentials.json');
  await Bun.write(credPath, JSON.stringify(creds));
  await chmod(credPath, 0o600);
  if (identity) {
    await Bun.write(join(dir, 'account.json'), JSON.stringify(identity));
  }
  await Bun.write(
    join(dir, 'profile.json'),
    JSON.stringify({
      name,
      type: 'oauth',
      provider: providerName,
      createdAt: '2026-01-01',
      lastUsed: null,
    }),
  );
}

// -- addOAuthProfile --

describe('addOAuthProfile', () => {
  it('creates profile with credentials, account, and metadata', async () => {
    const provider = createMockProvider({
      credentials: { token: 'abc' },
      identity: { email: 'test@example.com' },
    });

    await addOAuthProfile('work', provider);

    const creds = await Bun.file(
      join(TEST_DIR, 'work', 'credentials.json'),
    ).json();
    expect(creds.token).toBe('abc');

    const account = await Bun.file(
      join(TEST_DIR, 'work', 'account.json'),
    ).json();
    expect(account.email).toBe('test@example.com');

    const meta = await Bun.file(join(TEST_DIR, 'work', 'profile.json')).json();
    expect(meta.name).toBe('work');
    expect(meta.type).toBe('oauth');
    expect(meta.provider).toBe('mock');

    const st = await stat(join(TEST_DIR, 'work', 'credentials.json'));
    expect(st.mode & 0o777).toBe(0o600);

    const state = await readState();
    expect(state.active).toBe('work');
  });

  it('throws when provider has no credentials', async () => {
    const provider = createMockProvider(null);

    await expect(addOAuthProfile('empty', provider)).rejects.toThrow(
      'No OAuth credentials found',
    );
  });
});

// -- switchProfile --

describe('switchProfile', () => {
  it('restores target snapshot and updates state', async () => {
    const provider = createMockProvider({
      credentials: { token: 'live' },
      identity: { email: 'current@test.com' },
    });
    const resolve = mockResolver(provider);

    await setupProfile(
      'work',
      { token: 'work-tok' },
      { email: 'work@test.com' },
    );
    await Bun.write(stateFile, JSON.stringify({ active: null }));

    const result = await switchProfile('work', resolve);

    expect(provider.restoreCalls).toHaveLength(1);
    expect(
      (provider.restoreCalls[0].credentials as { token: string }).token,
    ).toBe('work-tok');
    expect(result.email).toBe('work@test.com');
    expect(result.isActive).toBe(true);

    const state = await readState();
    expect(state.active).toBe('work');
  });

  it('snapshots outgoing profile before switching', async () => {
    const provider = createMockProvider({
      credentials: { token: 'personal-live' },
      identity: { email: 'personal@test.com' },
    });
    const resolve = mockResolver(provider);

    await setupProfile(
      'personal',
      { token: 'personal-old' },
      { email: 'old@test.com' },
    );
    await setupProfile(
      'work',
      { token: 'work-tok' },
      { email: 'work@test.com' },
    );
    await Bun.write(stateFile, JSON.stringify({ active: 'personal' }));

    await switchProfile('work', resolve);

    const savedCreds = await Bun.file(
      join(TEST_DIR, 'personal', 'credentials.json'),
    ).json();
    expect(savedCreds.token).toBe('personal-live');
  });

  it('rolls back on restore failure', async () => {
    let callCount = 0;
    const provider: Provider = {
      name: 'failing',
      async snapshot() {
        return { credentials: { token: 'original' }, identity: null };
      },
      async restore() {
        callCount++;
        if (callCount === 1) throw new Error('disk full');
      },
      async clear() {},
      displayInfo() {
        return { label: null, context: null, tier: null };
      },
    };
    const resolve = mockResolver(provider);

    await setupProfile('target', { token: 'target-tok' }, null);
    await Bun.write(stateFile, JSON.stringify({ active: null }));

    await expect(switchProfile('target', resolve)).rejects.toThrow(
      'Previous credentials restored',
    );
  });

  it('warns when rollback also fails', async () => {
    let callCount = 0;
    const provider: Provider = {
      name: 'double-fail',
      async snapshot() {
        return { credentials: { token: 'orig' }, identity: null };
      },
      async restore() {
        callCount++;
        if (callCount === 1) throw new Error('disk full');
        if (callCount === 2) throw new Error('rollback broken');
      },
      async clear() {},
      displayInfo() {
        return { label: null, context: null, tier: null };
      },
    };
    const resolve = mockResolver(provider);

    await setupProfile('target', { token: 'target-tok' }, null);
    await Bun.write(stateFile, JSON.stringify({ active: null }));

    await expect(switchProfile('target', resolve)).rejects.toThrow(
      'Could not restore previous credentials',
    );
  });

  it('skips outgoing snapshot when switching to the already-active profile', async () => {
    const provider = createMockProvider({
      credentials: { token: 'live' },
      identity: null,
    });
    const resolve = mockResolver(provider);

    await setupProfile('only', { token: 'stored' }, null);
    await Bun.write(stateFile, JSON.stringify({ active: 'only' }));

    const result = await switchProfile('only', resolve);

    // restore is called (target snapshot applied), but outgoing snapshot
    // should NOT overwrite stored credentials since active === target
    const storedCreds = await Bun.file(
      join(TEST_DIR, 'only', 'credentials.json'),
    ).json();
    expect(storedCreds.token).toBe('stored');
    expect(result.isActive).toBe(true);
  });

  it('handles non-oauth profile type without credential restore', async () => {
    const provider = createMockProvider(null);
    const resolve = mockResolver(provider);

    const dir = join(TEST_DIR, 'api-prof');
    await mkdir(dir, { recursive: true });
    await Bun.write(
      join(dir, 'profile.json'),
      JSON.stringify({
        name: 'api-prof',
        type: 'api-key',
        provider: 'mock',
        createdAt: '',
        lastUsed: null,
      }),
    );
    await Bun.write(stateFile, JSON.stringify({ active: null }));

    const result = await switchProfile('api-prof', resolve);

    expect(provider.restoreCalls).toHaveLength(0);
    expect(result.isActive).toBe(true);
    const state = await readState();
    expect(state.active).toBe('api-prof');
  });

  it('throws for nonexistent profile', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await expect(switchProfile('ghost', resolve)).rejects.toThrow(
      'does not exist',
    );
  });

  it('throws when target has no credentials', async () => {
    const resolve = mockResolver(createMockProvider(null));

    const dir = join(TEST_DIR, 'no-creds');
    await mkdir(dir, { recursive: true });
    await Bun.write(
      join(dir, 'profile.json'),
      JSON.stringify({
        name: 'no-creds',
        type: 'oauth',
        provider: 'mock',
        createdAt: '',
        lastUsed: null,
      }),
    );
    await Bun.write(stateFile, JSON.stringify({ active: null }));

    await expect(switchProfile('no-creds', resolve)).rejects.toThrow(
      'No credentials found',
    );
  });
});

// -- removeProfile --

describe('removeProfile', () => {
  it('deletes profile directory', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await setupProfile('doomed', { token: 'tok' }, null);
    await Bun.write(stateFile, JSON.stringify({ active: null }));

    await removeProfile('doomed', resolve);

    const entries = await readdir(TEST_DIR);
    expect(entries).not.toContain('doomed');
  });

  it('clears provider when removing active profile', async () => {
    const provider = createMockProvider({
      credentials: { token: 'live' },
      identity: null,
    });
    const resolve = mockResolver(provider);

    await setupProfile('active-one', { token: 'tok' }, null);
    await Bun.write(stateFile, JSON.stringify({ active: 'active-one' }));

    await removeProfile('active-one', resolve);

    expect(provider.clearCalled).toBe(true);
    const state = await readState();
    expect(state.active).toBeNull();
  });

  it('does not clear provider when removing non-active profile', async () => {
    const provider = createMockProvider(null);
    const resolve = mockResolver(provider);

    await setupProfile('inactive', { token: 'tok' }, null);
    await Bun.write(stateFile, JSON.stringify({ active: 'other' }));

    await removeProfile('inactive', resolve);
    expect(provider.clearCalled).toBe(false);
  });

  it('throws for nonexistent profile', async () => {
    const resolve = mockResolver(createMockProvider(null));
    await expect(removeProfile('ghost', resolve)).rejects.toThrow(
      'does not exist',
    );
  });
});

// -- listProfiles --

describe('listProfiles', () => {
  it('returns profiles with display info from provider', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await setupProfile(
      'alpha',
      { tier: 'max' },
      { email: 'a@test.com', org: 'Acme' },
    );
    await setupProfile('beta', { tier: 'pro' }, { email: 'b@test.com' });
    await Bun.write(stateFile, JSON.stringify({ active: 'alpha' }));

    const profiles = await listProfiles(resolve);

    expect(profiles).toHaveLength(2);
    expect(profiles[0].name).toBe('alpha');
    expect(profiles[0].email).toBe('a@test.com');
    expect(profiles[0].organizationName).toBe('Acme');
    expect(profiles[0].subscriptionType).toBe('max');
    expect(profiles[0].isActive).toBe(true);

    expect(profiles[1].name).toBe('beta');
    expect(profiles[1].isActive).toBe(false);
  });

  it('returns empty array when no profiles exist', async () => {
    const resolve = mockResolver(createMockProvider(null));
    const profiles = await listProfiles(resolve);
    expect(profiles).toHaveLength(0);
  });

  it('returns sorted profiles', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await setupProfile('zebra', {}, null);
    await setupProfile('alpha', {}, null);

    const profiles = await listProfiles(resolve);
    expect(profiles[0].name).toBe('alpha');
    expect(profiles[1].name).toBe('zebra');
  });
});
