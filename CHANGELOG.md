# Changelog

## 0.5.1

### Patch Changes

- [`efefd24`](https://github.com/oakoss/account-switch/commit/efefd242358b3665fa50373f12c4dd8fed1d9a35) Thanks [@jbabin91](https://github.com/jbabin91)! - Extract process detection into platform-specific backends. Adds Windows support via `tasklist` alongside existing `pgrep` for macOS/Linux.

## 0.5.0

### Minor Changes

- [`8acf5bb`](https://github.com/oakoss/account-switch/commit/8acf5bb3eb25a32fe7958f8d353b7d2f0bcdb3ce) Thanks [@jbabin91](https://github.com/jbabin91)! - Replace macOS Keychain shell-out with `@napi-rs/keyring` for cross-platform credential storage. macOS uses Keychain, Windows uses Credential Vault. Linux remains file-based.

### Patch Changes

- [`098b6f0`](https://github.com/oakoss/account-switch/commit/098b6f0704fc8c6e562f2c20a3e5eef8af2c40b0) Thanks [@jbabin91](https://github.com/jbabin91)! - Unify switch-profile workflow and improve error handling. Permission errors on profile directories now surface correctly instead of being silently ignored.

- [`011b2bc`](https://github.com/oakoss/account-switch/commit/011b2bcaaec0a9fdebb0a98615086d26f3c24f65) Thanks [@jbabin91](https://github.com/jbabin91)! - Consolidate command definitions into a single source of truth. Fixes stale "Validate and repair profiles" description in shell completions.

## 0.4.0

### Minor Changes

- [`78dc934`](https://github.com/oakoss/account-switch/commit/78dc9341675f8499717fc31cb73fe54d970c2e39) Thanks [@jbabin91](https://github.com/jbabin91)! - Add `acsw completions` command for shell tab completion (bash, zsh, fish). Completes subcommand names and profile names dynamically.

### Patch Changes

- [`ea8b455`](https://github.com/oakoss/account-switch/commit/ea8b455398810ffd7ce3d40d1c40eb5073e1d023) Thanks [@jbabin91](https://github.com/jbabin91)! - Fix "Bun is not defined" crash when installed via npm/pnpm. Replace Bun-specific APIs with Node.js equivalents so the `--target node` build works in both runtimes.

## 0.3.0

### Minor Changes

- [`ee617f7`](https://github.com/oakoss/account-switch/commit/ee617f7f543d8d2cff9caca28c3af85abeb19f26) Thanks [@jbabin91](https://github.com/jbabin91)! - Migrate CLI to citty + @clack/prompts with swappable UI abstraction

  - **citty** handles arg parsing, subcommands, typed args, and auto-generated help text
  - **@clack/prompts** powers interactive select picker, confirm dialogs, and structured log output
  - UI abstraction layer (`OutputAdapter`/`PromptAdapter`) enables swapping implementations by changing one import
  - Per-command `--help` now available (e.g., `acsw add --help`)
  - Interactive profile picker uses arrow-key select instead of numbered input
  - Ctrl+C during prompts exits cleanly with code 130

- [`fb7ff0f`](https://github.com/oakoss/account-switch/commit/fb7ff0f7d22211c39751f02358610a26c8e2e2db) Thanks [@jbabin91](https://github.com/jbabin91)! - Add `acsw env` command for automatic profile switching on directory change
  - Shell hooks for zsh, bash, and fish via `acsw env --use-on-cd`
  - `.acswrc` config file with directory walk (nearest-ancestor wins, like `.nvmrc`)
  - Non-interactive Claude detection skips switch when Claude is running
  - Config validation with clear error messages for malformed `.acswrc` files
  - Defensive error handling for the cd-hook context (no stack traces, exit code 1 on failure)

## 0.2.0

### Minor Changes

- [`6fb1a12`](https://github.com/oakoss/account-switch/commit/6fb1a12a4decee81888ee024289a7c1809153ff9) Thanks [@jbabin91](https://github.com/jbabin91)! - Add Provider abstraction and `--provider` flag for multi-provider support
  - Provider interface with snapshot/restore semantics for credential storage
  - `--provider` flag on `acsw add` (defaults to claude)
  - Profiles dispatch to the correct provider via stored metadata
  - Repair logic extracted to library with path injection for testability
  - ProfilesConfig injection eliminates mock.module from tests
  - 52 tests covering all exported functions (up from 9)
