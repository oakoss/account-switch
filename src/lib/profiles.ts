import { readdir, rm } from 'node:fs/promises';

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
  fileExists,
  isENOENT,
  readJsonOptional,
  readJsonWithFallback,
  writeJson,
} from './fs';
import { profilePaths } from './paths';
import { readProfileSnapshot, writeProfileSnapshot } from './snapshot';

const DEFAULT_CONFIG: ProfilesConfig = {
  profilesDir: PROFILES_DIR,
  stateFile: STATE_FILE,
};

// -- State --

export async function readState(
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<ProfileState> {
  return readJsonWithFallback<ProfileState>(config.stateFile, { active: null });
}

export async function writeState(
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
  const { meta } = profilePaths(config.profilesDir, name);
  return fileExists(meta);
}

// -- Display info --

export function buildProfileInfo(
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
    if (isENOENT(error)) return [];
    throw error;
  }

  const profiles: ProfileInfo[] = [];

  for (const entryName of dirEntries) {
    const name = String(entryName);
    if (!PROFILE_NAME_REGEX.test(name)) continue;

    const { meta: metaPath } = profilePaths(config.profilesDir, name);
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

export async function getActiveProfile(
  resolve: ProviderResolver,
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<ProfileInfo | null> {
  const state = await readState(config);
  if (!state.active) return null;

  const { meta: metaPath } = profilePaths(config.profilesDir, state.active);
  const meta = await readJsonOptional<ProfileMeta>(metaPath);
  if (!meta) return null;

  const provider = resolve(meta.provider ?? 'claude');
  const snapshot = await readProfileSnapshot(config, state.active);
  return buildProfileInfo(state.active, meta, true, snapshot, provider);
}

export async function addOAuthProfile(
  name: string,
  provider: Provider,
  config: ProfilesConfig = DEFAULT_CONFIG,
  existingSnapshot?: ProviderSnapshot,
): Promise<void> {
  const { dir, meta: metaPath } = profilePaths(config.profilesDir, name);
  await ensureDir(dir);

  const snapshot = existingSnapshot ?? (await provider.snapshot());
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
    } catch (cleanupError) {
      const originalMsg =
        error instanceof Error ? error.message : String(error);
      const cleanupMsg =
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError);
      throw new Error(
        `Failed to create profile: ${originalMsg}. ` +
          `Cleanup also failed (${cleanupMsg}). Run 'acsw repair' to fix.`,
      );
    }
    throw error;
  }
}

export async function removeProfile(
  name: string,
  resolve: ProviderResolver,
  config: ProfilesConfig = DEFAULT_CONFIG,
): Promise<void> {
  if (!(await profileExists(name, config))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  const { dir, meta: metaPath } = profilePaths(config.profilesDir, name);
  const meta = await readJsonOptional<ProfileMeta>(metaPath);
  const provider = resolve(meta?.provider ?? 'claude');
  const state = await readState(config);

  if (state.active === name) {
    await provider.clear();
    await writeState({ active: null }, config);
  }

  await rm(dir, { recursive: true });
}
