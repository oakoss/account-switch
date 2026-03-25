# Architecture

This document describes the internal structure and data flow of `acsw`.

## Project structure

```text
src/
├── index.ts                    # CLI entry point, command routing, shortcut handler
├── commands/
│   ├── add.ts                  # Save current session as profile
│   ├── use.ts                  # Switch to a profile
│   ├── list.ts                 # List all profiles
│   ├── remove.ts               # Delete a profile
│   ├── current.ts              # Show active profile
│   ├── repair.ts               # Validate and fix profiles
│   ├── env.ts                  # Shell hook integration (auto-switch on cd)
│   ├── guard-claude.ts         # Shared Claude-running guard (UI-layer helper)
│   ├── switch-display.ts      # Shared post-switch display formatting
│   └── completions.ts         # Shell completion generation (zsh/bash/fish)
└── lib/
    ├── types.ts                # Type definitions
    ├── constants.ts            # Paths, regex, provider config factory
    ├── profiles.ts             # Profile CRUD operations
    ├── completions.ts          # Shell completion generators + listProfileNames
    ├── config.ts               # OAuth account in ~/.claude.json
    ├── env.ts                  # Shell hook logic (findAcswrc, readAcswrc, detectShell, generateHook)
    ├── fs.ts                   # Shared file utilities (atomic JSON write, safe reads, isENOENT)
    ├── paths.ts                # Shared profilePaths() for profile directory layout
    ├── process.ts              # Process detection (is Claude running)
    ├── snapshot.ts             # Profile snapshot read/write (credentials + identity)
    ├── repair.ts               # Profile validation and repair logic
    ├── credentials.ts          # CredentialStore factory (selects backend by platform)
    ├── credentials/
    │   ├── types.ts            # CredentialStore interface
    │   ├── keychain.ts         # macOS Keychain backend (via security CLI)
    │   └── file.ts             # File-based backend (~/.claude/.credentials.json)
    ├── providers/
    │   ├── claude.ts           # Claude provider (snapshot/restore credentials + identity)
    │   └── registry.ts         # Provider registry and resolver factory
    ├── ui.ts                   # Re-exports from ui/ (facade module)
    └── ui/
        ├── types.ts            # OutputAdapter and PromptAdapter interfaces
        ├── clack.ts            # @clack/prompts implementation of UI adapters
        └── format.ts           # Color formatting with NO_COLOR/FORCE_COLOR support
```

## Data storage

### Directory layout

Claude Code stores authentication data in two locations:

**User's home directory (`~/.claude/`, `~/.claude.json`)**

- Managed by Claude Code itself
- Contains active OAuth account and credentials

**Profile directory (`~/.acsw/`)**

- Managed by `acsw`
- Contains saved profiles

```text
~/.acsw/
├── state.json                  # { active: "work" }
├── personal/
│   ├── profile.json            # Metadata: name, type, provider, createdAt, lastUsed
│   ├── credentials.json        # OAuth tokens (mode 600)
│   └── account.json            # User metadata: email, organization
├── work/
│   ├── profile.json
│   ├── credentials.json
│   └── account.json
└── hobby/
    ├── profile.json
    ├── credentials.json
    └── account.json
```

### Credential storage

Credentials are handled differently by platform to maximize security:

#### macOS (Keychain)

- Service name: `Claude Code-credentials`
- Account name: `$USER` (from environment)
- Value: JSON (modern) or hex-encoded JSON (legacy, auto-detected)
- Benefits: Encrypted by OS, auto-locks with screen
- Limitation: System-specific, won't transfer to other Macs

#### Linux / Windows (File-based)

- Location: `~/.claude/.credentials.json`
- Permissions: `600` (read/write by user only)
- Validation: Verified on every read
- Repair: `acsw repair` fixes permission issues automatically

### Metadata files

#### `state.json`

Tracks the active profile:

```json
{
  "active": "work"
}
```

#### `profile.json` (per profile)

Per-profile metadata:

```json
{
  "name": "work",
  "type": "oauth",
  "provider": "claude",
  "createdAt": "2026-03-20T15:30:00.000Z",
  "lastUsed": "2026-03-23T09:15:00.000Z"
}
```

#### `credentials.json` (per profile)

OAuth tokens used by Claude Code API client:

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-...",
    "refreshToken": "refresh-...",
    "expiresAt": 1711188600000,
    "scopes": ["user:inference"],
    "subscriptionType": "pro",
    "rateLimitTier": "pro"
  }
}
```

#### `account.json` (per profile)

User account info extracted from Claude Code's `~/.claude.json`:

```json
{
  "accountUuid": "uuid-...",
  "emailAddress": "user@example.com",
  "organizationUuid": "org-uuid-...",
  "displayName": "Alice",
  "organizationRole": "owner",
  "organizationName": "Acme Inc",
  "billingType": "monthly",
  "subscriptionCreatedAt": "2026-01-01T00:00:00.000Z"
}
```

## Switching algorithm

When you run `acsw use <name>`:

```text
1. Validate profile exists
   └─ Read ~/.acsw/<name>/profile.json

