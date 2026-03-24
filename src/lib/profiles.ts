import { mkdir, readdir, rm, chmod } from 'node:fs/promises';

import type {
  ProfileState,
  ProfileMeta,
  ProfileInfo,
  Provider,
  ProviderResolver,
  ProviderSnapshot,
} from './types';

import {
  PROFILES_DIR,
  STATE_FILE,
  PROFILE_NAME_REGEX,
  profileDir,
  profileCredentialsFile,
  profileAccountFile,
  profileMetaFile,
} from './constants';

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function readJsonOptional<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as T;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${msg}`);
  }
}

async function readJsonWithFallback<T>(path: string, fallback: T): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) return fallback;
  try {
    return (await file.json()) as T;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${msg}`);
  }
}

async function writeJson(
  path: string,
  data: unknown,
  mode?: number,
): Promise<void> {
  const tmpPath = `${path}.tmp`;
  try {
    await Bun.write(tmpPath, JSON.stringify(data, null, 2));
    if (mode) await chmod(tmpPath, mode);
    const { renameSync } = await import('node:fs');
    renameSync(tmpPath, path);
  } catch (error) {
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(tmpPath);
    } catch {
      /* cleanup best-effort */
    }
    throw error;
  }
}

export async function readState(path?: string): Promise<ProfileState> {
  return readJsonWithFallback<ProfileState>(path ?? STATE_FILE, {
    active: null,
  });
}

async function writeState(state: ProfileState): Promise<void> {
  await ensureDir(PROFILES_DIR);
  await writeJson(STATE_FILE, state);
}

export function validateProfileName(name: string): string | null {
  if (!name) return 'Profile name is required';
  if (!PROFILE_NAME_REGEX.test(name)) {
    return 'Invalid name. Use letters, numbers, hyphens, or underscores.';
  }
  return null;
}

export async function profileExists(name: string): Promise<boolean> {
  const file = Bun.file(profileMetaFile(name));
  return file.exists();
}

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

async function readProfileSnapshot(
  name: string,
): Promise<ProviderSnapshot | null> {
  const creds = await readJsonOptional(profileCredentialsFile(name));
  if (!creds) return null;
  const identity = await readJsonOptional(profileAccountFile(name));
  return { credentials: creds, identity };
}

async function writeProfileSnapshot(
  name: string,
  snapshot: ProviderSnapshot,
): Promise<void> {
  await writeJson(profileCredentialsFile(name), snapshot.credentials, 0o600);
  if (snapshot.identity) {
    await writeJson(profileAccountFile(name), snapshot.identity);
  } else {
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(profileAccountFile(name));
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

export async function listProfiles(
  resolve: ProviderResolver,
): Promise<ProfileInfo[]> {
  await ensureDir(PROFILES_DIR);
  const state = await readState();

  let dirEntries: string[];
  try {
    dirEntries = await readdir(PROFILES_DIR);
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

    const meta = await readJsonOptional<ProfileMeta>(profileMetaFile(name));
    if (!meta) continue;

    const provider = resolve(meta.provider ?? 'claude');
    const snapshot = await readProfileSnapshot(name);
    profiles.push(
      buildProfileInfo(name, meta, state.active === name, snapshot, provider),
    );
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addOAuthProfile(
  name: string,
  provider: Provider,
): Promise<void> {
  const dir = profileDir(name);
  await ensureDir(dir);

  const snapshot = await provider.snapshot();
  if (!snapshot) {
    throw new Error("No OAuth credentials found. Log in with 'claude' first.");
  }

  try {
    await writeProfileSnapshot(name, snapshot);
    await writeJson(profileMetaFile(name), {
      name,
      type: 'oauth',
      provider: provider.name,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    });
    await writeState({ active: name });
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
): Promise<ProfileInfo> {
  if (!(await profileExists(name))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  const state = await readState();
  const targetMeta = await readJsonWithFallback<ProfileMeta>(
    profileMetaFile(name),
    { name, type: 'oauth', provider: 'claude', createdAt: '', lastUsed: null },
  );

  const provider = resolve(targetMeta.provider ?? 'claude');

  // Snapshot current live credentials back to the outgoing profile
  if (
    state.active &&
    state.active !== name &&
    (await profileExists(state.active))
  ) {
    const outgoingMeta = await readJsonWithFallback<ProfileMeta>(
      profileMetaFile(state.active),
      {
        name: state.active,
        type: 'oauth',
        provider: 'claude',
        createdAt: '',
        lastUsed: null,
      },
    );
    const outgoingProvider = resolve(outgoingMeta.provider ?? 'claude');
    const currentSnapshot = await outgoingProvider.snapshot();
    if (currentSnapshot) {
      await writeProfileSnapshot(state.active, currentSnapshot);
    }
  }

  if (targetMeta.type === 'oauth') {
    const targetSnapshot = await readProfileSnapshot(name);
    if (!targetSnapshot) {
      throw new Error(`No credentials found for profile "${name}"`);
    }

    // Capture live state for rollback
    const originalSnapshot = await provider.snapshot();

    try {
      await provider.restore(targetSnapshot);
      targetMeta.lastUsed = new Date().toISOString();
      await writeJson(profileMetaFile(name), targetMeta);
      await writeState({ active: name });
    } catch (error) {
      let rollbackOk = false;
      let rollbackMsg = '';
      try {
        if (originalSnapshot) await provider.restore(originalSnapshot);
        rollbackOk = true;
      } catch (rollbackError) {
        rollbackMsg =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (rollbackOk) {
        throw new Error(
          `Failed to switch to "${name}": ${msg}. Previous credentials restored.`,
        );
      }
      throw new Error(
        `Failed to switch to "${name}": ${msg}. ` +
          `WARNING: Could not restore previous credentials (${rollbackMsg}). Run 'acsw repair' to check state.`,
      );
    }
  } else {
    targetMeta.lastUsed = new Date().toISOString();
    await writeJson(profileMetaFile(name), targetMeta);
    await writeState({ active: name });
  }

  let snapshot: ProviderSnapshot | null = null;
  try {
    snapshot = await readProfileSnapshot(name);
  } catch {
    // Non-fatal: switch succeeded, just can't read back display info
  }

  return buildProfileInfo(name, targetMeta, true, snapshot, provider);
}

export async function removeProfile(
  name: string,
  resolve: ProviderResolver,
): Promise<void> {
  if (!(await profileExists(name))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  const meta = await readJsonOptional<ProfileMeta>(profileMetaFile(name));
  const provider = resolve(meta?.provider ?? 'claude');
  const state = await readState();

  if (state.active === name) {
    await provider.clear();
    await writeState({ active: null });
  }

  await rm(profileDir(name), { recursive: true });
}
