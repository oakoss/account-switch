import type { ProfilesConfig } from '@lib/types';

import * as processModule from '@lib/process';
import { attemptSwitch } from '@lib/switch';
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createFailingProvider,
  createMockProvider,
  mockResolver,
} from './helpers/mock-providers';
import {
  mockCreds,
  mockIdentity,
  mockSnap,
  setupProfile,
} from './helpers/setup-profile';

describe('attemptSwitch', () => {
  let tempDir: string;
  let config: ProfilesConfig;
  let claudeSpy: ReturnType<typeof spyOn> | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-switch-'));
    config = { profilesDir: tempDir, stateFile: join(tempDir, 'state.json') };
  });

  afterEach(async () => {
    claudeSpy?.mockRestore();
    claudeSpy = undefined;
    await rm(tempDir, { recursive: true });
  });

  it('returns not-found for nonexistent profile', async () => {
    const resolve = mockResolver(createMockProvider());
    const result = await attemptSwitch('nonexistent', resolve, config);
    expect(result.status).toBe('not-found');
  });

  it('returns already-active when profile is current', async () => {
    await setupProfile(tempDir, 'work', mockCreds, mockIdentity);
    await Bun.write(config.stateFile, JSON.stringify({ active: 'work' }));

    const resolve = mockResolver(createMockProvider(mockSnap));
    const result = await attemptSwitch('work', resolve, config);
    expect(result.status).toBe('already-active');
  });

  it('returns blocked with claude-running', async () => {
    await setupProfile(tempDir, 'work', mockCreds, mockIdentity);
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    claudeSpy = spyOn(processModule, 'checkClaudeStatus').mockResolvedValue(
      'running',
    );
    const resolve = mockResolver(createMockProvider(mockSnap));
    const result = await attemptSwitch('work', resolve, config);
    expect(result).toEqual({ status: 'blocked', reason: 'claude-running' });
  });

  it('returns blocked with claude-unknown', async () => {
    await setupProfile(tempDir, 'work', mockCreds, mockIdentity);
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    claudeSpy = spyOn(processModule, 'checkClaudeStatus').mockResolvedValue(
      'unknown',
    );
    const resolve = mockResolver(createMockProvider(mockSnap));
    const result = await attemptSwitch('work', resolve, config);
    expect(result).toEqual({ status: 'blocked', reason: 'claude-unknown' });
  });

  it('switches profile and returns result on success', async () => {
    await setupProfile(tempDir, 'work', mockCreds, mockIdentity);
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    claudeSpy = spyOn(processModule, 'checkClaudeStatus').mockResolvedValue(
      'not-running',
    );
    const resolve = mockResolver(createMockProvider(mockSnap));
    const result = await attemptSwitch('work', resolve, config);

    expect(result.status).toBe('switched');
    if (result.status === 'switched') {
      expect(result.profile.name).toBe('work');
      expect(result.profile.isActive).toBe(true);
    }
  });

  it('propagates errors from switchProfile', async () => {
    await setupProfile(tempDir, 'work', mockCreds, mockIdentity);
    await Bun.write(config.stateFile, JSON.stringify({ active: null }));

    claudeSpy = spyOn(processModule, 'checkClaudeStatus').mockResolvedValue(
      'not-running',
    );
    const provider = createFailingProvider(mockSnap, true);
    const resolve = mockResolver(provider);

    await expect(attemptSwitch('work', resolve, config)).rejects.toThrow();
  });
});
