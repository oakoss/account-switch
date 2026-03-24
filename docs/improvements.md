# Future Improvements

Planned enhancements for `account-switch` (`acsw`). Organized by priority.

## Investigation needed

Items that need a spike or benchmark before committing to a plan.

### Startup time benchmarking

**Status:** Investigate

The `env --apply` hook runs on every `cd`. If the compiled binary takes 100ms+ to cold-start, users will feel lag on every directory change. This is the most user-facing performance characteristic of the tool.

**Action:** Benchmark `time acsw env --apply` in the common paths:
- No `.acswrc` present (fast-path exit)
- `.acswrc` present, already on correct profile (no-op)
- `.acswrc` present, switch needed

Compare: `bun run src/index.ts` (interpreted) vs `dist/acsw` (compiled). If cold-start is a problem, mitigations include:
- Caching the last-applied profile + directory in a temp file to short-circuit the check
- Reducing import graph for the `env --apply` path (lazy-load heavy modules)
- Keeping the compiled binary warm via shell function wrapper

**Why this is high priority:** Every other improvement is pointless if the shell hook is too slow to use. fnm targets <5ms for its hook; acsw should aim for <50ms.

### `@napi-rs/keyring` + `bun build --compile` compatibility

**Status:** Investigate

Native NAPI-RS `.node` addons may not bundle correctly into a standalone Bun binary. This could block both the `@napi-rs/keyring` migration and cross-platform credential support.

**Action:** Spike with a minimal test:
1. `bun add @napi-rs/keyring`
2. Write a 10-line script that reads/writes a keychain entry
3. `bun build --compile` and run the compiled binary
4. Verify the `.node` native addon loads and keychain operations work

If it fails, the options are:
- Keep the current shell-out approach for macOS (`security` CLI)
- Shell out to `secret-tool` on Linux, `cmdkey` / PowerShell on Windows
- Wait for Bun's native addon bundling to mature

**Why this is high priority:** The `@napi-rs/keyring` adoption in the "Platform support" section depends on this. No point planning the migration until we know it works in the compiled binary.

### Competitor analysis

**Status:** Investigate

Evaluate competing tools for UX gaps and ideas worth stealing:
- `rzkmak/acsw` — referenced in the API key design section; writes to `settings.json`
- Any other Claude Code account-switching tools on npm/GitHub
- How `gh auth switch`, `aws sso login --profile`, and `gcloud config configurations activate` handle multi-account — these are the UX benchmarks

**Action:** Review their CLIs for features, UX patterns, and edge cases we haven't considered. Focus on: first-run experience, error recovery, and multi-provider switching patterns.

### Man pages

**Status:** Planned

Homebrew users expect `man acsw`. Tools like `marked-man` or `ronn-ng` generate man pages from markdown.

**Approach:** Write a single `acsw.1.md` source file covering all subcommands. Generate the man page during `pnpm build` and include it in the Homebrew formula. ~1 page of markdown, no runtime dependency.

## CLI framework

### Adopt citty + @clack/prompts

**Status:** Done

Migrated from manual arg parsing and raw ANSI UI to citty (subcommands, typed args, auto help) and `@clack/prompts` (interactive select, confirm). Output and prompts are abstracted behind `OutputAdapter`/`PromptAdapter` in `src/lib/ui/types.ts`.

### `NO_COLOR` / `FORCE_COLOR` support

**Status:** Planned

