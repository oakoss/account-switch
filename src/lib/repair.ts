import { readdir, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { RepairConfig, RepairResult, RepairSummary } from './types';

import { PROFILES_DIR, PROFILE_NAME_REGEX, STATE_FILE } from './constants';
import { readState } from './profiles';

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function isValidJson(path: string): Promise<boolean> {
  try {
    await Bun.file(path).json();
    return true;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

function profilePaths(profilesDir: string, name: string) {
  if (!PROFILE_NAME_REGEX.test(name)) {
    throw new Error(`Invalid profile name: "${name}"`);
  }
  const dir = join(profilesDir, name);
  return {
    credentials: join(dir, 'credentials.json'),
    account: join(dir, 'account.json'),
    meta: join(dir, 'profile.json'),
  };
}

async function checkProfile(
  profilesDir: string,
  name: string,
): Promise<RepairResult[]> {
  const { credentials, account, meta } = profilePaths(profilesDir, name);
  const results: RepairResult[] = [];

  if (!(await fileExists(meta))) {
    results.push({
      profile: name,
      issue: 'Missing profile.json',
      fixed: false,
    });
  } else if (!(await isValidJson(meta))) {
    results.push({
      profile: name,
      issue: 'Corrupted profile.json',
      fixed: false,
    });
  }

  if (await fileExists(credentials)) {
    if (!(await isValidJson(credentials))) {
      results.push({
        profile: name,
        issue: 'Corrupted credentials.json',
        fixed: false,
      });
    } else {
      let st;
      try {
        st = await stat(credentials);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({
          profile: name,
          issue: `Could not stat credentials.json: ${msg}`,
          fixed: false,
        });
        return results;
      }
      const mode = st.mode & 0o777;
      if (mode !== 0o600) {
        try {
          await chmod(credentials, 0o600);
          results.push({
            profile: name,
            issue: `credentials.json had permissions ${mode.toString(8)}, fixed to 600`,
            fixed: true,
          });
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'unknown error';
          results.push({
            profile: name,
            issue: `credentials.json has permissions ${mode.toString(8)}, could not fix to 600: ${msg}`,
            fixed: false,
          });
        }
      }
    }
  } else {
    results.push({
      profile: name,
      issue: 'Missing credentials.json',
      fixed: false,
    });
  }

  if ((await fileExists(account)) && !(await isValidJson(account))) {
    results.push({
      profile: name,
      issue: 'Corrupted account.json',
      fixed: false,
    });
  }

  return results;
}

export async function repairProfiles(
  config?: RepairConfig,
): Promise<RepairSummary> {
  const profilesDir = config?.profilesDir ?? PROFILES_DIR;
  const stateFile = config?.stateFile ?? STATE_FILE;

  let dirEntries: string[];
  try {
    dirEntries = await readdir(profilesDir);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return { results: [], checked: 0 };
    throw error;
  }

  const results: RepairResult[] = [];
  let checked = 0;

  for (const entryName of dirEntries) {
    const name = String(entryName);
    if (!PROFILE_NAME_REGEX.test(name)) continue;

    const { meta, credentials } = profilePaths(profilesDir, name);
    if (!(await fileExists(meta)) && !(await fileExists(credentials))) continue;

    checked++;
    const profileResults = await checkProfile(profilesDir, name);
    results.push(...profileResults);
  }

  let state;
  try {
    state = await readState(stateFile);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({
      profile: '(state)',
      issue: `Could not read state file: ${msg}`,
      fixed: false,
    });
    return { results, checked };
  }

  if (state.active) {
    const { meta } = profilePaths(profilesDir, state.active);
    if (!(await fileExists(meta))) {
      results.push({
        profile: '(state)',
        issue: `Active profile "${state.active}" no longer exists`,
        fixed: false,
      });
    }
  }

  return { results, checked };
}
