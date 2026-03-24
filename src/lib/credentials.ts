import { join } from 'node:path';

import type { CredentialStore } from './credentials/types';
import type { ProviderConfig } from './types';

import { createFileStore } from './credentials/file';
import { createKeychainStore } from './credentials/keychain';

export type { CredentialStore } from './credentials/types';

export function createCredentialStore(config: ProviderConfig): CredentialStore {
  if (config.platform === 'darwin') {
    return createKeychainStore();
  }
  const credentialsFile = join(config.homedir, '.claude', '.credentials.json');
  return createFileStore(credentialsFile);
}
