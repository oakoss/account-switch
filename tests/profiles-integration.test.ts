import type { ProfilesConfig, Provider } from '@lib/types';

import {
  addOAuthProfile,
  removeProfile,
  listProfiles,
  getActiveProfile,
  readState,
} from '@lib/profiles';
import { switchProfile } from '@lib/switch';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, stat, readdir, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMockProvider, mockResolver } from './helpers/mock-providers';

let tempDir: string;
let config: ProfilesConfig;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'acsw-int-'));
  config = { profilesDir: tempDir, stateFile: join(tempDir, 'state.json') };
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

async function setupProfile(
  name: string,
  creds: unknown,
  identity: unknown,
  providerName = 'mock',
) {
  const dir = join(tempDir, name);
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

    await addOAuthProfile('work', provider, config);

    const creds = await Bun.file(
      join(tempDir, 'work', 'credentials.json'),
    ).json();
    expect(creds.token).toBe('abc');

    const account = await Bun.file(
      join(tempDir, 'work', 'account.json'),
    ).json();
    expect(account.email).toBe('test@example.com');

    const meta = await Bun.file(join(tempDir, 'work', 'profile.json')).json();
    expect(meta.name).toBe('work');
    expect(meta.type).toBe('oauth');
    expect(meta.provider).toBe('mock');

    const st = await stat(join(tempDir, 'work', 'credentials.json'));
    expect(st.mode & 0o777).toBe(0o600);

    const state = await readState(config);
    expect(state.active).toBe('work');
  });

  it('throws when provider has no credentials', async () => {
    const provider = createMockProvider(null);

    await expect(addOAuthProfile('empty', provider, config)).rejects.toThrow(
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
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    const result = await switchProfile('work', resolve, config);

    expect(provider.restoreCalls).toHaveLength(1);
    expect(
      (provider.restoreCalls[0].credentials as { token: string }).token,
    ).toBe('work-tok');
    expect(result.email).toBe('work@test.com');
    expect(result.isActive).toBe(true);

    const state = await readState(config);
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
    await Bun.write(config.stateFile, JSON.stringify({ active: 'personal' }));

    await switchProfile('work', resolve, config);

    const savedCreds = await Bun.file(
      join(tempDir, 'personal', 'credentials.json'),
    ).json();
    expect(savedCreds.token).toBe('personal-live');
  });

  it('skips outgoing snapshot when switching to the already-active profile', async () => {
    const provider = createMockProvider({
      credentials: { token: 'live' },
      identity: null,
    });
    const resolve = mockResolver(provider);

    await setupProfile('only', { token: 'stored' }, null);
    await Bun.write(config.stateFile, JSON.stringify({ active: 'only' }));

    const result = await switchProfile('only', resolve, config);

    const storedCreds = await Bun.file(
      join(tempDir, 'only', 'credentials.json'),
    ).json();
    expect(storedCreds.token).toBe('stored');
    expect(result.isActive).toBe(true);
  });

  it('handles non-oauth profile type without credential restore', async () => {
    const provider = createMockProvider(null);
    const resolve = mockResolver(provider);

    const dir = join(tempDir, 'api-prof');
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
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    const result = await switchProfile('api-prof', resolve, config);

    expect(provider.restoreCalls).toHaveLength(0);
    expect(result.isActive).toBe(true);
    const state = await readState(config);
    expect(state.active).toBe('api-prof');
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
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    await expect(switchProfile('target', resolve, config)).rejects.toThrow(
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
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    await expect(switchProfile('target', resolve, config)).rejects.toThrow(
      'Could not restore previous credentials',
    );
  });

  it('throws for nonexistent profile', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await expect(switchProfile('ghost', resolve, config)).rejects.toThrow(
      'does not exist',
    );
  });

  it('throws when target has no credentials', async () => {
    const resolve = mockResolver(createMockProvider(null));

    const dir = join(tempDir, 'no-creds');
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
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    await expect(switchProfile('no-creds', resolve, config)).rejects.toThrow(
      'No credentials found',
    );
  });
});

// -- removeProfile --

describe('removeProfile', () => {
  it('deletes profile directory', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await setupProfile('doomed', { token: 'tok' }, null);
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    await removeProfile('doomed', resolve, config);

    const entries = await readdir(tempDir);
    expect(entries).not.toContain('doomed');
  });

  it('clears provider when removing active profile', async () => {
    const provider = createMockProvider({
      credentials: { token: 'live' },
      identity: null,
    });
    const resolve = mockResolver(provider);

    await setupProfile('active-one', { token: 'tok' }, null);
    await Bun.write(config.stateFile, JSON.stringify({ active: 'active-one' }));

    await removeProfile('active-one', resolve, config);

    expect(provider.clearCalled).toBe(true);
    const state = await readState(config);
    expect(state.active).toBeNull();
  });

  it('does not clear provider when removing non-active profile', async () => {
    const provider = createMockProvider(null);
    const resolve = mockResolver(provider);

    await setupProfile('inactive', { token: 'tok' }, null);
    await Bun.write(config.stateFile, JSON.stringify({ active: 'other' }));

    await removeProfile('inactive', resolve, config);
    expect(provider.clearCalled).toBe(false);
  });

  it('throws for nonexistent profile', async () => {
    const resolve = mockResolver(createMockProvider(null));
    await expect(removeProfile('ghost', resolve, config)).rejects.toThrow(
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
    await Bun.write(config.stateFile, JSON.stringify({ active: 'alpha' }));

    const profiles = await listProfiles(resolve, config);

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
    const profiles = await listProfiles(resolve, config);
    expect(profiles).toHaveLength(0);
  });

  it('returns sorted profiles', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await setupProfile('zebra', {}, null);
    await setupProfile('alpha', {}, null);

    const profiles = await listProfiles(resolve, config);
    expect(profiles[0].name).toBe('alpha');
    expect(profiles[1].name).toBe('zebra');
  });
});

// -- getActiveProfile --

describe('getActiveProfile', () => {
  it('returns active profile with display info', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await setupProfile(
      'work',
      { tier: 'max' },
      { email: 'work@test.com', org: 'Acme' },
    );
    await Bun.write(config.stateFile, JSON.stringify({ active: 'work' }));

    const active = await getActiveProfile(resolve, config);

    expect(active).not.toBeNull();
    expect(active!.name).toBe('work');
    expect(active!.isActive).toBe(true);
    expect(active!.email).toBe('work@test.com');
    expect(active!.organizationName).toBe('Acme');
    expect(active!.subscriptionType).toBe('max');
  });

  it('returns null when no active profile is set', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    const active = await getActiveProfile(resolve, config);
    expect(active).toBeNull();
  });

  it('returns null when active profile is missing from disk', async () => {
    const resolve = mockResolver(createMockProvider(null));

    await Bun.write(config.stateFile, JSON.stringify({ active: 'deleted' }));

    const active = await getActiveProfile(resolve, config);
    expect(active).toBeNull();
  });

  it('returns null when state file does not exist', async () => {
    const resolve = mockResolver(createMockProvider(null));

    const active = await getActiveProfile(resolve, config);
    expect(active).toBeNull();
  });
});
