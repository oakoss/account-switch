# account-switch (acsw)

CLI tool for switching between Claude Code OAuth accounts. Package name: `account-switch`, binary: `acsw`.

## Architecture

Credential storage is abstracted in two layers:

- **`Provider`** (`src/lib/providers/`) — high-level interface for snapshot/restore of full profile state (credentials + identity). The profile layer (`profiles.ts`) orchestrates switching via opaque snapshots without knowing provider-specific storage details.
- **`CredentialStore`** (`src/lib/credentials/types.ts`) — low-level interface used *within* providers for platform-specific credential I/O. Backends: `keychain.ts` (macOS via `security` CLI) and `file.ts` (Linux via `~/.claude/.credentials.json`). Selected based on `ProviderConfig.platform`.

The Claude provider (`providers/claude.ts`) swaps two things:
1. **OAuth credentials** — via the appropriate `CredentialStore` backend
2. **`oauthAccount` field** in `~/.claude.json`

It never touches `settings.json`, `settings.local.json`, memory, plugins, or project config.

Profiles are stored in `~/.acsw/` with one directory per profile containing `credentials.json`, `account.json`, and `profile.json`. `ProviderConfig` (platform, homedir, env) is injected into providers for testability.

Shared file utilities (atomic JSON write, safe JSON reads with fallback/optional semantics) live in `src/lib/fs.ts`.

The `env` command (`src/commands/env.ts`) provides shell hook integration for auto-switching profiles on `cd`. It walks up directories looking for `.acswrc` files (`{ "profile": "work" }`), validates the config structure, and switches via `switchProfile`. Since the hook runs on every `cd`, all errors are caught and surfaced via `ui.error` with `process.exitCode = 1` — never raw stack traces.

Profile validation and repair logic lives in `src/lib/repair.ts`, accepting a `RepairConfig` (profilesDir, stateFile) for testability. The `repair` command (`src/commands/repair.ts`) is a thin display wrapper.

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
- **Imports:** Use `node:` protocol for Node builtins (`node:fs`, `node:path`, `node:os`). Use `@lib/` and `@commands/` aliases for cross-directory imports; use `./` relative imports for same-directory siblings
- **Error handling:** Never silently swallow errors. Return `null` only for "file doesn't exist". Throw on corruption, permission errors, or unexpected failures. Use ENOENT-specific catches, not bare `catch {}`.
- **Temp file cleanup:** Every write that uses a `.tmp` file must clean it up in the catch block
- **Spawn pattern:** Always read stdout/stderr before `await proc.exited` to avoid pipe deadlock
- **CLI framework:** citty for arg parsing and subcommands; `@clack/prompts` for interactive UI. Output and prompts are abstracted behind `OutputAdapter`/`PromptAdapter` types in `src/lib/ui/types.ts` — the `@lib/ui` facade wires the clack implementation but can be swapped by changing one import
- **Minimal runtime dependencies** — only citty and `@clack/prompts`; no chalk/inquirer/commander

## Testing

Tests use `bun:test`. Mock provider factories (`createMockProvider`, `createFailingProvider`, `mockResolver`) are shared in `tests/helpers/mock-providers.ts` for testing profile operations without filesystem or Keychain access. Integration tests for exported functions are tracked in docs/improvements.md.

## CI/CD

- **CI:** `.github/workflows/ci.yml` — static analysis, tests, package validation (parallel jobs with summary)
- **Release:** `.github/workflows/release.yml` — changesets action creates version PRs, publishes to npm via OIDC on merge
- **CodeQL:** `.github/workflows/codeql.yml` — security scanning (JS/TS + Actions)
- **Hooks:** lefthook runs oxlint, oxfmt, markdownlint on pre-commit and commitlint on commit-msg
