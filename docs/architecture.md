# Architecture

This document describes the internal structure and data flow of `acsw`.

## Project structure

```
src/
├── index.ts                    # CLI entry point, command routing
├── commands/
│   ├── add.ts                  # Save current session as profile
│   ├── use.ts                  # Switch to a profile
│   ├── list.ts                 # List all profiles
│   ├── remove.ts               # Delete a profile
│   ├── current.ts              # Show active profile
│   └── repair.ts               # Validate and fix profiles
└── lib/
    ├── types.ts                # Type definitions
    ├── constants.ts            # Paths, regex, service names
    ├── profiles.ts             # Profile CRUD operations
    ├── credentials.ts          # Credential storage (Keychain/file)
    ├── config.ts               # OAuth account metadata
    ├── process.ts              # Process detection (is Claude running)
    └── ui.ts                   # Terminal UI (colors, prompts, formatting)
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

```
~/.acsw/
├── state.json                  # { active: "work" }
├── personal/
│   ├── profile.json            # Metadata: name, createdAt, lastUsed
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

Immutable metadata about a profile:

```json
{
  "name": "work",
  "type": "oauth",
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

```
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
const tmpPath = `${path}.tmp`
await Bun.write(tmpPath, JSON.stringify(data, null, 2))

// 2. Set permissions (if sensitive)
await chmod(tmpPath, 0o600)

// 3. Atomic rename
renameSync(tmpPath, path)
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

### `credentials.ts`

Credential storage abstraction:

- `readCredentials()` — Get credentials from Keychain (macOS) or file
- `writeCredentials(creds)` — Store credentials securely
- `deleteCredentials()` — Remove credentials (rarely used)
- `copyCredentials(from, to)` — Used internally for testing

Platform detection:

```typescript
const IS_MACOS = process.platform === "darwin"

// On macOS: Use Keychain
// On Linux/Windows: Use ~/.claude/.credentials.json
```

### `config.ts`

Claude Code configuration file (`~/.claude.json`) management:

- `readOAuthAccount()` — Extract oauthAccount field
- `writeOAuthAccount(account)` — Update oauthAccount field

Preserves all other fields in `~/.claude.json` (settings, plugins, etc.).

### `ui.ts`

Terminal UI primitives:

- Colors: `success()`, `error()`, `warn()`, `info()`, `hint()`
- Formatting: `bold()`, `dim()`, `green()`, `cyan()`, `yellow()`, `magenta()`, `blue()`
- Input: `confirm()`, `prompt()`, `pickNumber()`
- Subscriptions: `formatSubscription(tier)` — Color-codes "Pro", "Max", "Free", etc.

### `process.ts`

Process detection for safety checks:

- `isClaudeRunning()` — Uses `pgrep -xi claude` (exact match, case-insensitive). Returns `boolean | null` (null when check can't run)

### `types.ts`

TypeScript type definitions:

- `OAuthCredentials` — OAuth token structure
- `OAuthAccount` — User account metadata
- `ProfileMeta` — Profile immutable metadata
- `ProfileState` — Active profile tracking
- `ProfileInfo` — Combined profile info for UI display
- `RepairResult` — Repair command issue tracking

## Command flow

### Interactive picker (no args)

```
1. List all profiles with listProfiles()
2. Display numbered menu
3. Prompt for selection (1-N)
4. Call use(selected)
```

### Add command

```
1. Validate name format
2. Check name doesn't already exist
3. Warn if Claude is running
4. Read current live credentials
5. Call addOAuthProfile(name)
6. Update state.json to active = name
7. Show success message with email/org
```

### Remove command

```
1. Check profile exists
2. Prompt for confirmation
3. Delete ~/.acsw/<name>/
4. Clear state.json if was active
5. Show success message
```

### List command

```
1. Enumerate profiles with listProfiles()
2. For each profile:
   - Show indicator (▸) if active
   - Display name, subscription tier, email, org
   - Color-code subscription type
```

### Repair command

```
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

```
1. Read state.json to get active profile name
2. List profiles to get metadata
3. Display active profile info with colors
```

## Error handling

All commands wrap operations in try-catch and display user-friendly errors:

```typescript
try {
  // operation
} catch (err) {
  if (err instanceof Error) {
    ui.error(err.message)
  } else {
    ui.error(String(err))
  }
  process.exit(1)
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
