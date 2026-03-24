import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  ProfileState,
  ProfileMeta,
  ProfileInfo,
  ProfilesConfig,
  Provider,
  ProviderResolver,
  ProviderSnapshot,
} from './types';

import { PROFILES_DIR, STATE_FILE, PROFILE_NAME_REGEX } from './constants';
import {
  ensureDir,
  readJsonOptional,
  readJsonWithFallback,
  writeJson,
} from './fs';

const DEFAULT_CONFIG: ProfilesConfig = {
  profilesDir: PROFILES_DIR,
  stateFile: STATE_FILE,
};

function profilePaths(config: ProfilesConfig, name: string) {
  if (!PROFILE_NAME_REGEX.test(name)) {
    throw new Error(`Invalid profile name: "${name}"`);
  }
  const dir = join(config.profilesDir, name);
  return {
    dir,
    credentials: join(dir, 'credentials.json'),
    account: join(dir, 'account.json'),
    meta: join(dir, 'profile.json'),
  };
}

const DEFAULT_META: Omit<ProfileMeta, 'name'> = {
  type: 'oauth',
  provider: 'claude',
  createdAt: '',
  lastUsed: null,
};

function fallbackMeta(name: string): ProfileMeta {
  return { name, ...DEFAULT_META };
}

// -- State --

export async function readState(
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<ProfileState> {
  return readJsonWithFallback<ProfileState>(config.stateFile, { active: null });
}

async function writeState(
  state: ProfileState,
  config: ProfilesConfig,
): Promise<void> {
  await ensureDir(config.profilesDir);
  await writeJson(config.stateFile, state);
}

// -- Validation --

export function validateProfileName(name: string): string | null {
  if (!name) return 'Profile name is required';
  if (!PROFILE_NAME_REGEX.test(name)) {
    return 'Invalid name. Use letters, numbers, hyphens, or underscores.';
  }
  return null;
}

export async function profileExists(
  name: string,
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<boolean> {
  const { meta } = profilePaths(config, name);
  return Bun.file(meta).exists();
}

// -- Snapshot I/O --

async function readProfileSnapshot(
  config: ProfilesConfig,
  name: string,
): Promise<ProviderSnapshot | null> {
  const { credentials, account } = profilePaths(config, name);
  const creds = await readJsonOptional(credentials);
  if (!creds) return null;
  const identity = await readJsonOptional(account);
  return { credentials: creds, identity };
}

async function writeProfileSnapshot(
  config: ProfilesConfig,
  name: string,
  snapshot: ProviderSnapshot,
): Promise<void> {
  const { credentials, account } = profilePaths(config, name);
  await writeJson(credentials, snapshot.credentials, 0o600);
  if (snapshot.identity) {
    await writeJson(account, snapshot.identity);
  } else {
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(account);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return;
      throw error;
    }
  }
}

// -- Display info --

function buildProfileInfo(
  name: string,
  meta: ProfileMeta,
  isActive: boolean,
  snapshot?: ProviderSnapshot | null,
  provider?: Provider,
): ProfileInfo {
  let email: string | null = null;
  let subscriptionType: string | null = null;
  let organizationName: string | null = null;

  if (snapshot && provider) {
    const info = provider.displayInfo(snapshot);
    email = info.label;
    organizationName = info.context;
    subscriptionType = info.tier;
  }

  return {
    name,
    type: meta.type,
    email,
    subscriptionType,
    organizationName,
    isActive,
    lastUsed: meta.lastUsed,
  };
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

  const { meta: outgoingMetaPath } = profilePaths(config, state.active);
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

// -- Profile operations --

export async function listProfiles(
  resolve: ProviderResolver,
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<ProfileInfo[]> {
  await ensureDir(config.profilesDir);
  const state = await readState(config);

  let dirEntries: string[];
  try {
    dirEntries = await readdir(config.profilesDir);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return [];
    throw error;
  }

  const profiles: ProfileInfo[] = [];

  for (const entryName of dirEntries) {
    const name = String(entryName);
    if (!PROFILE_NAME_REGEX.test(name)) continue;

    const { meta: metaPath } = profilePaths(config, name);
    const meta = await readJsonOptional<ProfileMeta>(metaPath);
    if (!meta) continue;

    const provider = resolve(meta.provider ?? 'claude');
    const snapshot = await readProfileSnapshot(config, name);
    profiles.push(
      buildProfileInfo(name, meta, state.active === name, snapshot, provider),
    );
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addOAuthProfile(
  name: string,
  provider: Provider,
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<void> {
  const { dir, meta: metaPath } = profilePaths(config, name);
  await ensureDir(dir);

  const snapshot = await provider.snapshot();
  if (!snapshot) {
    throw new Error("No OAuth credentials found. Log in with 'claude' first.");
  }

  try {
    await writeProfileSnapshot(config, name, snapshot);
    await writeJson(metaPath, {
      name,
      type: 'oauth',
      provider: provider.name,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    });
    await writeState({ active: name }, config);
  } catch (error) {
    try {
      await rm(dir, { recursive: true });
    } catch {
      /* cleanup best-effort */
    }
    throw error;
  }
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
  const { meta: metaPath } = profilePaths(config, name);
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
    // Non-fatal: switch succeeded, just can't read back display info
  }

  return buildProfileInfo(name, targetMeta, true, snapshot, provider);
}

export async function removeProfile(
  name: string,
  resolve: ProviderResolver,
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<void> {
  if (!(await profileExists(name, config))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  const { dir, meta: metaPath } = profilePaths(config, name);
  const meta = await readJsonOptional<ProfileMeta>(metaPath);
  const provider = resolve(meta?.provider ?? 'claude');
  const state = await readState(config);

  if (state.active === name) {
    await provider.clear();
    await writeState({ active: null }, config);
  }

  await rm(dir, { recursive: true });
}
