import type { ProfileInfo, ProfilesConfig, ProviderResolver } from './types';

import { checkClaudeStatus } from './process';
import { profileExists, readState, switchProfile } from './profiles';

export type SwitchResult =
  | { status: 'switched'; profile: ProfileInfo }
  | { status: 'already-active' }
  | { status: 'not-found' }
  | { status: 'blocked'; reason: 'claude-running' | 'claude-unknown' };

/**
 * Check preconditions and switch profile if safe.
 * Returns a discriminated union for expected states (not-found, already-active, blocked).
 * Throws on infrastructure failures (credential I/O, keychain, rollback).
 */
export async function attemptSwitch(
  name: string,
  resolve: ProviderResolver,
  config?: ProfilesConfig,
): Promise<SwitchResult> {
  if (!(await profileExists(name, config))) {
    return { status: 'not-found' };
  }

  const state = await readState(config);
  if (state.active === name) {
    return { status: 'already-active' };
  }

  const claudeStatus = await checkClaudeStatus();
  if (claudeStatus === 'running') {
    return { status: 'blocked', reason: 'claude-running' };
  }
  if (claudeStatus === 'unknown') {
    return { status: 'blocked', reason: 'claude-unknown' };
  }

  const profile = await switchProfile(name, resolve, config);
  return { status: 'switched', profile };
}
