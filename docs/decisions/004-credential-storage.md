# 004: Credential storage abstraction

**Status:** Accepted
**Date:** 2026-03-24

## Context

Claude Code stores OAuth credentials differently per platform: macOS Keychain on macOS, `~/.claude/.credentials.json` on Linux. The tool needs to read and write these credentials without the provider layer knowing which backend is in use.

## Decision

Extract a `CredentialStore` interface with platform-specific backends:

```typescript
type CredentialStore = {
  read(): Promise<OAuthCredentials | null>;
  write(creds: OAuthCredentials): Promise<void>;
  delete(): Promise<void>;
};
```

Backends:

- `keyring.ts` — system keyring via `@napi-rs/keyring` (macOS Keychain, Windows Credential Vault)
- `file.ts` — file-based with atomic write and `chmod 600`

Backend selection is in `src/lib/credentials.ts` based on `ProviderConfig.platform`: keyring for macOS/Windows, file for Linux.

## Alternatives considered

| Option                             | Why not                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Single backend (file only)         | Loses macOS Keychain encryption; credentials at rest in plaintext              |
| keytar / @github/keytar            | Archived or requires node-gyp build step (see [001](001-dependency-policy.md)) |
| Inline platform checks in provider | Spreads platform logic across providers; blocks testing                        |

## Consequences

- New platforms add a new backend implementation (~30–140 lines) without touching existing code
- The interface is typed to `OAuthCredentials` — API key support will need a different approach (see [009](009-api-key-storage.md))
- `@napi-rs/keyring` can replace the macOS backend and add Windows/Linux in one change (see [006](006-cross-platform-keyring.md))
