import { unlink } from 'node:fs/promises';

import type { ProfilesConfig, ProviderSnapshot } from './types';

import { isENOENT, readJsonOptional, writeJson } from './fs';
import { profilePaths } from './paths';

export async function readProfileSnapshot(
  config: ProfilesConfig,
  name: string,
): Promise<ProviderSnapshot | null> {
  const { credentials, account } = profilePaths(config.profilesDir, name);
  const creds = await readJsonOptional(credentials);
  if (!creds) return null;
  const identity = await readJsonOptional(account);
  return { credentials: creds, identity };
}

export async function writeProfileSnapshot(
  config: ProfilesConfig,
  name: string,
  snapshot: ProviderSnapshot,
): Promise<void> {
  const { credentials, account } = profilePaths(config.profilesDir, name);
  await writeJson(credentials, snapshot.credentials, 0o600);
  if (snapshot.identity) {
    await writeJson(account, snapshot.identity);
  } else {
    try {
      await unlink(account);
    } catch (error: unknown) {
      if (isENOENT(error)) return;
      throw error;
    }
  }
}
