import { readdir, chmod, stat } from 'node:fs/promises';

import type { RepairResult } from '../lib/types';

import {
  PROFILES_DIR,
  PROFILE_NAME_REGEX,
  profileCredentialsFile,
  profileAccountFile,
  profileMetaFile,
} from '../lib/constants';
import { readState } from '../lib/profiles';
import * as ui from '../lib/ui';

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function isValidJson(path: string): Promise<boolean> {
  try {
    await Bun.file(path).json();
    return true;
  } catch {
    return false;
  }
}

export async function repair(): Promise<void> {
  ui.blank();
  ui.info('Checking profiles...');
  ui.blank();

  let dirEntries: string[];
  try {
    dirEntries = await readdir(PROFILES_DIR);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      ui.warn('No profiles directory found. Nothing to repair.');
      ui.blank();
      return;
    }
    throw error;
  }

  const results: RepairResult[] = [];
  let checked = 0;

  for (const entryName of dirEntries) {
    const name = String(entryName);

    // Skip non-profile entries (state.json, .DS_Store, etc.)
    if (!PROFILE_NAME_REGEX.test(name)) continue;

    const credPath = profileCredentialsFile(name);
    const accountPath = profileAccountFile(name);
    const metaPath = profileMetaFile(name);

    if (!(await fileExists(metaPath)) && !(await fileExists(credPath))) {
      continue;
    }

    checked++;

    // Check profile.json
    if (!(await fileExists(metaPath))) {
      results.push({
        profile: name,
        issue: 'Missing profile.json',
        fixed: false,
      });
    } else if (!(await isValidJson(metaPath))) {
      results.push({
        profile: name,
        issue: 'Corrupted profile.json',
        fixed: false,
      });
    }

    // Check credentials.json
    if (await fileExists(credPath)) {
      if (!(await isValidJson(credPath))) {
        results.push({
          profile: name,
          issue: 'Corrupted credentials.json',
          fixed: false,
        });
      } else {
        // Check file permissions
        const st = await stat(credPath);
        const mode = st.mode & 0o777;
        if (mode !== 0o600) {
          try {
            await chmod(credPath, 0o600);
            results.push({
              profile: name,
              issue: `credentials.json had permissions ${mode.toString(8)}, fixed to 600`,
              fixed: true,
            });
          } catch {
            results.push({
              profile: name,
              issue: `credentials.json has permissions ${mode.toString(8)}, could not fix to 600`,
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

    // Check account.json
    if ((await fileExists(accountPath)) && !(await isValidJson(accountPath))) {
      results.push({
        profile: name,
        issue: 'Corrupted account.json',
        fixed: false,
      });
    }
  }

  // Check state.json references a valid profile
  const state = await readState();
  if (state.active && !(await fileExists(profileMetaFile(state.active)))) {
    results.push({
      profile: '(state)',
      issue: `Active profile "${state.active}" no longer exists`,
      fixed: false,
    });
  }

  // Report
  if (results.length === 0) {
    ui.success(`All profiles healthy (${checked} checked)`);
  } else {
    const fixed = results.filter((r) => r.fixed).length;
    const unfixed = results.filter((r) => !r.fixed).length;

    for (const r of results) {
      const icon = r.fixed ? ui.green('fixed') : ui.yellow('issue');
      console.log(`  [${icon}] ${ui.bold(r.profile)}: ${r.issue}`);
    }

    ui.blank();
    if (fixed > 0) ui.success(`Fixed ${fixed} issue(s)`);
    if (unfixed > 0) ui.warn(`${unfixed} issue(s) need manual attention`);
  }

  ui.blank();
}
