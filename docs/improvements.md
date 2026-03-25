# Future Improvements

Planned enhancements for `account-switch` (`acsw`). Organized by priority; work top-down.

## Priority 1: Quick wins

Low-effort changes that improve code quality immediately.

### Extract ENOENT helper

**Status:** Done

Added `isENOENT(error: unknown): boolean` to `src/lib/fs.ts`. Replaced all 5 call sites (`profiles.ts` ×2, `repair.ts`, `credentials/file.ts`, `env.ts`) with one-liners.

### Clean up unnecessary dynamic imports

**Status:** Done

Converted 4 dynamic imports to top-level: `unlink` in `profiles.ts` and `credentials/file.ts` (from `node:fs/promises`), `renameSync`/`unlinkSync` in `fs.ts` (from `node:fs`).

### Eliminate double snapshot in `add` command

**Status:** Done

`addOAuthProfile()` now accepts an optional `existingSnapshot` parameter. `add.ts` passes the snapshot it already fetched for validation, avoiding a redundant keychain read on macOS.

### Unify `profilePaths` and remove dead code

**Status:** Done

Extracted shared `profilePaths()` to `src/lib/paths.ts`. Both `profiles.ts` and `repair.ts` now import from it. Returns all 4 fields (`dir`, `credentials`, `account`, `meta`). Dead code (`profileDir()`, etc.) was removed in an earlier pass.

## Priority 2: Testability & architecture

Structural changes that unblock testing and reduce duplication.

### Consolidate switch-and-display logic

**Status:** Done

Extracted `displaySwitchResult(name, profile)` to `src/commands/switch-display.ts`. All three interactive switch paths (`use.ts`, picker, shortcut) use it, fixing the `organizationName` display divergence. The shortcut handler in `index.ts` was simplified: uses `profileExists()` instead of `listProfiles()` (avoids reading all N profiles). The `env.ts` non-interactive path keeps its own display (prefixed, no email/orgName).

### Extract `env.ts` logic into testable lib module

**Status:** Done

Moved `findAcswrc`, `readAcswrc`, `detectShell`, and `generateHook` to `src/lib/env.ts` as exported functions. `applyAcswrc` remains in the command file as thin orchestration. All 4 extracted functions are now directly testable.

### Decouple `guardClaudeRunning` from UI

**Status:** Done

Replaced `guardClaudeRunning()` with `checkClaudeStatus()` which returns `'running' | 'not-running' | 'unknown'`. No UI or `process.exit()` in lib code. Callers (`add.ts`, `use.ts`, `index.ts`) handle the prompt themselves. The `env.ts` non-interactive path continues to use `isClaudeRunning()` directly.

### Decompose `profiles.ts`

**Status:** Done

Shared file utilities extracted to `src/lib/fs.ts`, profile paths to `src/lib/paths.ts`, snapshot I/O (`readProfileSnapshot`, `writeProfileSnapshot`) to `src/lib/snapshot.ts`. `profiles.ts` is now ~290 lines focused on profile operations. Snapshot functions are directly testable and importable.

**Remaining:** State backup logic for outgoing profiles could be isolated for grouped switching (future).

### Optimize `current` command

**Status:** Done

Added `getActiveProfile(resolve, config)` to `src/lib/profiles.ts` that reads state + one profile instead of all N. `current.ts` uses it instead of `listProfiles()`.

## Priority 3: Test coverage

Dependent on Priority 2 architecture changes to unblock testable surfaces.

### Test coverage

**Status:** In progress

85 tests across 6 files. Integration tests use `ProfilesConfig` injection to redirect paths to a temp directory. Coverage includes:
- `switchProfile()` — happy path, outgoing snapshot, re-switch active, non-oauth type, rollback, rollback failure, missing profile, missing credentials (8 cases)
- `addOAuthProfile()` — credentials/metadata creation, no-credentials error (2 cases)
- `removeProfile()` — directory deletion, provider clear on active, skip clear on inactive, missing profile (4 cases)
- `listProfiles()` — display info extraction, empty state, sorted output (3 cases)
- `getActiveProfile()` — active profile, no active set, missing from disk, no state file (4 cases)
- `credentials/file.ts` — roundtrip, permissions, atomic write, parent dir creation, overwrite, null read, corrupted read, delete, null after delete, delete nonexistent (10 cases)
- `config.ts` — `readOAuthAccount` (present, absent, missing file, corrupt) and `writeOAuthAccount` (add, replace, delete, missing file, corrupt) tested directly (9 cases)
- `lib/env.ts` — `findAcswrc` (same dir, parent, nearest ancestor, no match), `readAcswrc` (valid, empty, ENOENT, bad JSON, array, null, string, non-string profile), `detectShell` (zsh, bash, fish, full path, unknown, empty, no-arg fallback), `generateHook` (zsh dedup, bash alias, fish PWD, unsupported, no leading newline, trailing newline) (22 cases)
- Repair library — 14 tests via `RepairConfig` path injection
- Mock providers — unit tests for `createMockProvider`, `createFailingProvider` (9 cases)

