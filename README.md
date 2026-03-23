# account-switch (acsw)

Switch between Claude Code accounts without logging out. Zero runtime dependencies.

Claude Code only supports one OAuth account at a time. This tool saves and restores credentials so you can switch instantly between personal, work, or team accounts.

## Install

```bash
git clone https://github.com/oakoss/account-switch
cd account-switch
pnpm install
bun run build
cp dist/acsw ~/.local/bin/
```

## Usage

Save your current session:

```bash
acsw add personal
```

Log into another account via Claude Code, then save it:

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

## Commands

| Command | Description |
|---------|-------------|
| `acsw` | Interactive profile picker |
| `acsw add <name>` | Save current session as profile |
| `acsw use <name>` | Switch to profile |
| `acsw <name>` | Shortcut for `use` |
| `acsw list` | List all profiles |
| `acsw remove <name>` | Delete a profile |
| `acsw current` | Show active profile |
| `acsw repair` | Validate and fix profiles |

## How it works

- Swaps OAuth credentials (macOS Keychain or `~/.claude/.credentials.json` on Linux) and the `oauthAccount` field in `~/.claude.json`
- Never touches `settings.json`, memory, plugins, or project config
- Saves the current profile back before switching (no stale tokens)
- Warns if Claude Code is running

## Docs

See [docs/](./docs/) for architecture, usage guide, and future improvements.

## Development

```bash
pnpm install
bun run dev -- list        # run from source
bun test                   # run tests
pnpm lint                  # oxlint
pnpm format:check          # oxfmt
pnpm lint:md               # markdownlint
bun run build              # compile standalone binary
```

## License

[MIT](./LICENSE)
