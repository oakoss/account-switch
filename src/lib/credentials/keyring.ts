import type { OAuthCredentials } from '@lib/types';

import { KEYRING_SERVICE, getKeyringAccount } from '@lib/constants';
import { Entry } from '@napi-rs/keyring';

import type { CredentialStore } from './types';

export type KeyringEntry = {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
};

function detectFormat(raw: string): 'json' | 'hex' {
  return raw.trimStart().startsWith('{') ? 'json' : 'hex';
}

function defaultEntry(): KeyringEntry {
  return new Entry(KEYRING_SERVICE, getKeyringAccount());
}

export function createKeyringStore(entry?: KeyringEntry): CredentialStore {
  const e = entry ?? defaultEntry();

  return {
    async read(): Promise<OAuthCredentials | null> {
      let raw: string | null;
      try {
        raw = e.getPassword();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read credentials from keyring: ${msg}`);
      }
      if (!raw) return null;

      try {
        if (detectFormat(raw) === 'json') {
          return JSON.parse(raw) as OAuthCredentials;
        }
        const json = Buffer.from(raw, 'hex').toString('utf8');
        return JSON.parse(json) as OAuthCredentials;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Found credentials in keyring but failed to parse them: ${msg}. ` +
            `Try 'claude logout' and re-authenticate.`,
        );
      }
    },

    async write(creds: OAuthCredentials): Promise<void> {
      let format: 'json' | 'hex' = 'json';
      try {
        const existing = e.getPassword();
        if (existing) {
          format = detectFormat(existing);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to read existing credentials from keyring: ${msg}`,
        );
      }

      const json = JSON.stringify(creds);
      const value =
        format === 'hex' ? Buffer.from(json, 'utf8').toString('hex') : json;

      try {
        e.setPassword(value);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to write credentials to keyring: ${msg}`);
      }
    },

    async delete(): Promise<void> {
      try {
        e.deletePassword();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to delete credentials from keyring: ${msg}`);
      }
    },
  };
}
