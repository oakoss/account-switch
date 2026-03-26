import type {
  ProfileInfo,
  ProfileMeta,
  ProfilesConfig,
  ProfileState,
  Provider,
  ProviderResolver,
  ProviderSnapshot,
} from './types';

import { PROFILES_DIR, STATE_FILE } from './constants';
import { readJsonWithFallback, writeJson } from './fs';
import { profilePaths } from './paths';
import { checkClaudeStatus } from './process';
import {
  buildProfileInfo,
  profileExists,
  readState,
  writeState,
} from './profiles';
import { readProfileSnapshot, writeProfileSnapshot } from './snapshot';

const DEFAULT_CONFIG: ProfilesConfig = {
  profilesDir: PROFILES_DIR,
  stateFile: STATE_FILE,
};

const DEFAULT_META: Omit<ProfileMeta, 'name'> = {
  type: 'oauth',
  provider: 'claude',
  createdAt: '',
  lastUsed: null,
};

function fallbackMeta(name: string): ProfileMeta {
  return { name, ...DEFAULT_META };
}

// -- Switch helpers --

async function snapshotOutgoingProfile(
  state: ProfileState,
  targetName: string,
  resolve: ProviderResolver,
  config: ProfilesConfig,
): Promise<void> {
  if (!state.active || state.active === targetName) return;
  if (!(await profileExists(state.active, config))) return;

  const { meta: outgoingMetaPath } = profilePaths(
    config.profilesDir,
    state.active,
  );
  const outgoingMeta = await readJsonWithFallback<ProfileMeta>(
    outgoingMetaPath,
    fallbackMeta(state.active),
  );
  const outgoingProvider = resolve(outgoingMeta.provider ?? 'claude');
  const currentSnapshot = await outgoingProvider.snapshot();
  if (currentSnapshot) {
    await writeProfileSnapshot(config, state.active, currentSnapshot);
  }
}

async function restoreWithRollback(
  provider: Provider,
  targetSnapshot: ProviderSnapshot,
  profileName: string,
  onSuccess?: () => Promise<void>,
): Promise<void> {
  const originalSnapshot = await provider.snapshot();
  try {
    await provider.restore(targetSnapshot);
    if (onSuccess) await onSuccess();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Attempt rollback
    try {
      if (originalSnapshot) await provider.restore(originalSnapshot);
    } catch (rollbackError) {
      const rollbackMsg =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
      throw new Error(
        `Failed to switch to "${profileName}": ${msg}. ` +
          `WARNING: Could not restore previous credentials (${rollbackMsg}). Run 'acsw repair' to check state.`,
      );
    }

    throw new Error(
      `Failed to switch to "${profileName}": ${msg}. Previous credentials restored.`,
    );
  }
}

// -- Public API --

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

export async function switchProfile(
  name: string,
  resolve: ProviderResolver,
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<ProfileInfo> {
  if (!(await profileExists(name, config))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  const state = await readState(config);
  const { meta: metaPath } = profilePaths(config.profilesDir, name);
  const targetMeta = await readJsonWithFallback<ProfileMeta>(
    metaPath,
    fallbackMeta(name),
  );

  const provider = resolve(targetMeta.provider ?? 'claude');

  await snapshotOutgoingProfile(state, name, resolve, config);

  async function commitState(): Promise<void> {
    targetMeta.lastUsed = new Date().toISOString();
    await writeJson(metaPath, targetMeta);
    await writeState({ active: name }, config);
  }

  if (targetMeta.type === 'oauth') {
    const targetSnapshot = await readProfileSnapshot(config, name);
    if (!targetSnapshot) {
      throw new Error(`No credentials found for profile "${name}"`);
    }

    await restoreWithRollback(provider, targetSnapshot, name, commitState);
  } else {
    await commitState();
  }

  let snapshot: ProviderSnapshot | null = null;
  try {
    snapshot = await readProfileSnapshot(config, name);
  } catch {
    // Non-fatal: switch succeeded but can't read back display info.
    // User sees profile name without email/subscription details.
  }

  return buildProfileInfo(name, targetMeta, true, snapshot, provider);
}
