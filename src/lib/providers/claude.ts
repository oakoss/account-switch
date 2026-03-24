import type {
  OAuthAccount,
  OAuthCredentials,
  Provider,
  ProviderConfig,
  ProviderDisplayInfo,
  ProviderSnapshot,
} from '@lib/types';

import { readOAuthAccount, writeOAuthAccount } from '@lib/config';
import {
  readCredentials,
  writeCredentials,
  deleteCredentials,
} from '@lib/credentials';
import { join } from 'node:path';

type ClaudeSnapshot = {
  credentials: OAuthCredentials;
  identity: OAuthAccount | null;
};

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
      const { credentials, identity } = snap as ClaudeSnapshot;
      await (isMacOS
        ? writeCredentials(credentials)
        : writeCredentials(credentials, credentialsFile));
      await writeOAuthAccount(identity, claudeJson);
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
      const { credentials, identity } = snap as ClaudeSnapshot;
      return {
        label: identity?.emailAddress ?? null,
        context: identity?.organizationName ?? null,
        tier: credentials?.claudeAiOauth?.subscriptionType ?? null,
      };
    },
  };
}
