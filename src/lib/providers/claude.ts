import { join } from 'node:path';

import type {
  OAuthAccount,
  OAuthCredentials,
  Provider,
  ProviderConfig,
  ProviderDisplayInfo,
  ProviderSnapshot,
} from '../types';

import { readOAuthAccount, writeOAuthAccount } from '../config';
import {
  readCredentials,
  writeCredentials,
  deleteCredentials,
} from '../credentials';

export function createClaudeProvider(config: ProviderConfig): Provider {
  const claudeDir = join(config.homedir, '.claude');
  const claudeJson = join(config.homedir, '.claude.json');
  const credentialsFile = join(claudeDir, '.credentials.json');
  const isMacOS = config.platform === 'darwin';

  return {
    name: 'claude',

    async snapshot(): Promise<ProviderSnapshot | null> {
      // On macOS, readCredentials() reads from Keychain (ignores path).
      // On Linux, we pass the computed path.
      const credentials = isMacOS
        ? await readCredentials()
        : await readCredentials(credentialsFile);
      if (!credentials) return null;
      const identity = await readOAuthAccount(claudeJson);
      return { credentials, identity };
    },

    async restore(snap: ProviderSnapshot): Promise<void> {
      const creds = snap.credentials as OAuthCredentials;
      await (isMacOS
        ? writeCredentials(creds)
        : writeCredentials(creds, credentialsFile));
      await writeOAuthAccount(snap.identity as OAuthAccount | null, claudeJson);
    },

    async clear(): Promise<void> {
      await (isMacOS
        ? deleteCredentials()
        : deleteCredentials(credentialsFile));
      try {
        await writeOAuthAccount(null, claudeJson);
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (!msg.includes('not found')) throw error;
      }
    },

    displayInfo(snap: ProviderSnapshot): ProviderDisplayInfo {
      const creds = snap.credentials as OAuthCredentials | null;
      const account = snap.identity as OAuthAccount | null;
      return {
        label: account?.emailAddress ?? null,
        context: account?.organizationName ?? null,
        tier: creds?.claudeAiOauth?.subscriptionType ?? null,
      };
    },
  };
}
