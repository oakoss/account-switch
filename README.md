# account-switch (acsw)

Switch between Claude Code accounts without logging out. Minimal runtime dependencies.

Claude Code only supports one OAuth account at a time. This tool saves and restores credentials so you can switch instantly between personal, work, or team accounts.

## Install

```bash
# pnpm
pnpm add -g @oakoss/account-switch

# npm
npm install -g @oakoss/account-switch
```

Or build from source:

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

| Command                    | Description                         |
| -------------------------- | ----------------------------------- |
| `acsw`                     | Interactive profile picker          |
| `acsw add <name>`          | Save current session as a profile   |
| `acsw use <name>`          | Switch to a profile                 |
| `acsw <name>`              | Shortcut for `use`                  |
| `acsw list` (`ls`)         | List all profiles                   |
| `acsw remove <name>` (`rm`) | Remove a profile                    |
| `acsw current`             | Show active profile                 |
| `acsw repair`              | Validate and fix profiles           |
| `acsw env`                 | Shell integration for auto-switching |
| `acsw completions <shell>` | Generate shell completions          |

## Shell completions

```bash
# Zsh: add to ~/.zshrc
eval "$(acsw completions zsh)"

# Bash: add to ~/.bashrc
eval "$(acsw completions bash)"

# Fish: save to completions directory
acsw completions fish > ~/.config/fish/completions/acsw.fish
```

Completions cover subcommands and profile names for `use`, `remove`, and bare `acsw <profile>`.

## Auto-switch on cd

Automatically switch profiles when entering a project directory:

```bash
# Zsh: ~/.zshrc | Bash: ~/.bashrc
eval "$(acsw env --use-on-cd)"

# Fish: ~/.config/fish/conf.d/acsw.fish
acsw env --use-on-cd | source
```

Then create a `.acswrc` in your project root:

```json
{ "profile": "work" }
```

Now when you `cd` into that directory, acsw switches to the `work` profile automatically.

## How it works

- Swaps OAuth credentials (system keyring on macOS/Windows, `~/.claude/.credentials.json` on Linux) and the `oauthAccount` field in `~/.claude.json`
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
pnpm typecheck             # typescript type checking
pnpm lint                  # oxlint
pnpm format:check          # oxfmt
pnpm lint:md               # markdownlint
pnpm build                 # compile standalone binary
```

## License

[MIT](./LICENSE)
