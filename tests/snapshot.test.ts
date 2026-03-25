import type { ProfilesConfig } from '@lib/types';

import { readProfileSnapshot, writeProfileSnapshot } from '@lib/snapshot';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('readProfileSnapshot', () => {
  let tempDir: string;
  let config: ProfilesConfig;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-snap-'));
    config = { profilesDir: tempDir, stateFile: join(tempDir, 'state.json') };
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('reads credentials and identity', async () => {
    const dir = join(tempDir, 'work');
    await mkdir(dir, { recursive: true });
    await Bun.write(
      join(dir, 'credentials.json'),
      JSON.stringify({ token: 'abc' }),
    );
    await Bun.write(
      join(dir, 'account.json'),
      JSON.stringify({ email: 'test@example.com' }),
    );

    const snap = await readProfileSnapshot(config, 'work');
    expect(snap).not.toBeNull();
    expect((snap!.credentials as { token: string }).token).toBe('abc');
    expect((snap!.identity as { email: string }).email).toBe(
      'test@example.com',
    );
  });

  it('returns null identity when account.json is missing', async () => {
    const dir = join(tempDir, 'work');
    await mkdir(dir, { recursive: true });
    await Bun.write(
      join(dir, 'credentials.json'),
      JSON.stringify({ token: 'abc' }),
    );

    const snap = await readProfileSnapshot(config, 'work');
    expect(snap).not.toBeNull();
    expect(snap!.identity).toBeNull();
  });

  it('returns null when credentials.json is missing', async () => {
    const dir = join(tempDir, 'work');
    await mkdir(dir, { recursive: true });

    const snap = await readProfileSnapshot(config, 'work');
    expect(snap).toBeNull();
  });
});

describe('writeProfileSnapshot', () => {
  let tempDir: string;
  let config: ProfilesConfig;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-snap-'));
    config = { profilesDir: tempDir, stateFile: join(tempDir, 'state.json') };
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('writes credentials with 0o600 and identity', async () => {
    const dir = join(tempDir, 'work');
    await mkdir(dir, { recursive: true });

    await writeProfileSnapshot(config, 'work', {
      credentials: { token: 'xyz' },
      identity: { email: 'w@test.com' },
    });

    const creds = await Bun.file(join(dir, 'credentials.json')).json();
    expect(creds.token).toBe('xyz');

    const acct = await Bun.file(join(dir, 'account.json')).json();
    expect(acct.email).toBe('w@test.com');

    const st = await stat(join(dir, 'credentials.json'));
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('deletes account.json when identity is null', async () => {
    const dir = join(tempDir, 'work');
    await mkdir(dir, { recursive: true });
    await Bun.write(
      join(dir, 'account.json'),
      JSON.stringify({ email: 'old@test.com' }),
    );

    await writeProfileSnapshot(config, 'work', {
      credentials: { token: 'xyz' },
      identity: null,
    });

    const exists = await Bun.file(join(dir, 'account.json')).exists();
    expect(exists).toBe(false);
  });

  it('is silent when deleting nonexistent account.json', async () => {
    const dir = join(tempDir, 'work');
    await mkdir(dir, { recursive: true });

    await writeProfileSnapshot(config, 'work', {
      credentials: { token: 'xyz' },
      identity: null,
    });

    const creds = await Bun.file(join(dir, 'credentials.json')).json();
    expect(creds.token).toBe('xyz');
  });
});
