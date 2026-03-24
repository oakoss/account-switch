import type { RepairConfig } from '@lib/types';

import { repairProfiles } from '@lib/repair';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('repairProfiles', () => {
  let tempDir: string;
  let config: RepairConfig;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-repair-'));
    config = { profilesDir: tempDir, stateFile: join(tempDir, 'state.json') };
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  async function createProfile(
    name: string,
    opts: {
      meta?: unknown | false;
      credentials?: unknown | false;
      account?: unknown | false;
      credMode?: number;
    } = {},
  ) {
    const dir = join(tempDir, name);
    await mkdir(dir, { recursive: true });

    if (opts.meta !== false) {
      const meta = opts.meta ?? {
        name,
        type: 'oauth',
        provider: 'claude',
        createdAt: '2026-01-01',
        lastUsed: null,
      };
      await Bun.write(join(dir, 'profile.json'), JSON.stringify(meta));
    }

    if (opts.credentials !== false) {
      const creds = opts.credentials ?? {
        claudeAiOauth: {
          accessToken: 'tok',
          refreshToken: 'ref',
          expiresAt: 0,
          scopes: [],
        },
      };
      const credPath = join(dir, 'credentials.json');
      await Bun.write(credPath, JSON.stringify(creds));
      await chmod(credPath, opts.credMode ?? 0o600);
    }

    if (opts.account !== undefined && opts.account !== false) {
      await Bun.write(join(dir, 'account.json'), JSON.stringify(opts.account));
    }
  }

  it('reports healthy profiles with no issues', async () => {
    await createProfile('personal');
    await createProfile('work');

    const { results, checked } = await repairProfiles(config);
    expect(checked).toBe(2);
    expect(results).toHaveLength(0);
  });

  it('returns empty for missing profiles directory', async () => {
    const missing = {
      profilesDir: join(tempDir, 'nonexistent'),
      stateFile: join(tempDir, 'state.json'),
    };
    const { results, checked } = await repairProfiles(missing);
    expect(checked).toBe(0);
    expect(results).toHaveLength(0);
  });

  it('returns empty for directory with no profiles', async () => {
    const { results, checked } = await repairProfiles(config);
    expect(checked).toBe(0);
    expect(results).toHaveLength(0);
  });

  it('detects missing profile.json', async () => {
    await createProfile('broken', { meta: false });

    const { results, checked } = await repairProfiles(config);
    expect(checked).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0].profile).toBe('broken');
    expect(results[0].issue).toBe('Missing profile.json');
    expect(results[0].fixed).toBe(false);
  });

  it('detects corrupted profile.json', async () => {
    const dir = join(tempDir, 'corrupt');
    await mkdir(dir);
    await Bun.write(join(dir, 'profile.json'), 'not json{{{');
    await Bun.write(join(dir, 'credentials.json'), '{}');
    await chmod(join(dir, 'credentials.json'), 0o600);

    const { results } = await repairProfiles(config);
    const metaIssue = results.find((r) => r.issue === 'Corrupted profile.json');
    expect(metaIssue).toBeDefined();
    expect(metaIssue!.fixed).toBe(false);
  });

  it('detects missing credentials.json', async () => {
    await createProfile('no-creds', { credentials: false });

    const { results } = await repairProfiles(config);
    const issue = results.find((r) => r.issue === 'Missing credentials.json');
    expect(issue).toBeDefined();
    expect(issue!.fixed).toBe(false);
  });

  it('detects corrupted credentials.json', async () => {
    const dir = join(tempDir, 'bad-creds');
    await mkdir(dir);
    await Bun.write(
      join(dir, 'profile.json'),
      JSON.stringify({ name: 'bad-creds' }),
    );
    await Bun.write(join(dir, 'credentials.json'), '{{invalid');
    await chmod(join(dir, 'credentials.json'), 0o600);

    const { results } = await repairProfiles(config);
    const issue = results.find((r) => r.issue === 'Corrupted credentials.json');
    expect(issue).toBeDefined();
    expect(issue!.fixed).toBe(false);
  });

  it('fixes wrong permissions on credentials.json', async () => {
    await createProfile('bad-perms', { credMode: 0o644 });

    const { results } = await repairProfiles(config);
    const issue = results.find((r) => r.issue.includes('permissions'));
    expect(issue).toBeDefined();
    expect(issue!.fixed).toBe(true);
    expect(issue!.issue).toContain('fixed to 600');
  });

  it('detects corrupted account.json', async () => {
    await createProfile('bad-account');
    await Bun.write(join(tempDir, 'bad-account', 'account.json'), '{{not json');

    const { results } = await repairProfiles(config);
    const issue = results.find((r) => r.issue === 'Corrupted account.json');
    expect(issue).toBeDefined();
  });

  it('detects stale state reference', async () => {
    await createProfile('exists');
    await Bun.write(config.stateFile, JSON.stringify({ active: 'deleted' }));

    const { results } = await repairProfiles(config);
    const issue = results.find((r) => r.profile === '(state)');
    expect(issue).toBeDefined();
    expect(issue!.issue).toContain('deleted');
  });

  it('valid state reference produces no issue', async () => {
    await createProfile('active');
    await Bun.write(config.stateFile, JSON.stringify({ active: 'active' }));

    const { results } = await repairProfiles(config);
    const stateIssue = results.find((r) => r.profile === '(state)');
    expect(stateIssue).toBeUndefined();
  });

  it('reports corrupted state.json', async () => {
    await createProfile('healthy');
    await Bun.write(config.stateFile, '{{not json');

    const { results } = await repairProfiles(config);
    const issue = results.find((r) => r.profile === '(state)');
    expect(issue).toBeDefined();
    expect(issue!.issue).toContain('Could not read state file');
  });

  it('skips non-profile entries', async () => {
    await Bun.write(join(tempDir, '.DS_Store'), '');
    await Bun.write(
      join(tempDir, 'state.json'),
      JSON.stringify({ active: null }),
    );

    const { checked } = await repairProfiles(config);
    expect(checked).toBe(0);
  });

  it('reports multiple issues across profiles', async () => {
    await createProfile('healthy');
    await createProfile('no-creds', { credentials: false });
    await createProfile('bad-perms', { credMode: 0o644 });

    const { results, checked } = await repairProfiles(config);
    expect(checked).toBe(3);
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.profile === 'no-creds')).toBe(true);
    expect(results.some((r) => r.profile === 'bad-perms')).toBe(true);
  });
});
