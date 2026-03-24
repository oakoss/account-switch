import type {
  OAuthAccount,
  OAuthCredentials,
  Provider,
  ProviderConfig,
  ProviderDisplayInfo,
  ProviderSnapshot,
} from '@lib/types';

import { readOAuthAccount, writeOAuthAccount } from '@lib/config';
import { createCredentialStore } from '@lib/credentials';
import { join } from 'node:path';

type ClaudeSnapshot = {
  credentials: OAuthCredentials;
  identity: OAuthAccount | null;
};

export function createClaudeProvider(config: ProviderConfig): Provider {
  const claudeJson = join(config.homedir, '.claude.json');
  const store = createCredentialStore(config);

  return {
    name: 'claude',

    async snapshot(): Promise<ProviderSnapshot | null> {
      const credentials = await store.read();
      if (!credentials) return null;
      const identity = await readOAuthAccount(claudeJson);
      return { credentials, identity };
    },

    async restore(snap: ProviderSnapshot): Promise<void> {
      const { credentials, identity } = snap as ClaudeSnapshot;
      await store.write(credentials);
      await writeOAuthAccount(identity, claudeJson);
    },

    async clear(): Promise<void> {
      await store.delete();
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
