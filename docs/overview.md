# Overview

`acsw` is a CLI tool for switching between multiple Claude Code accounts. It solves a limitation of Claude Code: **only one OAuth account at a time**.

## Problem

Claude Code (the Anthropic IDE) only supports a single logged-in account per installation. If you have:

- A personal Claude Code subscription
- A work team subscription
- Multiple organization accounts

You must manually log out and log back in each time you need to switch contexts. This is time-consuming and error-prone.

## Why a new tool?

Several community solutions exist, but each has tradeoffs:

| Tool | Approach | Tradeoff |
|------|----------|----------|
| [hoangvu12/acsw](https://github.com/hoangvu12/acsw) | npm dependency | Supply chain risk, npm package maintenance burden |
| [rzkmak/acsw](https://github.com/rzkmak/acsw) | Swaps entire `settings.json` | Loses custom settings, editor configuration, installed extensions |
| Keychain + shell script | Manual credential management | Security risk, complex setup, hard to maintain |

## Solution

`acsw` is purpose-built with three principles:

1. **Zero runtime dependencies** — Built with Bun, compiles to a standalone binary. No npm installation needed.
2. **Minimal scope** — Only swaps credentials and `oauthAccount` data. Never touches `settings.json`, memory/chat history, plugins, or extensions.
3. **Secure storage** — Uses macOS Keychain on Mac, file-based storage on Linux/Windows with strict permissions (0o600).

## What it does

`acsw` profiles are stored in `~/.acsw/`. Each profile contains:

- **credentials.json** — OAuth tokens (access token, refresh token, expiration)
- **account.json** — User metadata (email, organization, subscription type)
- **profile.json** — Profile metadata (name, creation date, last used)

When you switch profiles:

1. Current credentials and account info are saved back to the active profile
2. Target profile's credentials and account info are loaded into Claude Code
3. Claude Code picks up the new account on next launch
4. All your settings, chat history, and plugins remain untouched

## Key features

- **Interactive picker** — Run `acsw` with no args to pick from a numbered list
- **Profile shortcuts** — `acsw personal` switches faster than `acsw use personal`
- **Metadata** — Each profile shows subscription tier (Free, Pro, Max, Team, Enterprise)
- **Repair command** — Validates profile integrity and fixes permissions automatically
- **Cross-platform** — macOS (Keychain), Linux (file-based), Windows (file-based)

## Installation

### From source

```bash
git clone https://github.com/oakoss/account-switch
cd account-switch
bun run build
mv dist/acsw /usr/local/bin/
```

### Requirements

- Bun 1.0+
- macOS 10.12+ (Keychain), or Linux/Windows with file access
- At least one active Claude Code login

## Getting started

Save your current session:

```bash
acsw add personal
```

After logging into a different account:

```bash
acsw add work
```

Switch between them:

```bash
acsw use personal
acsw use work
```

Or use the interactive picker:

```bash
acsw
```

See [usage.md](./usage.md) for complete command reference.
