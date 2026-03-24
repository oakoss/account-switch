---
"@oakoss/account-switch": minor
---

Add `acsw env` command for automatic profile switching on directory change

- Shell hooks for zsh, bash, and fish via `acsw env --use-on-cd`
- `.acswrc` config file with directory walk (nearest-ancestor wins, like `.nvmrc`)
- Non-interactive Claude detection skips switch when Claude is running
- Config validation with clear error messages for malformed `.acswrc` files
- Defensive error handling for the cd-hook context (no stack traces, exit code 1 on failure)
