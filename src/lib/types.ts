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
