# acsw Documentation

Welcome to the `acsw` documentation. Guides for understanding, using, and extending the Claude Code account switcher.

## Documentation structure

### [overview.md](./overview.md)

**What this tool does and why it exists**

Start here if you're new to `acsw`. Learn about:

- The problem it solves (Claude Code only supports one account at a time)
- How it compares to alternatives
- Key features and design principles
- Getting started in 3 minutes

### [usage.md](./usage.md)

**Complete command reference and walkthrough**

Reference guide for all commands:

- `add`, `use`, `list`, `remove`, `current`, `repair`, `env`
- Interactive picker
- Common workflows and troubleshooting
- Security notes

Read this when you want to:

- Learn how to use a specific command
- Set up two or more accounts
- Troubleshoot common issues
- Understand security implications

### [architecture.md](./architecture.md)

**Internal design and data flow**

Deep dive into the codebase:

- Project structure and module responsibilities
- Data storage layout (`~/.acsw/` directory structure)
- Credential storage (macOS Keychain vs file-based)
- Switching algorithm step by step
- Security considerations

Read this when you want to:

- Understand how the tool works internally
- Contribute code
- Debug issues
- Review security properties

### [coding-standards.md](./coding-standards.md)

**Coding patterns and conventions**

Patterns enforced across the codebase:

- Module boundaries (lib vs commands, shared helpers)
- Config injection for testability
- Import conventions and error handling tiers
- File I/O, type, and testing patterns
- Linting and formatting rules

Read this when you want to:

- Write new code that matches existing patterns
- Add tests for a module
- Understand why code is structured a certain way

### [decisions/](./decisions/)

**Architecture Decision Records (ADRs)**

Key design decisions with context, alternatives considered, and consequences. See [decisions/README.md](./decisions/README.md) for the index.

Read this if you want to:

- Understand why the code is designed a certain way
- Review past design trade-offs
- Propose a new architectural decision

## Quick navigation

**I want to...**

- Get started with two accounts → [usage.md](./usage.md#quick-start-two-accounts)
- See all commands → [usage.md](./usage.md#all-commands)
- Troubleshoot an issue → [usage.md](./usage.md#troubleshooting)
- Understand how it works → [architecture.md](./architecture.md)
- See design decisions → [decisions/](./decisions/)
- Learn about security → [architecture.md](./architecture.md#security-considerations) or [usage.md](./usage.md#security-notes)

## Key concepts

### Profiles

A profile is a saved Claude Code account state, stored in `~/.acsw/<name>/`:

```text
personal/
├── profile.json       # Metadata: creation date, last used
├── credentials.json   # OAuth tokens
└── account.json       # User info: email, organization
```

### Active profile

Only one profile can be active at a time. The active profile is stored in `~/.acsw/state.json`:

```json
{ "active": "work" }
```

When you switch profiles, the old profile's credentials are saved, and the new profile's credentials are loaded into Claude Code.

### Safe switching

Switching only touches:

- **Credentials** (OAuth tokens in Keychain or file)
- **Account metadata** (email, organization)

Never touches:

- Settings, chat history, installed extensions, or plugins
- Any other part of Claude Code

### Cross-platform storage

**macOS:**

- Credentials stored in system Keychain (encrypted, locked with screen)
- Account metadata in files (mode 600)

**Linux / Windows:**

- All data in files (mode 600, read/write by user only)
- No native encryption (depends on disk encryption)

## Getting started

1. **Install** — Build from source or download binary
2. **First profile** — Run `acsw add personal` when logged in
3. **Second account** — Log into Claude Code with new account, run `acsw add work`
4. **Switch** — Use `acsw use work` or just `acsw` for interactive picker

Full walkthrough: [Quick start: Two accounts](./usage.md#quick-start-two-accounts)

## Contributing

Interested in contributing? Start by:

1. Reading [architecture.md](./architecture.md) to understand the codebase
2. Checking [decisions/](./decisions/) for design context
3. Running tests with `pnpm test`
4. Checking type safety with `pnpm typecheck`

Development workflow:

```bash
git clone https://github.com/oakoss/account-switch
cd account-switch
pnpm install
pnpm dev -- list      # Run from source
pnpm test             # Run tests
pnpm lint             # Lint
pnpm format:check     # Format check
pnpm build            # Compile to binary
```

## Support

- **Documentation** — Consult the guides above
- **Issues** — Check existing issues or create a new one
- **Discussions** — Share ideas and ask questions

## License

MIT. See LICENSE file.

## Changelog

See [GitHub releases](https://github.com/oakoss/account-switch/releases) for changelog.
