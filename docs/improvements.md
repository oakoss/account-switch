# Future Improvements

Planned enhancements for `account-switch` (`acsw`). Organized by priority.

## CLI framework

### Adopt citty + @clack/prompts

**Status:** Planned (high priority)

Replace the manual arg parsing (`switch` in `index.ts`) and raw ANSI UI (`ui.ts`) with proper CLI libraries:

- **citty** (unjs) — arg parsing, subcommands, typed args, auto-generated help text
- **@clack/prompts** — interactive prompts (select, confirm, spinner, text input)

Both are zero-dep, ~4-5KB each, Bun-compatible, and from trusted maintainers.

**What changes:**
- `src/index.ts` — replace manual `switch` with citty command definitions
- `src/lib/ui.ts` — replace raw ANSI codes and stdin reader with clack prompts
- Help text auto-generated from command definitions instead of hand-written
- Interactive picker becomes a proper `select()` prompt
- Confirm dialogs become `confirm()` with proper keyboard handling
- **Prep:** Consolidate shared command patterns first (Claude-running guard in `add`/`use`, name validation, error exit) to reduce migration surface

## Multi-provider support

### Provider abstraction

**Status:** Done (foundation) — next: add providers

The `Provider` interface is implemented with a snapshot/restore design. Each provider bundles credentials + identity into an opaque snapshot, enabling atomic switching with rollback:

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

**Status:** Planned (high priority)

Automatically switch profiles when entering a project directory, like fnm does for Node.js versions.

**Project config** (`.acswrc` in project root):

```json
{
  "claude": "work",
  "aws": "work-prod"
}
```

**Shell setup:**

```bash
# Add to ~/.zshrc
eval "$(acsw env --use-on-cd)"
```

**Behavior:**
- On `cd`, the hook checks for `.acswrc` walking up parent directories
- If found, switches any profiles that differ from current
- Fast no-op when already on the correct profile
- Prints a one-line notification on switch

**Implementation:**
- `acsw env` command outputs a shell function that wraps `cd`
- `acsw use --if-changed <profile>` flag for silent no-op when already active
- Support bash, zsh, and fish shells
- `.acswrc` lookup walks up directories (like `.gitignore`)

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

### Windows Credential Manager

**Status:** Planned

Use `cmdkey` or PowerShell API instead of file-based storage on Windows. Encrypted by OS, consistent with the macOS Keychain approach.

### Linux secret service

**Status:** Future

Use `libsecret` / D-Bus Secret Service API on Linux for encrypted credential storage instead of plain files.

## Distribution

### Pre-built binaries

**Status:** Planned

Compile for each platform via `bun build --compile --target`:
- `acsw-macos-x64`
- `acsw-macos-arm64`
- `acsw-linux-x64`
- `acsw-windows-x64.exe`

Attach to GitHub releases automatically.

### Homebrew formula

**Status:** Future

```bash
brew install account-switch
```

## Architecture

### Decompose `profiles.ts`

**Status:** Planned

`profiles.ts` (372 lines) mixes profile lifecycle, snapshot I/O, state transitions, and rollback. `switchProfile()` alone is 97 lines with 5 nesting levels.

**Extract:**
- Atomic JSON write helper (temp-file-then-rename pattern used 4+ times across `profiles.ts` and `credentials.ts`)
- Snapshot read/write into `src/lib/snapshot.ts`
- State backup logic for outgoing profiles

**Why now:** Every new provider adds more snapshot types. Grouped switching will call `switchProfile` in a loop — rollback logic needs to be isolated and testable.

**Files:** `src/lib/profiles.ts`, `src/lib/credentials.ts`

### Credential storage abstraction

**Status:** Planned

`credentials.ts` (236 lines) tangles macOS Keychain CLI interaction (140 lines), file-based credential I/O, and hex-vs-JSON format detection. Keychain logic can't be tested without the real `security` command.

**Extract:** Platform-specific credential backends behind a `CredentialStore` interface. The Claude provider uses the appropriate backend based on `ProviderConfig.platform`.

**Why now:** Directly unblocks Windows Credential Manager and Linux Secret Service. Also needed for API key profile support (different storage backend, same interface).

**Files:** `src/lib/credentials.ts`, `src/lib/providers/claude.ts`

### Consolidate test utilities

**Status:** Planned

`createMockProvider()` and `createFailingProvider()` live in `profiles.test.ts` but are needed by any test touching providers. Each test file independently sets up temp directories.

**Extract:** Move mock provider factories and shared setup to `tests/helpers/`.

**Why now:** Every new provider needs mock factories. 80%+ coverage target is harder when setup is duplicated.

**Files:** `tests/profiles.test.ts` → `tests/helpers/mock-providers.ts`

## Quality

### Test coverage

**Status:** In progress

Integration tests use `mock.module` to redirect `constants.ts` paths to a temp directory. Coverage includes:
- `switchProfile()` — happy path, outgoing snapshot, rollback, rollback failure, missing profile, missing credentials (6 cases)
- `addOAuthProfile()` — credentials/metadata creation, no-credentials error (2 cases)
- `removeProfile()` — directory deletion, provider clear on active, skip clear on inactive, missing profile (4 cases)
- `listProfiles()` — display info extraction, empty state, sorted output (3 cases)
- Repair library — 14 tests via `RepairConfig` path injection

All planned test coverage is implemented.

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

```
2026-03-23T15:30:00Z - Switch: personal -> work (claude)
2026-03-23T16:45:00Z - Switch: work -> personal (claude)
```
