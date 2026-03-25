# 006: Cross-platform keyring via @napi-rs/keyring

**Status:** Accepted
**Date:** 2026-03-24

## Context

The macOS Keychain backend (`keychain.ts`) shells out to the `security` CLI — 1 `exec()` call per read, 3 for write. This approach is macOS-only. Windows and Linux need their own credential storage.

## Decision

Adopt `@napi-rs/keyring` to replace platform-specific credential backends with a single implementation.

| Attribute  | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| Downloads  | ~286K/week                                                         |
| Deps       | Zero runtime (platform binaries as optional deps)                  |
| Size       | Core 35 KB + one ~450 KB platform binary                           |
| Build step | None — ships prebuilt NAPI-RS binaries for 12 platform/arch combos |
| Bun compat | Strong — Bun N-API at 95%, NAPI-RS is the recommended native path  |
| Maintainer | Brooooooklyn (Long Yinan), NAPI-RS ecosystem author                |

**API:** `new Entry(service, account)` → `.getPassword()`, `.setPassword()`, `.deletePassword()`

**Compatibility spike (2026-03-24):**

- Interpreted (`bun run`): all operations pass
- Compiled (`bun build --compile`): all operations pass
- Cross-verified via `security find-generic-password` — compiled binary writes to real macOS Keychain
- Binary size impact: +1 MB (58 → 59 MB)
- `getPassword()` returns `null` after delete (aligns with `CredentialStore` interface)

## Alternatives considered

| Option           | Why not                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| `keytar`         | Archived by Atom in 2022, no security patches                                 |
| `@github/keytar` | Requires node-gyp + C++ compiler at install time                              |
| `keychain` (npm) | macOS only, shells out to `security` (same as current approach)               |
| `cross-keychain` | Too immature (~1.2K downloads/week, 9 GitHub stars), leaks CLI framework deps |

## Consequences

- Will replace 141-line `keychain.ts` with ~30-line `keyring.ts` backend
- Unifies macOS/Windows/Linux behind a single `CredentialStore` implementation
- File-based fallback remains for headless Linux without D-Bus/libsecret
- Contained change — the `CredentialStore` interface is already the right seam
- Adds the third runtime dependency (after citty and @clack/prompts)
