# account-switch (acsw)

CLI tool for switching between Claude Code OAuth accounts. Package name: `account-switch`, binary: `acsw`.

## Architecture

Credential storage is abstracted behind a `Provider` interface (`src/lib/providers/`). Each provider implements `snapshot()`, `restore()`, `clear()`, and `displayInfo()`. The profile layer (`profiles.ts`) orchestrates switching via opaque snapshots without knowing provider-specific storage details.

The Claude provider (`providers/claude.ts`) swaps two things:
1. **OAuth credentials** — macOS Keychain (via `security` CLI) or `~/.claude/.credentials.json` on Linux
2. **`oauthAccount` field** in `~/.claude.json`

It never touches `settings.json`, `settings.local.json`, memory, plugins, or project config.

Profiles are stored in `~/.acsw/` with one directory per profile containing `credentials.json`, `account.json`, and `profile.json`. `ProviderConfig` (platform, homedir, env) is injected into providers for testability.

### Key invariants

- `switchProfile()` snapshots current credentials before overwriting and rolls back on failure
- `profileDir()` validates names against `PROFILE_NAME_REGEX` to prevent path traversal
- All JSON writes use atomic temp-file-then-rename pattern
- Credential files are `chmod 600`
- Keychain reads consume stdout/stderr before awaiting exit to avoid pipe deadlock
- Provider `clear()` runs before state updates to avoid corrupted state on failure

## Commands

```
pnpm install          # install deps
pnpm dev -- <cmd>     # run from source (e.g., pnpm dev -- list)
pnpm test             # run tests
pnpm lint             # oxlint with oxlintrc.json config
pnpm format           # oxfmt
pnpm format:check     # oxfmt --check
pnpm lint:md          # markdownlint
pnpm check-pkg        # build + publint + attw
pnpm build            # compile standalone binary to dist/acsw
```

## Code conventions

- **Runtime:** Bun — use `Bun.file()`, `Bun.write()`, `Bun.spawn()` instead of Node equivalents
- **Imports:** Use `node:` protocol for Node builtins (`node:fs`, `node:path`, `node:os`)
- **Error handling:** Never silently swallow errors. Return `null` only for "file doesn't exist". Throw on corruption, permission errors, or unexpected failures. Use ENOENT-specific catches, not bare `catch {}`.
- **Temp file cleanup:** Every write that uses a `.tmp` file must clean it up in the catch block
- **Spawn pattern:** Always read stdout/stderr before `await proc.exited` to avoid pipe deadlock
- **No runtime dependencies** — all output uses raw ANSI codes, no chalk/inquirer/commander

## Testing

Tests use `bun:test`. Mock provider factories (`createMockProvider`, `createFailingProvider`) are available in `tests/profiles.test.ts` for testing profile operations without filesystem or Keychain access. Integration tests for exported functions are tracked in docs/improvements.md.

## CI/CD

- **CI:** `.github/workflows/ci.yml` — static analysis, tests, package validation (parallel jobs with summary)
- **Release:** `.github/workflows/release.yml` — changesets action creates version PRs, publishes to npm via OIDC on merge
- **CodeQL:** `.github/workflows/codeql.yml` — security scanning (JS/TS + Actions)
- **Hooks:** lefthook runs oxlint, oxfmt, markdownlint on pre-commit and commitlint on commit-msg