**Untested modules:**
- `env` command — `applyAcswrc` orchestration (already active no-op, switch success, switch failure exit code, Claude status gating, timeout). Still in the command file.
- `process.ts` — `isClaudeRunning()` and `checkClaudeStatus()` have zero tests. Now testable since UI coupling was removed.
- `credentials/keychain.ts` — zero tests. Requires mocking `Bun.spawn` for the `security` CLI calls.
- `providers/claude.ts` — zero tests. The provider integrates `CredentialStore` + `config.ts` but is only tested indirectly through profile integration tests with mock providers.
- All command files (`add.ts`, `use.ts`, `list.ts`, `remove.ts`, `current.ts`, `repair.ts`) — no unit tests. Tested only through the lib-level integration tests.
- `index.ts` — shortcut handler and interactive picker have zero tests.

Target: 80%+ coverage on `src/lib/`.

## Priority 4: Platform support

Cross-platform work that unblocks Windows and Linux.

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

### Extract process detection interface

**Status:** Planned — needed for Windows support

`src/lib/process.ts` `isClaudeRunning()` shells out to `pgrep`, which doesn't exist on Windows. When adding Windows support (alongside `@napi-rs/keyring`), process detection needs a platform-specific backend, same pattern as `CredentialStore`.

```typescript
type ProcessDetector = {
  isRunning(name: string): Promise<boolean | null>;
};
```

**Backends:**
- `pgrep` — macOS/Linux (current approach)
- `tasklist` or `Get-Process` — Windows

Selected based on `ProviderConfig.platform`, injected into the env hook and `guardClaudeRunning`. Keeps the rest of the codebase unaware of platform-specific process detection.

### Windows Credential Manager

**Status:** Planned — unblocked by `@napi-rs/keyring` (see above)

Encrypted by OS, consistent with the macOS Keychain approach. No additional code beyond adopting `@napi-rs/keyring`.

### Linux secret service

**Status:** Planned — unblocked by `@napi-rs/keyring` (see above)

Uses `libsecret` / D-Bus Secret Service API via the Rust `keyring-rs` crate. Requires a running D-Bus session (standard on desktop Linux, absent on headless servers). The file-based backend remains as fallback.

## Priority 5: Distribution

