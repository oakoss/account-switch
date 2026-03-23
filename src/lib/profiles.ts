import { mkdir, readdir, rm, chmod } from 'node:fs/promises';

import type {
  ProfileState,
  ProfileMeta,
  ProfileInfo,
  OAuthAccount,
  OAuthCredentials,
} from './types';

import { readOAuthAccount, writeOAuthAccount } from './config';
import {
  PROFILES_DIR,
  STATE_FILE,
  PROFILE_NAME_REGEX,
  profileDir,
  profileCredentialsFile,
  profileAccountFile,
  profileMetaFile,
} from './constants';
import {
  readCredentials,
  writeCredentials,
  deleteCredentials,
} from './credentials';

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

export async function readState(): Promise<ProfileState> {
  return readJsonWithFallback<ProfileState>(STATE_FILE, { active: null });
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
  account: OAuthAccount | null,
  creds: OAuthCredentials | null,
  isActive: boolean,
): ProfileInfo {
  return {
    name,
    type: meta.type,
    email: account?.emailAddress ?? null,
    subscriptionType: creds?.claudeAiOauth?.subscriptionType ?? null,
    organizationName: account?.organizationName ?? null,
    isActive,
    lastUsed: meta.lastUsed,
  };
}

export async function listProfiles(): Promise<ProfileInfo[]> {
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

    const account = await readJsonOptional<OAuthAccount>(
      profileAccountFile(name),
    );
    let creds: OAuthCredentials | null = null;
    if (meta.type === 'oauth') {
      creds = await readJsonOptional<OAuthCredentials>(
        profileCredentialsFile(name),
      );
    }

    profiles.push(
      buildProfileInfo(name, meta, account, creds, state.active === name),
    );
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addOAuthProfile(name: string): Promise<void> {
  const dir = profileDir(name);
  await ensureDir(dir);

  const creds = await readCredentials();
  if (!creds) {
    throw new Error("No OAuth credentials found. Log in with 'claude' first.");
  }

  const account = await readOAuthAccount();

  try {
    await writeJson(profileCredentialsFile(name), creds, 0o600);
    if (account) {
      await writeJson(profileAccountFile(name), account);
    }
    await writeJson(profileMetaFile(name), {
      name,
      type: 'oauth',
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

export async function switchProfile(name: string): Promise<ProfileInfo> {
  if (!(await profileExists(name))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  const state = await readState();
  const targetMeta = await readJsonWithFallback<ProfileMeta>(
    profileMetaFile(name),
    { name, type: 'oauth', createdAt: '', lastUsed: null },
  );

  if (
    state.active &&
    state.active !== name &&
    (await profileExists(state.active))
  ) {
    const currentCreds = await readCredentials();
    if (currentCreds) {
      await writeJson(
        profileCredentialsFile(state.active),
        currentCreds,
        0o600,
      );
    }
    const currentAccount = await readOAuthAccount();
    if (currentAccount) {
      await writeJson(profileAccountFile(state.active), currentAccount);
    }
  }

  if (targetMeta.type === 'oauth') {
    const targetCreds = await readJsonOptional<OAuthCredentials>(
      profileCredentialsFile(name),
    );
    if (!targetCreds) {
      throw new Error(`No credentials found for profile "${name}"`);
    }

    const originalCreds = await readCredentials();
    const originalAccount = await readOAuthAccount();

    try {
      await writeCredentials(targetCreds);
      const targetAccount = await readJsonOptional<OAuthAccount>(
        profileAccountFile(name),
      );
      await writeOAuthAccount(targetAccount);
      targetMeta.lastUsed = new Date().toISOString();
      await writeJson(profileMetaFile(name), targetMeta);
      await writeState({ active: name });
    } catch (error) {
      let rollbackOk = false;
      let rollbackMsg = '';
      try {
        if (originalCreds) await writeCredentials(originalCreds);
        await writeOAuthAccount(originalAccount);
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

  let account: OAuthAccount | null = null;
  let creds: OAuthCredentials | null = null;
  try {
    account = await readJsonOptional<OAuthAccount>(profileAccountFile(name));
    creds = await readJsonOptional<OAuthCredentials>(
      profileCredentialsFile(name),
    );
  } catch {
    // Non-fatal: switch succeeded, just can't read back display info
  }

  return buildProfileInfo(name, targetMeta, account, creds, true);
}

export async function removeProfile(name: string): Promise<void> {
  if (!(await profileExists(name))) {
    throw new Error(`Profile "${name}" does not exist`);
  }

  const state = await readState();

  if (state.active === name) {
    await writeState({ active: null });
    await deleteCredentials();
    try {
      await writeOAuthAccount(null);
    } catch {
      // ~/.claude.json may not exist — non-fatal during removal
    }
  }

  await rm(profileDir(name), { recursive: true });
}
