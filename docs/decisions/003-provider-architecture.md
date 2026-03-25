# 003: Provider snapshot/restore architecture

**Status:** Accepted
**Date:** 2026-03-24

## Context

Different CLI tools store credentials and identity in different locations and formats. The profile layer needs to switch between saved states without knowing provider-specific details. Switching must be atomic — if restore fails, the previous state should be recoverable.

## Decision

Use a **snapshot/restore** pattern. Each provider bundles credentials + identity into an opaque snapshot:

```typescript
type Provider = {
  readonly name: string
  snapshot(): Promise<ProviderSnapshot | null>
  restore(snapshot: ProviderSnapshot): Promise<void>
  clear(): Promise<void>
  displayInfo(snapshot: ProviderSnapshot): ProviderDisplayInfo
}

type ProviderSnapshot = { credentials: unknown; identity: unknown }
```

`ProviderConfig` (platform, homedir, env) is injected for testability. Providers are registered in `src/lib/providers/registry.ts` with a caching resolver.

The profile layer (`profiles.ts`) snapshots the outgoing profile before restoring the incoming one, enabling rollback on failure.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Direct file manipulation per provider | No abstraction — every switch path needs provider-specific code |
| Per-provider switch functions | No rollback semantics, no uniform interface for the profile layer |
| Generic `Provider<T>` with typed snapshots | TypeScript variance on `restore()` parameter blocks this cleanly. Using `unknown` + boundary cast instead. |

## Consequences

- New providers are ~50 lines (implement 4 methods)
- Atomic switching with rollback is handled once in `profiles.ts`, not per-provider
- `ProviderSnapshot` fields are `unknown` — each provider casts internally (e.g., `snap as ClaudeSnapshot`). No compile-time type safety at the snapshot boundary.
