import type { OAuthCredentials } from '@lib/types';

import { KEYCHAIN_SERVICE, getKeychainAccount } from '@lib/constants';

import type { CredentialStore } from './types';

function detectKeychainFormat(raw: string): 'json' | 'hex' {
  return raw.trimStart().startsWith('{') ? 'json' : 'hex';
}

export function createKeychainStore(): CredentialStore {
  return {
    async read(): Promise<OAuthCredentials | null> {
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
    },

    async write(creds: OAuthCredentials): Promise<void> {
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
      await new Response(existing.stderr).text();
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
    },

    async delete(): Promise<void> {
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
    },
  };
}
