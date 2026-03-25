import type { OAuthCredentials } from '@lib/types';

import { isENOENT, writeJsonSecure } from '@lib/fs';
import { unlink } from 'node:fs/promises';

import type { CredentialStore } from './types';

export function createFileStore(path: string): CredentialStore {
  return {
    async read(): Promise<OAuthCredentials | null> {
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
    },

    async write(creds: OAuthCredentials): Promise<void> {
      await writeJsonSecure(path, creds);
    },

    async delete(): Promise<void> {
      try {
        await unlink(path);
      } catch (error: unknown) {
        if (isENOENT(error)) return;
        throw error;
      }
    },
  };
}
