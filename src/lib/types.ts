export type OAuthCredentials = {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
};

export type OAuthAccount = {
  accountUuid?: string;
  emailAddress?: string;
  organizationUuid?: string;
  displayName?: string;
  organizationRole?: string;
  organizationName?: string;
  workspaceRole?: string | null;
  billingType?: string;
  hasExtraUsageEnabled?: boolean;
  accountCreatedAt?: string;
  subscriptionCreatedAt?: string;
  [key: string]: unknown;
};

export type ProfileType = 'oauth' | 'api-key';

export type ProfileMeta = {
  name: string;
  type: ProfileType;
  provider: string;
  createdAt: string;
  lastUsed: string | null;
};

export type ProfileState = { active: string | null };

export type ProfileInfo = {
  name: string;
  type: ProfileType;
  email: string | null;
  subscriptionType: string | null;
  organizationName: string | null;
  isActive: boolean;
  lastUsed: string | null;
};

export type RepairResult = { profile: string; issue: string; fixed: boolean };

export type ProfilesConfig = { profilesDir: string; stateFile: string };

export type RepairConfig = ProfilesConfig;

export type RepairSummary = { results: RepairResult[]; checked: number };

export type ProviderSnapshot = { credentials: unknown; identity: unknown };

export type ProviderDisplayInfo = {
  label: string | null;
  context: string | null;
  tier: string | null;
};

export type ProviderConfig = {
  platform: NodeJS.Platform;
  homedir: string;
  env: Record<string, string | undefined>;
};

export type Provider = {
  readonly name: string;
  snapshot(): Promise<ProviderSnapshot | null>;
  restore(snapshot: ProviderSnapshot): Promise<void>;
  clear(): Promise<void>;
  displayInfo(snapshot: ProviderSnapshot): ProviderDisplayInfo;
};

export type ProviderResolver = (name: string) => Provider;
