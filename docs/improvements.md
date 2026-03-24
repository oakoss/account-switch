# Future Improvements

Planned enhancements for `account-switch` (`acsw`). Organized by priority.

## CLI framework

### Adopt citty + @clack/prompts

**Status:** Done

Migrated from manual arg parsing and raw ANSI UI to citty (subcommands, typed args, auto help) and `@clack/prompts` (interactive select, confirm). Output and prompts are abstracted behind `OutputAdapter`/`PromptAdapter` in `src/lib/ui/types.ts`.

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

**Status:** Partially done

Shared file utilities (atomic JSON write, safe JSON reads) extracted to `src/lib/fs.ts`. `switchProfile()` flattened — reduced nesting and improved readability.

**Remaining:**
- Snapshot read/write could move to `src/lib/snapshot.ts`
- State backup logic for outgoing profiles could be isolated for grouped switching

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

Integration tests use `mock.module` to redirect `constants.ts` paths to a temp directory. Coverage includes:
- `switchProfile()` — happy path, outgoing snapshot, rollback, rollback failure, missing profile, missing credentials (6 cases)
- `addOAuthProfile()` — credentials/metadata creation, no-credentials error (2 cases)
- `removeProfile()` — directory deletion, provider clear on active, skip clear on inactive, missing profile (4 cases)
- `listProfiles()` — display info extraction, empty state, sorted output (3 cases)
- Repair library — 14 tests via `RepairConfig` path injection

All planned `src/lib/` test coverage is implemented.

**Remaining:**
- `env` command — `findAcswrc` directory walk, `readAcswrc` validation (bad JSON, non-object, missing profile key, ENOENT race), `applyAcswrc` (already active no-op, switch success, switch failure exit code, isClaudeRunning gating), `detectShell` (zsh/bash/fish detection, unknown shell error), `generateHook` output for each shell

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
