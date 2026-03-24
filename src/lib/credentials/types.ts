import type { OAuthCredentials } from '@lib/types';

export type CredentialStore = {
  read(): Promise<OAuthCredentials | null>;
  write(creds: OAuthCredentials): Promise<void>;
  delete(): Promise<void>;
};
