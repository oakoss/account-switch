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

The `env` command auto-switches profiles on `cd` by walking up directories for `.acswrc` files; pure lookup and validation logic lives in `src/lib/env.ts`, orchestration in `src/commands/env.ts`.

Profile validation and repair logic lives in `src/lib/repair.ts`, accepting a `RepairConfig` for testability. The `repair` command is a thin display wrapper.

### Key invariants

- `switchProfile()` snapshots current credentials before overwriting and rolls back on failure
- `profilePaths()` validates names against `PROFILE_NAME_REGEX` to prevent path traversal
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

See [docs/coding-standards.md](docs/coding-standards.md) for full patterns and examples.

Key rules:
- **Runtime:** Bun — use `Bun.file()`, `Bun.write()`, `Bun.spawn()` instead of Node equivalents
- **Imports:** `node:` protocol for builtins, `@lib/`/`@commands/` aliases for cross-directory, `./` for same-directory
- **Error handling:** Never silently swallow errors. Use `isENOENT()` from `@lib/fs` for file-not-found checks. Clean up `.tmp` files in catch blocks.
- **Spawn pattern:** Always read stdout/stderr before `await proc.exited` to avoid pipe deadlock
- **Lib purity:** No `process.exit()` or UI calls in `src/lib/` (exception: `ui/clack.ts` exits 130 on cancel). Commands own presentation and exit codes.
- **UI abstraction:** Output via `OutputAdapter`/`PromptAdapter` in `src/lib/ui/types.ts`; the `@lib/ui` facade wires `@clack/prompts` but can be swapped
- **Testability:** Lib functions accept optional config params with production defaults for DI in tests.
- **Minimal deps** — only citty and `@clack/prompts`

## Testing

Tests use `bun:test`. See [docs/coding-standards.md](docs/coding-standards.md) for test patterns (config injection, mock providers, temp dirs, assertion conventions). Test coverage tracked in [docs/improvements.md](docs/improvements.md).

## CI/CD

- **CI:** `.github/workflows/ci.yml` — static analysis, tests, package validation (parallel jobs with summary)
- **Release:** `.github/workflows/release.yml` — changesets action creates version PRs, publishes to npm via OIDC on merge
- **CodeQL:** `.github/workflows/codeql.yml` — security scanning (JS/TS + Actions)
- **Hooks:** lefthook runs oxlint, oxfmt, markdownlint on pre-commit and commitlint on commit-msg