`src/lib/ui/format.ts` uses raw ANSI escape codes but does not respect the [`NO_COLOR`](https://no-color.org/) or `FORCE_COLOR` environment variables. This is a de facto standard for CLI tools.

**Fix:** Add a color-enabled check at the top of `format.ts` (~5 lines). When disabled, all formatting functions return the input string unmodified. No library needed — evaluated `picocolors` (6 KB, 0 deps, 140M downloads/week) but it adds no value over the existing 54-line file beyond this check.

## Multi-provider support

### Provider abstraction

**Status:** Done (foundation) — next: add providers

The `Provider` interface uses a snapshot/restore design. Each provider bundles credentials + identity into an opaque snapshot for atomic switching with rollback:

```typescript
type Provider = {
  readonly name: string
  snapshot(): Promise<ProviderSnapshot | null>
  restore(snapshot: ProviderSnapshot): Promise<void>
  clear(): Promise<void>
  displayInfo(snapshot: ProviderSnapshot): ProviderDisplayInfo
}
```

`ProviderConfig` (platform, homedir, env) is injected for testability. The Claude provider is in `src/lib/providers/claude.ts`, with a registry in `src/lib/providers/registry.ts`.

**Remaining work:**
- Generics on `Provider` blocked by TypeScript variance on `restore()` parameter — using `ClaudeSnapshot` type alias with single boundary cast instead
- Add concrete providers (GitHub CLI, AWS CLI, etc.)
- Auto-registration or declarative provider map in registry to avoid manual edits when adding providers

**Target providers:**

| Provider | Credential location | Identity location |
|----------|---|---|
| Claude Code | macOS Keychain / `~/.claude/.credentials.json` | `~/.claude.json` → `oauthAccount` |
| GitHub CLI | `~/.config/gh/hosts.yml` | Same file (token + user) |
| AWS CLI | `~/.aws/credentials` | `~/.aws/config` (named profiles) |
| gcloud | `~/.config/gcloud/` | Application default credentials |
| Vercel CLI | `~/.local/share/com.vercel.cli/` | Auth token |
| Fly.io | `~/.fly/config.yml` | Auth token |
| Wrangler (Cloudflare) | `~/.wrangler/config/default.toml` | OAuth token |

**Usage:**

```bash
acsw add personal --provider claude
acsw add work-aws --provider aws
acsw use personal    # switches Claude Code
acsw use work-aws    # switches AWS CLI
```

### Grouped switching

**Status:** Future

Switch multiple providers at once for a project context:

```bash
acsw group create work --profiles claude:work,aws:work-prod,gh:work
acsw group use work   # switches all three
```

## Auto-switch on cd (fnm-style)

### Shell hook integration

**Status:** Done (single-provider)

The `acsw env` command provides shell integration for auto-switching profiles on `cd`, like fnm does for Node.js versions.

**Project config** (`.acswrc` in project root):

```json
{
  "profile": "work"
}
```

**Shell setup:**

```bash
# Add to ~/.zshrc / ~/.bashrc
eval "$(acsw env --use-on-cd)"

# Fish: ~/.config/fish/conf.d/acsw.fish
acsw env --use-on-cd | source
```

**Behavior:**
- On `cd`, the hook runs `acsw env --apply`
- Walks up directories looking for `.acswrc` (nearest-ancestor wins, like `.nvmrc`)
- Switches profile if it differs from current, no-op if already active
- Validates `.acswrc` structure and warns on malformed config
- Checks for running Claude sessions before switching
- Sets `process.exitCode = 1` on failure so callers can detect errors

**Remaining work:**
- Multi-provider support in `.acswrc` (e.g., `{ "claude": "work", "aws": "work-prod" }`) — blocked on adding more providers
- CI early-exit: the shell hook runs on every `cd`; in CI it should be a no-op. Add `if (process.env.CI) return;` at the top of `applyAcswrc()`. Evaluated `ci-info` (30 KB, 0 deps, detects 56 CI vendors) but `!!process.env.CI` is sufficient for this use case.

## Profile management

### API key profile support

**Status:** Planned

Currently only OAuth subscriptions (Pro/Max/Team/Enterprise) are supported. Claude Code also supports direct API key auth, which is stored differently:

- OAuth: Keychain (macOS) or `~/.claude/.credentials.json` (Linux) + `oauthAccount` in `~/.claude.json`
- API key: `ANTHROPIC_API_KEY` in `~/.claude/settings.json` → `env` field

**Design decision:** Switching API key profiles requires writing to `settings.json`, which the OAuth flow deliberately avoids. Options:
1. Write to `settings.json` → `env.ANTHROPIC_API_KEY` (what rzkmak/acsw does)
2. Use `settings.local.json` instead (project-scoped, less invasive)
3. Set via environment variable only (print `export` command for user to run)

**Usage:**

```bash
acsw add work-api --api-key
# prompts for key securely (no echo)

acsw add work-api --api-key "sk-ant-..."
# or pass inline
```

**Switching to an API key profile:**
- Clear OAuth credentials (keychain/file) and `oauthAccount`
- Set `ANTHROPIC_API_KEY` in the appropriate location

**Switching from API key back to OAuth:**
- Remove `ANTHROPIC_API_KEY` from settings
- Restore OAuth credentials and `oauthAccount`

### Profile aliases

**Status:** Planned

Short names for profiles:

```bash
acsw add work --alias w,wrk
acsw w   # same as: acsw use work
```

### Profile metadata

**Status:** Future

Optional description and tags:

```typescript
type ProfileMeta = {
  name: string
  type: ProfileType
  provider: string
  createdAt: string
  lastUsed: string | null
  description?: string
  tags?: string[]
  alias?: string[]
}
```

## Command enhancements

### Shell completions

**Status:** Planned

```bash
source <(acsw completions zsh)
acsw use <TAB>  # completes profile names
```

Support bash, zsh, and fish.

**Approach:** Hand-written `completions` subcommand that emits static shell scripts. This is the standard pattern used by `gh`, `kubectl`, `rustup`, and `docker`. The scripts complete subcommand names statically and call `acsw list --names` (a new flag returning bare profile names) for dynamic profile name completion. ~50–100 lines of code, zero dependencies.

**Why not a library:** All evaluated options have significant drawbacks:
- `tabtab` — abandoned (last release 2018), 2.5 MB, pulls in `inquirer`
- `omelette` — zero deps and lightweight, but its dynamic model re-invokes the binary on every tab press, causing noticeable latency with compiled Bun binaries
- `citty` has no built-in completion support
- `cliffy` has completions but is a full framework replacement — disproportionate

**External option:** Contribute an autocomplete spec to `withfig/autocomplete` (now Amazon Q Developer CLI) as a separate zero-cost effort. Benefits macOS users who have it installed, no impact on the tool itself.

### Interactive creation wizard

**Status:** Future

```bash
acsw add --interactive
```

Guided prompts for name, provider, description, aliases.

### Health check / status

**Status:** Future

```bash
acsw status
```

Shows all profiles with expiration warnings, sync state, and health indicators.

### Credential expiration tracking

**Status:** Future

Check `expiresAt` on every command, warn when tokens are near expiry.

## Platform support

### Adopt `@napi-rs/keyring` for cross-platform credential storage

**Status:** Planned

Replace the current platform-specific credential backends with `@napi-rs/keyring`, a Rust-based native module wrapping macOS Keychain, Windows Credential Manager, and Linux Secret Service behind one API.

| Attribute | Value |
|-----------|-------|
| Downloads | ~286K/week |
| Deps | Zero runtime (platform binaries as optional deps) |
| Size | Core 35 KB + one ~450 KB platform binary |
| Build step | None — ships prebuilt NAPI-RS binaries for 12 platform/arch combos |
| Bun compat | Strong — Bun N-API at 95%, NAPI-RS is the recommended native path |
| Maintainer | Brooooooklyn (Long Yinan), NAPI-RS ecosystem author |

**API:** `new Entry(service, account)` → `.getPassword()`, `.setPassword()`, `.deletePassword()`

**Why this over alternatives:**
- `keytar` (original) — archived by Atom in 2022, no security patches
- `@github/keytar` (GitHub fork) — maintained but requires node-gyp + C++ compiler at install time
- `keychain` (npm) — macOS only, shells out to `security` (same as current approach)
- `cross-keychain` — too immature (~1.2K downloads/week, 9 GitHub stars), leaks CLI framework deps
- `@napi-rs/keyring` is the maintained alternative: zero build requirements, prebuilt binaries, backed by the Rust `keyring-rs` crate

**Impact on current codebase:**
- Replaces the 141-line `keychain.ts` that shells out to `security` CLI (1 `Bun.spawn` call per read, 3 for write)
- Could unify macOS/Windows/Linux behind a single `CredentialStore` implementation
- Contained change — the `CredentialStore` interface in `src/lib/credentials/types.ts` is already the right seam
- File-based fallback (`credentials/file.ts`) should remain for headless Linux environments without D-Bus/libsecret

**Migration:** Replace `createKeychainStore()` internals. The `CredentialStore` interface (`read`, `write`, `delete`) maps directly to the `@napi-rs/keyring` API. A new `keyring.ts` backend would be ~30 lines.

### Windows Credential Manager

**Status:** Planned — unblocked by `@napi-rs/keyring` (see above)

Encrypted by OS, consistent with the macOS Keychain approach. No additional code beyond adopting `@napi-rs/keyring`.

### Linux secret service

**Status:** Planned — unblocked by `@napi-rs/keyring` (see above)

Uses `libsecret` / D-Bus Secret Service API via the Rust `keyring-rs` crate. Requires a running D-Bus session (standard on desktop Linux, absent on headless servers). The file-based backend remains as fallback.

## Distribution

### Pre-built binaries

**Status:** Planned

Compile for each platform via `bun build --compile --target`:
- `acsw-macos-x64`
- `acsw-macos-arm64`
- `acsw-linux-x64`
- `acsw-windows-x64.exe`

Attach to GitHub releases automatically. This is a prerequisite for the Homebrew formula below.

### macOS code signing and notarization

**Status:** Planned — blocked on Apple Developer ID enrollment

Sign and notarize macOS binaries so direct GitHub release downloads don't trigger Gatekeeper warnings. Not required for Homebrew (it strips quarantine automatically), but needed for direct downloads.

**Prerequisites:**
1. Enroll in the Apple Developer Program ($99/year) at [developer.apple.com](https://developer.apple.com) — a personal account works fine, doesn't need to match the `oakoss` GitHub org
2. Create a "Developer ID Application" certificate in the Apple Developer portal
3. Export the certificate as a `.p12` file
4. Generate an app-specific password at [appleid.apple.com](https://appleid.apple.com) (Account → Sign-In and Security → App-Specific Passwords)

**GitHub org secrets to add** (Settings → Secrets → Actions, at the `oakoss` org level so they're shared across repos):

| Secret | Value |
|--------|-------|
| `APPLE_CERTIFICATE` | The `.p12` file, base64-encoded (`base64 -i cert.p12 \| pbcopy`) |
| `APPLE_CERTIFICATE_PASSWORD` | Password set when exporting the `.p12` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_TEAM_ID` | Team ID from the developer portal (Account → Membership) |
| `APPLE_APP_PASSWORD` | The app-specific password generated above |

**Release workflow steps** (after `bun build --compile`, before attaching to release):
1. Decode certificate into a temporary CI keychain
2. `codesign --sign "Developer ID Application: ..." --options runtime dist/acsw`
3. `xcrun notarytool submit dist/acsw --apple-id ... --team-id ... --password ...`
4. `xcrun stapler staple dist/acsw` (embeds the notarization ticket)

Only applies to macOS binaries. Linux and Windows binaries skip this step.

### Homebrew formula

**Status:** Planned — blocked on pre-built binaries

The tap repo (`oakoss/homebrew-tap`) is created. No dependency on the tool itself — the formula is a Ruby file in the tap repo that downloads the prebuilt binary from a GitHub release.

```bash
brew tap oakoss/tap
brew install oakoss/tap/acsw
```

**Remaining work:**
- Add cross-platform compile step to `.github/workflows/release.yml` (build matrix for macOS x64/arm64, Linux x64)
- Attach binaries to GitHub releases via the release workflow
- Add a formula to `oakoss/homebrew-tap` that downloads the correct binary per platform/arch and computes SHA256
- Automate formula SHA updates on new releases (e.g., via `brew bump-formula-pr` or a GitHub Action that updates the tap repo)

## Dependencies

The tool targets minimal runtime dependencies (currently 2: `citty` + `@clack/prompts`). Libraries are evaluated against: trust (maintenance, downloads), performance (size, dep count), and value (does it solve something the codebase can't do in <20 lines?).

### Evaluated and rejected

| Library | Category | Why rejected |
|---------|----------|--------------|
| picocolors | Colors | Existing `format.ts` is fine; just add `NO_COLOR` check (~5 lines) |
| std-env | Platform detection | Overkill for one `process.platform` check |
| consola | Logging | Overlaps with existing clack-based UI abstraction |
| conf / configstore | Config files | 5–9 transitive deps for functionality already in `fs.ts` |
| zod | Validation | 700 KB+ for 2–3 small schemas. Revisit if config shapes multiply. |
| tinyexec | Subprocess | Wraps Node `child_process`, contradicts Bun-first convention |
| cleye | CLI framework | citty has 100x adoption, 0 deps, lazy subcommand loading already integrated |
| update-notifier | Version check | 10 transitive deps |
| simple-update-notifier | Version check | Only relevant if npm is primary install channel |
| shell-quote | Arg quoting | All `Bun.spawn` calls use array form — no shell injection risk |
| tabtab | Completions | Abandoned (2018), 2.5 MB, pulls in inquirer |
| omelette | Completions | Dynamic model re-invokes binary on every tab — latency with compiled Bun binary |
| untildify | Path expansion | Trivially inlineable (2 lines) |
| env-paths | XDG paths | Appends `-nodejs` suffix; macOS path would regress UX |
| xdg-basedir | XDG paths | Does not provide macOS-native paths |
| ci-info | CI detection | `!!process.env.CI` is sufficient for this use case |
| write-file-atomic | Atomic writes | Current `writeJson` is correct; SIGTERM risk is negligible for small config files |
| keytar | Credentials | Archived by Atom in 2022, no security patches |
| @github/keytar | Credentials | Requires node-gyp + C++ compiler at install time |

### Planned adoption

| Library | Category | Why | Blocker |
|---------|----------|-----|---------|
| `@napi-rs/keyring` | Credentials | Cross-platform (macOS/Windows/Linux), zero runtime deps, prebuilt NAPI-RS binaries, no build step | Must verify `bun build --compile` compatibility — see "Investigation needed" section |

## Architecture

### Decompose `profiles.ts`

**Status:** Partially done

Shared file utilities (atomic JSON write, safe JSON reads) extracted to `src/lib/fs.ts`. `switchProfile()` flattened.

**Remaining:**
- Snapshot read/write (`readProfileSnapshot`, `writeProfileSnapshot`) could move to `src/lib/snapshot.ts` — these are the core data persistence operations for profiles, currently buried as private helpers in a 354-line file. Extracting would enable direct unit tests instead of testing only through `switchProfile`/`addOAuthProfile`.
- State backup logic for outgoing profiles could be isolated for grouped switching

### Consolidate switch-and-display logic

**Status:** Planned

"Check active → guard claude → switch → format result → display" is implemented in four separate locations:

1. `src/index.ts` interactive picker (lines 46–97)
2. `src/index.ts` shortcut handler (lines 100–138) — nearly duplicates `use.ts`
3. `src/commands/use.ts`
4. `src/commands/env.ts` `applyAcswrc()` — a non-interactive variant

Each reimplements the same flow with minor variations (interactive vs non-interactive, shortcut vs subcommand). A shared `performSwitch(name, resolve, opts)` returning `ProfileInfo` would collapse the duplication and make it testable in one place.

### Consolidate atomic write in `config.ts`

**Status:** Planned

`config.ts` `writeOAuthAccount()` reimplements the atomic temp-file-then-rename pattern from `fs.ts` `writeJson()`. Both do: `Bun.write(tmpPath)` → `renameSync` → catch cleanup. The duplication exists because `writeOAuthAccount` needs read-modify-write semantics (preserve other keys in `~/.claude.json`).

**Fix:** Either add a `readModifyWriteJson()` utility to `fs.ts` that `config.ts` can use, or have `writeOAuthAccount` call `writeJson` internally after doing the read-modify step. This would also make `config.test.ts` actually test the exported functions rather than reimplementing the JSON logic inline.

### Unify `profilePaths` and remove dead code

**Status:** Planned

Profile path computation exists in three places:

1. `src/lib/constants.ts` — `profileDir()`, `profileCredentialsFile()`, `profileAccountFile()`, `profileMetaFile()` (individual functions, use `PROFILES_DIR` constant)
2. `src/lib/profiles.ts` — `profilePaths(config, name)` (returns object, uses injected `config.profilesDir`)
3. `src/lib/repair.ts` — `profilePaths(profilesDir, name)` (returns object, uses direct arg)

The `constants.ts` versions are **dead code** — never imported by any module. Only referenced in `CLAUDE.md` docs. The `profiles.ts` and `repair.ts` versions duplicate the same core path-building logic but differ slightly: `profiles.ts` returns 4 fields (`dir`, `credentials`, `account`, `meta`) while `repair.ts` returns 3 (no `dir`). They also accept the base directory differently.

**Fix:** Delete the dead functions from `constants.ts`, extract a single `profilePaths(profilesDir, name)` into a shared location (e.g., `fs.ts` or a new `src/lib/paths.ts`), and update `profiles.ts` + `repair.ts` to use it. Update CLAUDE.md to remove the stale reference.

### Extract `env.ts` logic into testable lib module

**Status:** Planned

`src/commands/env.ts` contains 5 distinct concerns, all private to the citty command:

1. **`findAcswrc`** — directory walk (ancestor search for `.acswrc`)
2. **`readAcswrc`** — JSON parsing with validation (structure, types, ENOENT race)
3. **`applyAcswrc`** — config application (reads state, checks claude running, switches profile)
4. **`detectShell`** — shell detection from `$SHELL`
5. **`generateHook`** — shell hook code generation (zsh/bash/fish)

None of these can be tested without executing the command. The test coverage section below lists ~15 test cases that are all blocked by this structure.

**Fix:** Move `findAcswrc`, `readAcswrc`, `detectShell`, and `generateHook` to `src/lib/env.ts` as exported functions. Keep `applyAcswrc` either in the command (thin orchestration) or split it into a testable core that accepts dependencies. The command file becomes a thin shell over the lib.

### Decouple `guardClaudeRunning` from UI

**Status:** Planned

`src/lib/process.ts` `guardClaudeRunning()` mixes process detection with UI interaction — it calls `ui.warn()`, `ui.confirm()`, and `process.exit()` directly. This makes it untestable without mocking the UI module.

Evidence the coupling is wrong: `env.ts` can't use `guardClaudeRunning()` (non-interactive context), so it calls `isClaudeRunning()` directly and handles the UI itself.

**Fix:** `guardClaudeRunning()` should return a result (e.g., `'running' | 'unknown' | 'not-running'`) and let the caller decide how to present it. Or accept a callback/adapter for the confirm prompt. This removes the `process.exit()` call from a lib module and makes both the interactive and non-interactive paths use the same detection logic.

### Credential storage abstraction

**Status:** Done

Extracted `CredentialStore` interface with platform-specific backends in `src/lib/credentials/`:
- `types.ts` — `CredentialStore` interface
- `keychain.ts` — macOS Keychain backend (via `security` CLI)
- `file.ts` — file-based backend (`~/.claude/.credentials.json`)

The Claude provider selects the backend based on `ProviderConfig.platform`. This unblocks Windows Credential Manager and Linux Secret Service as future backends.

### Consolidate test utilities

**Status:** Done

Mock provider factories (`createMockProvider`, `createFailingProvider`, `mockResolver`) extracted to `tests/helpers/mock-providers.ts`. Shared across all provider-related test files.

## Quality

### Test coverage

**Status:** In progress

Integration tests use `ProfilesConfig` injection to redirect paths to a temp directory. Coverage includes:
- `switchProfile()` — happy path, outgoing snapshot, re-switch active, non-oauth type, rollback, rollback failure, missing profile, missing credentials (8 cases)
- `addOAuthProfile()` — credentials/metadata creation, no-credentials error (2 cases)
- `removeProfile()` — directory deletion, provider clear on active, skip clear on inactive, missing profile (4 cases)
- `listProfiles()` — display info extraction, empty state, sorted output (3 cases)
- `credentials/file.ts` — roundtrip, permissions, atomic write, parent dir creation, overwrite, null read, corrupted read, delete, null after delete, delete nonexistent (10 cases)
- `config.ts` — tested indirectly (raw JSON manipulation), not the actual `readOAuthAccount`/`writeOAuthAccount` exports (3 cases)
- Repair library — 14 tests via `RepairConfig` path injection

**Untested modules:**
- `env` command — `findAcswrc` directory walk, `readAcswrc` validation (bad JSON, non-object, missing profile key, ENOENT race), `applyAcswrc` (already active no-op, switch success, switch failure exit code, isClaudeRunning gating), `detectShell` (zsh/bash/fish detection, unknown shell error), `generateHook` output for each shell — blocked by all logic being private to the command file (see "Extract env.ts logic" above)
- `process.ts` — `isClaudeRunning()` and `guardClaudeRunning()` have zero tests. `guardClaudeRunning` is hard to test due to direct `ui`/`process.exit` coupling.
- `credentials/keychain.ts` — zero tests. Requires mocking `Bun.spawn` for the `security` CLI calls.
- `providers/claude.ts` — zero tests. The provider integrates `CredentialStore` + `config.ts` but is only tested indirectly through profile integration tests with mock providers.
- `config.ts` — `readOAuthAccount`/`writeOAuthAccount` exports are not tested directly. `config.test.ts` reimplements the JSON logic inline rather than calling the functions.
- All command files (`add.ts`, `use.ts`, `list.ts`, `remove.ts`, `current.ts`, `repair.ts`) — no unit tests. Tested only through the lib-level integration tests.
- `index.ts` — shortcut handler and interactive picker have zero tests.

Target: 80%+ coverage on `src/lib/`.

### Backup and restore

**Status:** Future

```bash
acsw backup ~/backup.tar.gz
acsw restore ~/backup.tar.gz
```

Exports metadata and account info (not credentials for security).

### Encryption at rest

**Status:** Future

AES-256-GCM encryption for credential files on Linux/Windows (in addition to mode 600).

### Audit logging

**Status:** Nice-to-have

Append-only log of profile switches for compliance/debugging.

```text
2026-03-23T15:30:00Z - Switch: personal -> work (claude)
2026-03-23T16:45:00Z - Switch: work -> personal (claude)
```
