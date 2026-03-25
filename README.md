# account-switch (acsw)

Switch between Claude Code accounts without logging out. Minimal runtime dependencies.

Claude Code only supports one OAuth account at a time. This tool saves and restores credentials so you can switch instantly between personal, work, or team accounts.

## Install

```bash
git clone https://github.com/oakoss/account-switch
cd account-switch
pnpm install
pnpm build
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
| `acsw env` | Shell hook setup for auto-switching |

## Auto-switch on cd

Automatically switch profiles when entering a project directory:

```bash
# Add to ~/.zshrc or ~/.bashrc
eval "$(acsw env --use-on-cd)"
```

Then create a `.acswrc` in your project root:

```json
{ "profile": "work" }
```

Now when you `cd` into that directory, acsw switches to the `work` profile automatically.

## How it works

- Swaps OAuth credentials (macOS Keychain or `~/.claude/.credentials.json` on Linux) and the `oauthAccount` field in `~/.claude.json`
- Never touches `settings.json`, memory, plugins, or project config
- Saves the current profile back before switching (no stale tokens)
- Warns if Claude Code is running

## Docs

See [docs/](./docs/) for architecture, usage guide, and design decisions.

## Development

```bash
pnpm install
pnpm dev -- list           # run from source
pnpm test                  # run tests
pnpm lint                  # oxlint
pnpm format:check          # oxfmt
pnpm lint:md               # markdownlint
pnpm build                 # compile standalone binary
```

## License

[MIT](./LICENSE)