2. Check if already active
   └─ Return early if state.active === name

3. Check for running Claude
   └─ Use pgrep -xi claude (exact match, case-insensitive)
   └─ Warn user if found, or if check failed (null result)

4. Save current profile
   └─ Read live credentials from Keychain/file
   └─ Read live oauthAccount from ~/.claude.json
   └─ Write both to ~/.acsw/<active>/*

5. Load target profile
   ├─ Read ~/.acsw/<name>/credentials.json
   ├─ Write to Keychain (macOS) or ~/.claude/.credentials.json (Linux/Windows)
   ├─ Read ~/.acsw/<name>/account.json
   ├─ Write oauthAccount to ~/.claude.json
   └─ Update state.json with new active profile

6. Update metadata
   └─ Set lastUsed timestamp in profile.json
```

### Atomic writes

All JSON writes use atomic patterns to prevent corruption:

```typescript
// 1. Write to temp file
const tmpPath = `${path}.tmp`;
await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');

// 2. Set permissions (if sensitive)
await chmod(tmpPath, 0o600);

// 3. Atomic rename
renameSync(tmpPath, path);
```

This ensures partial writes never corrupt live files.

## Module responsibilities

### `profiles.ts`

Highest-level profile management:

- `listProfiles()` — Enumerate all profiles with metadata
- `addOAuthProfile(name)` — Create a new profile from current session
- `switchProfile(name)` — Execute full switch algorithm
- `removeProfile(name)` — Delete a profile
- `validateProfileName(name)` — Check name against `[a-zA-Z0-9_-]+` regex

### `credentials.ts` + `credentials/`

Credential storage abstraction using the `CredentialStore` interface:

```typescript
type CredentialStore = {
  read(): Promise<OAuthCredentials | null>;
  write(creds: OAuthCredentials): Promise<void>;
  delete(): Promise<void>;
};
```

`credentials.ts` exports `createCredentialStore(config)` which selects the backend based on `ProviderConfig.platform`:

- **macOS (`darwin`):** `keychain.ts` — shells out to `security` CLI for Keychain access
- **Other platforms:** `file.ts` — reads/writes `~/.claude/.credentials.json` with mode 600

### `providers/claude.ts`

The Claude provider implements the `Provider` interface (snapshot/restore design). It bundles two things into each snapshot:

1. OAuth credentials via `CredentialStore`
2. `oauthAccount` field from `~/.claude.json` via `config.ts`

### `providers/registry.ts`

Provider factory and resolver. `createResolver(config)` returns a cached `ProviderResolver` function that maps provider names to `Provider` instances.

### `config.ts`

Claude Code configuration file (`~/.claude.json`) management:

- `readOAuthAccount()` — Extract oauthAccount field
- `writeOAuthAccount(account)` — Update oauthAccount field (preserves all other keys)

### `fs.ts`

Shared file utilities:

- `isENOENT(error)` — Type-safe ENOENT check for catch blocks
- `readJsonOptional(path)` — Returns `null` for missing files, throws on corruption
- `readJsonWithFallback(path, fallback)` — Returns fallback for missing files
- `writeJson(path, data, mode?)` — Atomic write (temp file + rename)
- `writeJsonSecure(path, data)` — Atomic write with mode 600 and parent dir creation
- `ensureDir(path)` — Recursive mkdir

### `ui.ts` + `ui/`

Terminal UI with two abstraction layers:

- `ui/types.ts` — `OutputAdapter` and `PromptAdapter` interfaces
- `ui/clack.ts` — Implementation using `@clack/prompts`
- `ui/format.ts` — Color functions respecting `NO_COLOR`/`FORCE_COLOR`
- `ui.ts` — Facade that re-exports everything as a flat API

Exports: `success()`, `error()`, `warn()`, `info()`, `hint()`, `blank()`, `log()`, `confirm()`, `select()`, `bold()`, `dim()`, color functions, `formatSubscription()`

### `process.ts`

Process detection for safety checks:

- `isClaudeRunning()` — Uses `pgrep -xi claude` (exact match, case-insensitive). Returns `boolean | null` (null when detection fails)
- `checkClaudeStatus()` — Returns `ClaudeStatus` (`'running' | 'not-running' | 'unknown'`). No UI; callers decide how to present. Interactive commands use `guardClaudeRunning()` from `src/commands/guard-claude.ts`

### `repair.ts`

Profile validation and repair logic:

- `repairProfiles(config?)` — Scans all profiles, checks file integrity, fixes permissions. Returns `RepairSummary` with checked count and issue list. Accepts `RepairConfig` for testability.

### `types.ts`

TypeScript type definitions:

- `OAuthCredentials` — OAuth token structure
- `OAuthAccount` — User account metadata
- `ProfileMeta` — Profile metadata (name, type, provider, timestamps)
- `ProfileState` — Active profile tracking
- `ProfileInfo` — Combined profile info for UI display
- `ProfilesConfig` — Injected paths for testability (profilesDir, stateFile)
- `Provider` — Snapshot/restore interface for credential providers
- `ProviderSnapshot` — Opaque credential + identity bundle
- `ProviderConfig` — Platform, homedir, env injection for providers
- `ProviderResolver` — Factory function mapping provider names to instances
- `ProfileType` — `'oauth' | 'api-key'`
- `ProviderDisplayInfo` — Return type of `Provider.displayInfo()` (label, context, tier)
- `RepairResult` / `RepairSummary` / `RepairConfig` — Repair command types

## Command flow

### Interactive picker (no args)

```text
1. List all profiles with listProfiles()
2. Display @clack/prompts select menu
3. User picks a profile
4. Check if already active (return early if so)
5. Guard claude running
6. Call switchProfile(selected)
```

### Add command

```text
1. Validate name format
2. Check name doesn't already exist
3. Warn if Claude is running
4. Read current live credentials
5. Call addOAuthProfile(name)
6. Update state.json to active = name
7. Show success message with email/org
```

### Remove command

```text
1. Check profile exists
2. Prompt for confirmation
3. Delete ~/.acsw/<name>/
4. Clear state.json if was active
5. Show success message
```

### List command

```text
1. Enumerate profiles with listProfiles()
2. For each profile:
   - Show indicator (▸) if active
   - Display name, subscription tier, email, org
   - Color-code subscription type
```

### Repair command

```text
1. Scan ~/.acsw/ directory
2. For each profile:
   ├─ Check profile.json exists and is valid JSON
   ├─ Check credentials.json exists and is valid JSON
   ├─ Check credentials.json permissions (must be 600)
   │  └─ Fix automatically if wrong
   └─ Check account.json is valid JSON (if exists)
3. Check state.json references valid profile
4. Report fixed and unfixed issues
```

### Current command

```text
1. Read state.json to get active profile name
2. List profiles to get metadata
3. Display active profile info with colors
```

### Env command

Two modes: hook generation (`--use-on-cd`) and hook execution (`--apply`).

**`acsw env --use-on-cd`** (runs once during shell init):

```text
1. Detect shell from $SHELL (or --shell flag)
2. Output shell-specific hook code (zsh/bash/fish)
   └─ Hook calls `acsw env --apply` on every cd
```

**`acsw env --apply`** (runs on every cd):

```text
1. Early exit if $CI is set
2. Walk up directories from cwd looking for .acswrc
   └─ Return if none found
3. Parse and validate .acswrc JSON
   └─ Warn and exit on malformed config
4. Compare .acswrc profile to current active profile
   └─ No-op if already on correct profile
5. Check if Claude Code is running
   └─ Skip auto-switch if running or detection failed
6. Call switchProfile() to apply
7. Entire flow wrapped in 5-second timeout
   └─ On timeout: warn and set exitCode = 1
```

## Error handling

All commands wrap operations in try-catch and display user-friendly errors:

```typescript
try {
  // operation
} catch (err) {
  if (err instanceof Error) {
    ui.error(err.message);
  } else {
    ui.error(String(err));
  }
  process.exit(1);
}
```

Common errors:

- `Profile "<name>" does not exist` — File not found
- `No OAuth credentials found` — Claude not logged in
- `Profile name is required` — Empty name argument
- `Invalid name. Use letters, numbers, hyphens, or underscores.` — Regex fail
- `Failed to write credentials to macOS Keychain` — Keychain operation failed

## Security considerations

### Credential protection

1. **In-transit**: Credentials stored in macOS Keychain (encrypted) or file (mode 600)
2. **Atomic writes**: Temp file + atomic rename prevents partial corruption
3. **Process safety**: Warns if Claude Code is running (credentials in memory)

### No destructive side effects

- Settings, chat history, plugins, extensions never touched
- Only swaps `oauthAccount` field in `~/.claude.json`
- Only swaps credentials in Keychain or file
- All other application state preserved

### Profile isolation

- Each profile is a separate directory with its own credentials
- Removing a profile securely deletes its directory
- Cannot accidentally overwrite another profile (name validation + existence checks)
