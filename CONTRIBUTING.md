# Contributing

## Setup

```bash
git clone https://github.com/oakoss/account-switch
cd account-switch
pnpm install
```

## Development

```bash
pnpm dev -- <cmd>     # run from source
pnpm test             # run tests
pnpm lint             # oxlint
pnpm format           # oxfmt
pnpm format:check     # check formatting
pnpm lint:md          # markdownlint
pnpm typecheck        # typescript
pnpm check-pkg        # build + publint + attw
pnpm build            # compile standalone binary
```

## Commits

We use [conventional commits](https://www.conventionalcommits.org/) enforced by commitlint (`commitlint.config.ts`). Lefthook runs pre-commit hooks automatically (lint, format, typecheck) and validates commit messages on commit-msg.

### Format

```text
type(scope): description
```

**Types** (from `@commitlint/config-conventional`): `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`, `style`, `build`, `revert`

**Scopes** (optional, but restricted to this list): `cli`, `config`, `credentials`, `deps`, `profiles`, `tooling`, `ui`

**Header max length:** 200 characters

### Examples

```text
feat(cli): add shell completions
fix(credentials): handle expired tokens
refactor: extract snapshot I/O to snapshot.ts
test: add env and config tests
docs: update usage guide
chore(deps): bump dependencies
```

### Aliases

The `cz-git` prompt provides shortcuts for common commits:

| Alias     | Expands to                           |
| --------- | ------------------------------------ |
| `ci`      | `ci: update workflows`               |
| `deps`    | `chore(deps): bump dependencies`     |
| `docs`    | `docs: update docs`                  |
| `tooling` | `chore(tooling): update dev tooling` |

### Commit grouping

Each commit should be one logical change. If you need "and" to connect two unrelated things in the commit message, split it.

| Change type             | Groups with                                            |
| ----------------------- | ------------------------------------------------------ |
| New feature             | Its tests, doc updates                                 |
| Refactor                | Doc updates                                            |
| Bug fix                 | Its test, doc update                                   |
| Tests for existing code | Related doc changes                                    |
| New/reorganized docs    | Related doc changes it triggers (CLAUDE.md, README.md) |

### When to write an ADR

Architectural decisions get an ADR in `docs/decisions/`. Write one when:

- **Adding or rejecting a dependency** — captures the evaluation so it doesn't get repeated
- **Introducing a new abstraction** — captures the interface design and alternatives
- **Changing how data is stored** — captures migration path and trade-offs

Use the [template](docs/decisions/000-template.md). Keep it concise.

### When to create a changeset

Changesets are for version bumps that npm consumers care about:

- **Needs changeset:** New commands, changed CLI behavior, bug fixes users would notice
- **No changeset:** Internal refactors, test additions, doc updates, CI changes

## Releases

We use [changesets](https://github.com/changesets/changesets) for versioning.

When your change should be included in a release:

```bash
pnpm changeset             # interactive: pick patch/minor/major, write summary
# or
pnpm changeset:auto        # auto-generate from conventional commits
```

Commit the `.changeset/*.md` file with your PR. The release workflow handles the rest.

## Review workflow

Before committing, run through this checklist:

1. Run checks: `pnpm format && pnpm test && pnpm lint && pnpm lint:md`
2. Review your changes (or run automated reviews)
3. Fix any issues found
4. If docs changed: review for accuracy against the codebase
5. Decide if a changeset is needed

## Pull Requests

- Keep PRs focused on a single change
- Ensure CI passes (required for merge)
- Add tests for new features
- Update docs if behavior changes
