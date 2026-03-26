# account-switch (acsw)

CLI tool for switching between Claude Code OAuth accounts. Package name: `account-switch`, binary: `acsw`.

## Architecture

Credential storage is abstracted in two layers:

- **`Provider`** (`src/lib/providers/`) — high-level interface for snapshot/restore of full profile state (credentials + identity). The profile layer (`profiles.ts`) orchestrates switching via opaque snapshots without knowing provider-specific storage details.
- **`CredentialStore`** (`src/lib/credentials/types.ts`) — low-level interface used _within_ providers for platform-specific credential I/O. Backends: `keyring.ts` (macOS/Windows via `@napi-rs/keyring`) and `file.ts` (Linux via `~/.claude/.credentials.json`). Selected based on `ProviderConfig.platform`.

The Claude provider (`providers/claude.ts`) swaps two things:

1. **OAuth credentials** — via the appropriate `CredentialStore` backend
2. **`oauthAccount` field** in `~/.claude.json`

It never touches `settings.json`, `settings.local.json`, memory, plugins, or project config.

Profiles are stored in `~/.acsw/` with one directory per profile containing `credentials.json`, `account.json`, and `profile.json`. `ProviderConfig` (platform, homedir, env) is injected into providers for testability.

Shared file utilities (atomic JSON write, safe JSON reads with fallback/optional semantics) live in `src/lib/fs.ts`.

The `env` command auto-switches profiles on `cd` by walking up directories for `.acswrc` files; pure lookup and validation logic lives in `src/lib/env.ts`, orchestration in `src/commands/env.ts`.

Profile validation and repair logic lives in `src/lib/repair.ts`, accepting a `RepairConfig` for testability. The `repair` command is a thin display wrapper.

Design decisions and their rationale are recorded as ADRs in [docs/decisions/](docs/decisions/).

### Key invariants

- `switchProfile()` snapshots current credentials before overwriting and rolls back on failure
- `profilePaths()` validates names against `PROFILE_NAME_REGEX` to prevent path traversal
- All JSON writes use atomic temp-file-then-rename pattern
- Credential files are `chmod 600`
- Process spawning via `exec()` consumes stdout/stderr before resolving to avoid pipe deadlock
- Provider `clear()` runs before state updates to avoid corrupted state on failure

## Commands

```bash
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

- **Runtime:** Bun for dev/test, Node.js for npm package — use `node:fs/promises` and `node:child_process` (not `Bun.*` APIs) so the `--target node` build works. Process spawning uses `exec()` from `@lib/spawn`.
- **Imports:** `node:` protocol for builtins, `@lib/`/`@commands/` aliases for cross-directory, `./` for same-directory
- **Error handling:** Never silently swallow errors. Use `isENOENT()` from `@lib/fs` for file-not-found checks. Clean up `.tmp` files in catch blocks.
- **Spawn pattern:** Use `exec()` from `@lib/spawn` which collects stdout/stderr before resolving to avoid pipe deadlock
- **Lib purity:** No `process.exit()` or UI calls in `src/lib/` (exception: `ui/clack.ts` exits 130 on cancel). Commands own presentation and exit codes.
- **UI abstraction:** Output via `OutputAdapter`/`PromptAdapter` in `src/lib/ui/types.ts`; the `@lib/ui` facade wires `@clack/prompts` but can be swapped
- **Testability:** Lib functions accept optional config params with production defaults for DI in tests.
- **Minimal deps** — only citty, `@clack/prompts`, and `@napi-rs/keyring`

## Testing

Tests use `bun:test`. See [docs/coding-standards.md](docs/coding-standards.md) for test patterns (config injection, mock providers, temp dirs, assertion conventions).

## CI/CD

- **CI:** `.github/workflows/ci.yml` — static analysis, tests, package validation (parallel jobs with summary)
- **Release:** `.github/workflows/release.yml` — changesets action creates version PRs, publishes to npm via OIDC on merge
- **CodeQL:** `.github/workflows/codeql.yml` — security scanning (JS/TS + Actions)
- **Hooks:** lefthook runs oxlint, oxfmt, markdownlint on pre-commit and commitlint on commit-msg

## Workflow

Follow this workflow for every task. Never commit without completing all steps.

1. **Review the task** — if it maps to a Trekker task, check for context, dependencies, and blockers
2. **Research the codebase** — read relevant files, check ADRs for design context
3. **Create a plan** for non-trivial work, get user alignment if needed
4. **Write tests first** using `/tdd` (red-green-refactor cycle)
5. **Implement** until tests pass
6. **Update all affected docs and tracking** — before reviews so docs get reviewed too. Verify bulk edits didn't break formatting.
   - Trekker: mark tasks in-progress/completed
   - ADRs: if implementing a Proposed ADR, flip to Accepted. If contradicting an existing ADR, mark Superseded and create a new one. If completing work born from an ADR, verify it still reflects reality.
   - Other docs: architecture.md, README, etc. as needed
7. **Create changeset if needed** — any change to `src/` or `tests/` needs one. Pre-1.0 policy: minor for features, patch for refactors/fixes. Docs-only or config-only changes don't need a release.
8. **Run checks:** `pnpm format && pnpm lint:fix && pnpm test && pnpm typecheck && pnpm lint:md`
9. **Run reviews** — code-reviewer and silent-failure-hunter agents; fix any issues found
10. **If docs or comments changed:** run `/de-slopify` and `/technical-docs` as final polish
11. **If changes were made after review**, re-run checks and reviews on the final state. Treat each review as fresh — it may catch things prior passes missed.
12. **Check commit grouping** — is this one logical change? If "and" connects unrelated things, split per CONTRIBUTING.md rules.
13. **Present summary** and wait for user to say "commit" before committing

Never commit proactively. Always complete the full review cycle and present the ready state to the user, then wait for their go-ahead.
