# Usage Guide

## Installation

### From source

```bash
git clone https://github.com/oakoss/account-switch
cd account-switch
bun run build
```

The binary is available at `dist/acsw`. Add it to your PATH:

```bash
mkdir -p ~/.local/bin
mv dist/acsw ~/.local/bin/
export PATH="$HOME/.local/bin:$PATH"  # Add to ~/.zshrc or ~/.bashrc
```

Or install globally:

```bash
sudo mv dist/acsw /usr/local/bin/
```

### Verify installation

```bash
acsw --help
```

Should show:

```
  acsw — Switch between Claude Code accounts

  Usage:
    acsw                  Interactive profile picker
    acsw add <name>       Save current session as a profile
    acsw use <name>       Switch to a profile
    acsw list             List all profiles
    acsw remove <name>    Remove a profile
    acsw current          Show active profile
    acsw repair           Validate and fix profiles
    acsw help             Show this help

  Shortcuts:
    acsw <name>           Same as 'use <name>'
    acsw ls               Same as 'list'
    acsw rm <name>        Same as 'remove <name>'
```

## Quick start: Two accounts

### 1. Log into your personal account

Open Claude Code and log in with your personal account.

### 2. Save personal profile

```bash
acsw add personal
```

Output:

```
  ● Found active session: alice@example.com
    Personal Workspace

  ✓ Profile personal saved

```

### 3. Log into your work account

In Claude Code: Settings → Sign out → Log in with work account.

Wait for Claude Code to fully load before proceeding.

### 4. Save work profile

```bash
acsw add work
```

Output:

```
  ● Found active session: alice@company.com
    Company Inc

  ✓ Profile work saved

```

### 5. Switch between accounts

#### Interactive picker

```bash
acsw
```

Shows:

```
  Switch profile

  1. personal  Pro  alice@example.com
  2. work      Team  alice@company.com

  Select [1-2]: _
```

Type `1` or `2` and press Enter. Claude Code will reload on next window focus.

#### Direct switch

```bash
acsw use personal
acsw use work
```

Or use the shortcut:

```bash
acsw personal
acsw work
```

#### Check current profile

```bash
acsw current
```

Shows:

```
  personal  Pro
  alice@example.com

```

## All commands

### `acsw` (no args)

Opens interactive profile picker.

```bash
acsw
```

Shows numbered menu, prompts you to select (1-N).

**Use when:** You have multiple profiles and want to pick interactively.

### `acsw add <name>`

Save your current Claude Code session as a profile.

```bash
acsw add personal
acsw add work
acsw add hobby
```

