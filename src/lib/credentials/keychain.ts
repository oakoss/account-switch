import type { OAuthCredentials } from '@lib/types';

import { KEYCHAIN_SERVICE, getKeychainAccount } from '@lib/constants';
import { exec } from '@lib/spawn';

import type { CredentialStore } from './types';

function detectKeychainFormat(raw: string): 'json' | 'hex' {
  return raw.trimStart().startsWith('{') ? 'json' : 'hex';
}

export function createKeychainStore(): CredentialStore {
  return {
    async read(): Promise<OAuthCredentials | null> {
      const {
        stdout: raw,
        stderr,
        exitCode,
      } = await exec([
        'security',
        'find-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        getKeychainAccount(),
        '-w',
      ]);

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
      const { stdout: existingRaw, exitCode: existingCode } = await exec([
        'security',
        'find-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        account,
        '-w',
      ]);
      if (existingCode === 0) {
        format = detectKeychainFormat(existingRaw);
      }

      const json = JSON.stringify(creds);
      const value =
        format === 'hex' ? Buffer.from(json, 'utf8').toString('hex') : json;

      const { stderr: delErr, exitCode: delCode } = await exec([
        'security',
        'delete-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        account,
      ]);
      if (delCode !== 0 && delCode !== 44) {
        throw new Error(
          `Failed to delete existing keychain entry (exit ${delCode}): ${delErr}`,
        );
      }

      const { stderr: addErr, exitCode: addCode } = await exec([
        'security',
        'add-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        account,
        '-w',
        value,
      ]);
      if (addCode !== 0) {
        throw new Error(
          `Failed to write credentials to macOS Keychain (exit ${addCode}): ${addErr}`,
        );
      }
    },

    async delete(): Promise<void> {
      const { stderr, exitCode } = await exec([
        'security',
        'delete-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        getKeychainAccount(),
      ]);
      if (exitCode !== 0 && exitCode !== 44) {
        throw new Error(
          `Failed to delete keychain entry (exit ${exitCode}): ${stderr}`,
        );
      }
    },
  };
}
