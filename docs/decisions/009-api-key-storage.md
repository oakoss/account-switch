# 009: API key storage approach

**Status:** Proposed
**Date:** 2026-03-25

## Context

Currently only OAuth subscriptions (Pro/Max/Team/Enterprise) are supported. Claude Code also supports direct API key auth, stored differently:

- **OAuth:** Keychain (macOS) or `~/.claude/.credentials.json` (Linux) + `oauthAccount` in `~/.claude.json`
- **API key:** `ANTHROPIC_API_KEY` in `~/.claude/settings.json` → `env` field (as of 2026-03-25; verify before implementing)

Switching API key profiles requires writing to `settings.json`, which the OAuth flow deliberately avoids. The `CredentialStore` interface is typed to `OAuthCredentials`, so API key storage doesn't fit the existing backend abstraction.

## Decision

Handle API key storage entirely in the Claude provider (`providers/claude.ts`), bypassing `CredentialStore`.

The provider's `snapshot()`/`restore()` already abstract over credential shape. The API key path would read/write `settings.json` directly. `CredentialStore` stays focused on the keychain/file backends it was designed for.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Generalize `CredentialStore<T>` | Requires propagating the generic through the provider; over-engineering for one additional credential type |
| Discriminated union `OAuthCredentials \| ApiKeyCredentials` | Simpler but bleeds API key awareness into all credential backends |
| Use `settings.local.json` | Project-scoped, less invasive, but doesn't survive directory changes |
| Environment variable only | Requires user to source the output; doesn't integrate with shell hook |

The provider would read/write `ANTHROPIC_API_KEY` via the `env` field in `settings.json`.

## Consequences

- `CredentialStore` stays unchanged — no type pollution
- Switching to API key: clear OAuth credentials + `oauthAccount`, set `ANTHROPIC_API_KEY` in `settings.json`
- Switching from API key to OAuth: remove `ANTHROPIC_API_KEY`, restore OAuth credentials + `oauthAccount`
- `settings.json` becomes a write target — the first time the tool modifies it. Risk: other tools or Claude itself may also write to this file concurrently.