**Requirements:**
- You must be logged into Claude Code
- Profile name must be unique (can't already exist)
- Uses pattern: `[a-zA-Z0-9_-]` (letters, numbers, hyphens, underscores)

**What it saves:**
- OAuth credentials (access token, refresh token, expiration)
- Account metadata (email, organization, subscription tier)
- Creation timestamp

**Warning:** If Claude Code is running, you'll see:

```
  ⚠ Claude Code appears to be running.
  Continue anyway? [y/N] _
```

This is safe but recommended to close Claude Code first to ensure fresh credentials are captured.

### `acsw use <name>`

Switch to an existing profile.

```bash
acsw use work
acsw use personal
```

**What happens:**
1. Your current session is saved back to the active profile
2. The target profile's credentials are loaded
3. The active profile is updated
4. You'll see a confirmation:

```
  ✓ Switched to work  Team
    alice@company.com
    Company Inc

```

5. Claude Code picks up the new account on next window focus or restart

**Warning:** If Claude Code is running, you'll see:

```
  ⚠ Claude Code appears to be running.
  ⚠ Switching profiles while Claude is active may cause errors.
  Continue anyway? [y/N] _
```

This is because Claude Code keeps credentials in memory. Switching while it's running risks inconsistent state. **Recommended:** Close Claude Code, switch, then reopen.

### Shortcut: `acsw <name>`

Equivalent to `acsw use <name>`. Useful for fast switching.

```bash
acsw work    # Same as: acsw use work
acsw hobby   # Same as: acsw use hobby
```

If the name doesn't match any profile, you'll see:

```
  ✗ Unknown command: "typo"
  (help output)
```

### `acsw list` or `acsw ls`

List all saved profiles.

```bash
acsw list
```

Output:

```
  Profiles

  ▸ personal  Pro  alice@example.com
    work      Team  alice@company.com
    Company Inc
    hobby     Free

```

**Indicators:**
- `▸` (green arrow) = currently active profile
- Subscription tier with color (Pro=cyan, Max=magenta, Free=dim, Team=blue, Enterprise=yellow)
- Email address (dimmed)
- Organization name (indented, if any)

### `acsw remove <name>` or `acsw rm <name>`

Delete a profile.

```bash
acsw remove hobby
acsw rm work
```

Prompts for confirmation:

```
  Delete profile "hobby"? [y/N] _
```

If the profile is active, shows a warning:

```
  Delete profile "work"? (currently active) [y/N] _
```

Deletes `~/.acsw/<name>/` and all its files.

### `acsw current`

Show the currently active profile.

```bash
acsw current
```

Output:

```
  work  Team
  alice@company.com
  Company Inc

```

Or if no profile is active:

```
  ● No active profile
  Run 'acsw add <name>' to create one.

```

### `acsw repair`

Validate all profiles and fix issues automatically.

```bash
acsw repair
```

Checks:

- `profile.json` exists and is valid JSON
- `credentials.json` exists and is valid JSON
- `account.json` is valid JSON (if exists)
- `credentials.json` has correct permissions (mode 600)
- `state.json` references an existing profile

**Example output (all healthy):**

```
  ● Checking profiles...

  ✓ All profiles healthy (3 checked)

```

**Example output (with issues):**

```
  ● Checking profiles...

  [fixed] work: credentials.json had permissions 644, fixed to 600
  [issue] hobby: Missing credentials.json

  ✓ Fixed 1 issue(s)
  ⚠ 1 issue(s) need manual attention

```

**Automatic fixes:**
- Permission errors on `credentials.json` → Fixed to mode 600

**Manual attention required:**
- Missing files → Re-run `acsw add <name>` or manually restore
- Corrupted JSON → Delete profile with `acsw remove <name>`
- Broken state reference → Delete `~/.acsw/state.json` and re-add profiles

### `acsw help` or `acsw --help` or `acsw -h`

Show help text.

```bash
acsw help
acsw --help
acsw -h
```

## Common workflows

### Switching regularly between two accounts

Set up aliases in your shell:

```bash
# ~/.zshrc or ~/.bashrc
alias cwork='acsw work'
alias cpersonal='acsw personal'
```

Then:

```bash
cwork      # Switch to work
cpersonal  # Switch to personal
```

### Switching to a new account

1. Close Claude Code
2. Log in to Claude Code with the new account
3. Wait for full load (~10 seconds)
4. Run `acsw add <name>`
5. Proceed with normal switching

### Checking subscription status

```bash
acsw list
```

Each profile shows its subscription tier:

```
  ▸ personal  Pro        alice@example.com
    work      Team       alice@company.com
```

### Recovering from a broken profile

If a profile is corrupted or credentials expired:

```bash
acsw repair
```

This fixes permission issues. For missing or corrupted files:

1. Remove the broken profile:
   ```bash
   acsw rm <name>
   ```

2. Log back into Claude Code with that account

3. Re-save the profile:
   ```bash
   acsw add <name>
   ```

### Exporting profile information

List all profiles as JSON-like output:

```bash
acsw list
```

The internal format is stored in `~/.acsw/<name>/`:

- `profile.json` — Metadata (creation date, last used)
- `account.json` — User info (email, organization, subscription)
- `credentials.json` — OAuth tokens

See `./architecture.md` for file format details.

## Troubleshooting

### "No OAuth credentials found. Log in with 'claude' first."

**Cause:** You're not logged into Claude Code yet.

**Fix:** Open Claude Code and complete the login flow. Wait until you see your account and chat history. Then try again.

### "Profile '<name>' already exists."

**Cause:** You're trying to add a profile that already exists.

**Fix:** Either remove it first or use a different name:

```bash
acsw remove old-name
acsw add old-name
```

Or just use a new name:

```bash
acsw add new-name
```

### "Claude Code appears to be running. Continue anyway?"

**Cause:** `acsw` detected Claude Code process in memory.

**Why:** Credentials are loaded into Claude Code's memory. Switching while it's running risks inconsistent state or loss of recent work.

**Fix:** Close Claude Code, run the command, then reopen.

**Safe to ignore?** Only if you're not actively using Claude Code or if you're certain no important chat history is unsaved.

### Claude Code still shows old account after switching

**Cause:** Claude Code caches OAuth account in memory.

**Fix:** Restart Claude Code completely (not just close the window):

```bash
# macOS
killall "Claude" || true
# or manually quit the app
```

Then reopen Claude Code.

### Repair shows "credentials.json had permissions 644, fixed to 600"

**Cause:** File permissions were loosened (readable by others).

**Fix:** Already fixed by `acsw repair`. No action needed.

### Can't switch because "Profile 'name' not found"

**Cause:** Profile doesn't exist or name is misspelled.

**Fix:** Check available profiles:

```bash
acsw list
```

Then use the exact name shown.

### Multiple Claude windows showing different accounts

**Cause:** Two windows loaded different cached versions before you switched profiles.

**Fix:**
1. Fully close all Claude Code windows
2. Switch profile with `acsw use <name>`
3. Reopen Claude Code

The delay ensures the new account is loaded.

## Performance

All commands complete in < 1 second:

- `acsw list` — ~100ms (reads filesystem)
- `acsw add <name>` — ~200ms (reads + writes)
- `acsw use <name>` — ~300ms (read + write + atomic ops)
- `acsw repair` — ~50-100ms per profile

No network calls. All operations are local filesystem + macOS Keychain (if applicable).

## Security notes

- Credentials are stored securely:
  - **macOS:** Encrypted in system Keychain, locked with screen
  - **Linux/Windows:** File with mode 600 (read/write by user only)
- `acsw` never stores passwords, only OAuth tokens
- `acsw` never modifies `settings.json` or chat history
- Profile files can't be read by other users (mode 600)
- Each profile is completely isolated

Never share profile directories or copy `.acsw/` between machines (credentials are machine-specific on macOS).

## Need help?

- Check `./architecture.md` for internal implementation details
- Run `acsw help` for command reference
- Use `acsw repair` to check profile health
