# 008: Shell hook design

**Status:** Accepted
**Date:** 2026-03-24

## Context

Users work across multiple projects with different Claude accounts. Manually running `acsw use <profile>` on every `cd` is tedious. fnm and nvm solve the analogous problem for Node versions with shell hooks and `.nvmrc` files.

## Decision

Auto-switch profiles on `cd` using `.acswrc` files and shell hooks.

**Project config** (`.acswrc` in project root):

```json
{ "profile": "work" }
```

**Shell setup:**

```bash
# ~/.zshrc or ~/.bashrc
eval "$(acsw env --use-on-cd)"

# ~/.config/fish/conf.d/acsw.fish
acsw env --use-on-cd | source
```

**Behavior:**

- Shell hook invokes `acsw env --apply` on directory change
- Walks up directories for nearest `.acswrc` (ancestor wins, like `.nvmrc`)
- No-op if already on the target profile
- Checks for running Claude sessions before switching (skips if running or unknown)
- 5-second timeout prevents shell hangs (see [007](007-startup-time-budget.md))
- CI environments skip entirely (`process.env.CI`)

**Lib/command split:** Pure lookup and validation logic (`findAcswrc`, `readAcswrc`, `detectShell`, `generateHook`) lives in `src/lib/env.ts`. Orchestration with timeout lives in `src/commands/env.ts`.

## Alternatives considered

| Option                                 | Why not                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| Environment variable per project       | Requires manual setup in each shell session; doesn't persist    |
| Global config mapping dirs to profiles | Brittle when projects move; central config becomes a bottleneck |
| Git hooks (post-checkout)              | Only triggers on git operations, not `cd`                       |

## Consequences

- Per-project config with zero global state
- Works with zsh, bash, and fish
- Requires one-time shell hook setup
- Future: multi-provider support in `.acswrc` (e.g., `{ "claude": "work", "aws": "prod" }`) blocked on adding more providers