Getting the tool into users' hands.

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
1. Enroll in the Apple Developer Program ($99/year) at [developer.apple.com](https://developer.apple.com). A personal account works; doesn't need to match the `oakoss` GitHub org
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

The tap repo (`oakoss/homebrew-tap`) is created. The formula is a Ruby file in the tap repo that downloads the prebuilt binary from a GitHub release; no dependency on the tool itself.

```bash
brew tap oakoss/tap
brew install oakoss/tap/acsw
```

**Remaining work:**
- Add cross-platform compile step to `.github/workflows/release.yml` (build matrix for macOS x64/arm64, Linux x64)
- Attach binaries to GitHub releases via the release workflow
- Add a formula to `oakoss/homebrew-tap` that downloads the correct binary per platform/arch and computes SHA256
- Automate formula SHA updates on new releases (e.g., via `brew bump-formula-pr` or a GitHub Action that updates the tap repo)

## Priority 6: Features

New user-facing capabilities.

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

### Profile aliases

**Status:** Planned

Short names for profiles:

```bash
acsw add work --alias w,wrk
acsw w   # same as: acsw use work
```

### Multi-provider: add concrete providers

**Status:** Planned — blocked on provider abstraction done

**Remaining work:**
- Generics on `Provider` blocked by TypeScript variance on `restore()` parameter; using `ClaudeSnapshot` type alias with single boundary cast instead. Alternative: tag snapshots with `{ provider: string; credentials: unknown; identity: unknown }` so `restore()` can validate at runtime that a snapshot matches its provider, preventing mismatched snapshot/provider pairs
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

## Priority 7: Future

Nice-to-haves. Not blocked, just lower priority than everything above.

### Grouped switching

**Status:** Future

Switch multiple providers at once for a project context:

```bash
acsw group create work --profiles claude:work,aws:work-prod,gh:work
acsw group use work   # switches all three
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

### Man pages

**Status:** Planned

Homebrew users expect `man acsw`. Tools like `marked-man` or `ronn-ng` generate man pages from markdown.

**Approach:** Write a single `acsw.1.md` source file covering all subcommands. Generate the man page during `pnpm build` and include it in the Homebrew formula. ~1 page of markdown, no runtime dependency.

## Investigate / revisit later

Items that need a spike or benchmark, or aren't justified yet.

### Competitor analysis

**Status:** Investigate

Evaluate competing tools for UX gaps and ideas worth stealing:
- `rzkmak/acsw` — referenced in the API key design section; writes to `settings.json`
- Any other Claude Code account-switching tools on npm/GitHub
- How `gh auth switch`, `aws sso login --profile`, and `gcloud config configurations activate` handle multi-account — these are the UX benchmarks

**Action:** Review their CLIs for features, UX patterns, and edge cases we haven't considered. Focus on: first-run experience, error recovery, and multi-provider switching patterns.

### Rust rewrite

**Status:** Revisit later

The compiled Bun binary is 58 MB (vs ~3-5 MB for a Rust binary) with a 680ms cold start (vs ~1-2ms in Rust). A Rust rewrite would also give native `keyring-rs` access without the NAPI bridge question.

**Trade-offs:**
- Full rewrite of ~1,900 lines of TypeScript
- Lose `@clack/prompts` — Rust alternatives (`dialoguer`, `inquire`) are good but different
- Slower iteration speed during development
- Narrower contributor pool

**When to revisit:** If binary size becomes distribution friction (Homebrew downloads, CI caching), if the `@napi-rs/keyring` spike fails, or if the hook path gets heavy enough that cold start matters. Not justified while the current numbers are within targets and the feature roadmap is incomplete.

## Done

Completed items kept for reference and decision context.

### Startup time benchmarking (2026-03-24)

Benchmarked `time acsw env --apply` on macOS arm64 (compiled binary via `bun build --compile`):

| Scenario | Time | Memory |
|----------|------|--------|
| No `.acswrc` (fast path) | ~20ms | ~29 MB |
| `.acswrc` present, switch attempt | ~40ms | ~32 MB |
| Cold start (first run after build) | ~680ms | ~29 MB |
| Binary size | 58 MB | — |

Both hot paths are under the 50ms target (fnm targets <5ms, but it's Rust). The 680ms cold start only happens once after install or system restart.

**Mitigations added:**
- 5-second timeout on `applyAcswrc()` — if anything hangs (keychain prompt, slow disk, stalled `pgrep`), the hook bails with a warning instead of blocking the shell
- CI early-exit — `if (process.env.CI) return;` skips the hook entirely in CI

**Binary size note:** 58 MB is the Bun runtime overhead. Every Bun CLI pays this cost. Not reducible without switching runtimes.

### `@napi-rs/keyring` + `bun build --compile` compatibility (2026-03-24)

Spiked with a minimal test: write/read/delete via `@napi-rs/keyring`, then `bun build --compile` and run the compiled binary.

**Results:**
- Interpreted (`bun run`): all operations pass
- Compiled (`bun build --compile`): all operations pass
- Cross-verified via `security find-generic-password` — the compiled binary writes to the real macOS Keychain
- Binary size impact: +1 MB (58 → 59 MB) — negligible
- API note: `getPassword()` returns `null` after delete instead of throwing — the `CredentialStore` interface already returns `null` for missing credentials, so this aligns

**Conclusion:** The `@napi-rs/keyring` migration is unblocked.

### Adopt citty + @clack/prompts

Migrated from manual arg parsing and raw ANSI UI to citty (subcommands, typed args, auto help) and `@clack/prompts` (interactive select, confirm). Output and prompts are abstracted behind `OutputAdapter`/`PromptAdapter` in `src/lib/ui/types.ts`.

### `NO_COLOR` / `FORCE_COLOR` support

`src/lib/ui/format.ts` respects [`NO_COLOR`](https://no-color.org/) and `FORCE_COLOR` environment variables. Colors are enabled when `NO_COLOR` is absent and either `FORCE_COLOR` is set or stdout is a TTY. All formatting functions pass through unmodified when disabled. No library needed.

### Provider abstraction (foundation)

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

### Shell hook integration (single-provider)

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

**Done:**
- CI early-exit: `if (process.env.CI) return;` at the top of `applyAcswrcInner()` skips the hook in CI
- 5-second timeout on `applyAcswrc()` to prevent shell hangs
- `isClaudeRunning()` returning `null` (detection failed) now skips auto-switch instead of proceeding

**Remaining:**
- Multi-provider support in `.acswrc` (e.g., `{ "claude": "work", "aws": "work-prod" }`) — blocked on adding more providers

### Consolidate atomic write in `config.ts`

`config.ts` `writeOAuthAccount()` now calls `writeJson()` from `fs.ts` instead of reimplementing the atomic temp-file-then-rename pattern. The read-modify step remains in `config.ts` (it needs to preserve other keys in `~/.claude.json`), but the write is delegated.

### Credential storage abstraction

Extracted `CredentialStore` interface with platform-specific backends in `src/lib/credentials/`:
- `types.ts` — `CredentialStore` interface
- `keychain.ts` — macOS Keychain backend (via `security` CLI)
- `file.ts` — file-based backend (`~/.claude/.credentials.json`)

The Claude provider selects the backend based on `ProviderConfig.platform`. This unblocks Windows Credential Manager and Linux Secret Service as future backends.

### Consolidate test utilities

Mock provider factories (`createMockProvider`, `createFailingProvider`, `mockResolver`) extracted to `tests/helpers/mock-providers.ts`. Shared across all provider-related test files.

### Abstraction audit note (2026-03-24)

Reviewed the full codebase for abstraction gaps. The `CredentialStore`, `Provider`, and UI adapter (`OutputAdapter`/`PromptAdapter`) boundaries are already the right seams. Bun APIs, citty, and JSON format are deliberate choices that don't benefit from indirection. Process detection is the one gap that blocks cross-platform support.

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
| `@napi-rs/keyring` | Credentials | Cross-platform (macOS/Windows/Linux), zero runtime deps, prebuilt NAPI-RS binaries, no build step | None — `bun build --compile` compatibility verified (2026-03-24) |
