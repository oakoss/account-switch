import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { OAuthCredentials } from './types';

import {
  KEYCHAIN_SERVICE,
  CREDENTIALS_FILE,
  getKeychainAccount,
} from './constants';

const IS_MACOS = process.platform === 'darwin';

function detectKeychainFormat(raw: string): 'json' | 'hex' {
  return raw.trimStart().startsWith('{') ? 'json' : 'hex';
}

async function readKeychain(): Promise<OAuthCredentials | null> {
  const proc = Bun.spawn(
    [
      'security',
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      getKeychainAccount(),
      '-w',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  // Read stdout before awaiting exit to avoid pipe closure race
  const raw = (await new Response(proc.stdout).text()).trim();
  const stderr = (await new Response(proc.stderr).text()).trim();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    if (stderr.includes('could not be found')) return null;
    if (exitCode === 44) return null;
    throw new Error(`Keychain read failed (exit ${exitCode}): ${stderr}`);
  }

  try {
    if (detectKeychainFormat(raw) === 'json') {
      return JSON.parse(raw) as OAuthCredentials;
    }
    const json = Buffer.from(raw, 'hex').toString('utf8');
    return JSON.parse(json) as OAuthCredentials;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Found credentials in keychain but failed to parse them: ${msg}. ` +
        `Try 'claude logout' and re-authenticate.`,
    );
  }
}

async function writeKeychain(creds: OAuthCredentials): Promise<void> {
  const account = getKeychainAccount();

  let format: 'json' | 'hex' = 'json';
  const existing = Bun.spawn(
    [
      'security',
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account,
      '-w',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const existingRaw = (await new Response(existing.stdout).text()).trim();
  const existingCode = await existing.exited;
  if (existingCode === 0) {
    format = detectKeychainFormat(existingRaw);
  }

  const json = JSON.stringify(creds);
  const value =
    format === 'hex' ? Buffer.from(json, 'utf8').toString('hex') : json;

  const del = Bun.spawn(
    [
      'security',
      'delete-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const delErr = (await new Response(del.stderr).text()).trim();
  const delCode = await del.exited;
  if (delCode !== 0 && delCode !== 44) {
    throw new Error(
      `Failed to delete existing keychain entry (exit ${delCode}): ${delErr}`,
    );
  }

  const add = Bun.spawn(
    [
      'security',
      'add-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account,
      '-w',
      value,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const addErr = (await new Response(add.stderr).text()).trim();
  const exitCode = await add.exited;
  if (exitCode !== 0) {
    throw new Error(
      `Failed to write credentials to macOS Keychain (exit ${exitCode}): ${addErr}`,
    );
  }
}

async function deleteKeychain(): Promise<void> {
  const proc = Bun.spawn(
    [
      'security',
      'delete-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      getKeychainAccount(),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const stderr = (await new Response(proc.stderr).text()).trim();
  const exitCode = await proc.exited;
  if (exitCode !== 0 && exitCode !== 44) {
    throw new Error(
      `Failed to delete keychain entry (exit ${exitCode}): ${stderr}`,
    );
  }
}

async function readCredentialsFile(
  path: string,
): Promise<OAuthCredentials | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as OAuthCredentials;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Credentials file exists at ${path} but could not be read: ${msg}`,
    );
  }
}

async function writeCredentialsFile(
  creds: OAuthCredentials,
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  try {
    await Bun.write(tmpPath, JSON.stringify(creds, null, 2));
    const { chmodSync, renameSync } = await import('node:fs');
    chmodSync(tmpPath, 0o600);
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

export async function readCredentials(
  path?: string,
): Promise<OAuthCredentials | null> {
  if (path && path !== CREDENTIALS_FILE) {
    return readCredentialsFile(path);
  }
  if (IS_MACOS) {
    return readKeychain();
  }
  return readCredentialsFile(CREDENTIALS_FILE);
}

export async function writeCredentials(
  creds: OAuthCredentials,
  path?: string,
): Promise<void> {
  if (path && path !== CREDENTIALS_FILE) {
    return writeCredentialsFile(creds, path);
  }
  if (IS_MACOS) {
    return writeKeychain(creds);
  }
  return writeCredentialsFile(creds, CREDENTIALS_FILE);
}

export async function deleteCredentials(path?: string): Promise<void> {
  if ((!path || path === CREDENTIALS_FILE) && IS_MACOS) {
    return deleteKeychain();
  }
  const targetPath = path ?? CREDENTIALS_FILE;
  const { unlink } = await import('node:fs/promises');
  try {
    await unlink(targetPath);
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

export async function copyCredentials(
  fromPath: string,
  toPath: string,
): Promise<void> {
  const creds = await readCredentials(fromPath);
  if (!creds) throw new Error(`No credentials found at ${fromPath}`);
  await writeCredentials(creds, toPath);
}
