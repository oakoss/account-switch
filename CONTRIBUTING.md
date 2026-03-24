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

We use [conventional commits](https://www.conventionalcommits.org/). Lefthook runs pre-commit hooks automatically (lint, format, typecheck) and validates commit messages via commitlint.

```
feat(cli): add shell completions
fix(credentials): handle expired tokens
chore(deps): bump dependencies
docs: update usage guide
```

Scopes: `cli`, `config`, `credentials`, `deps`, `profiles`, `tooling`, `ui`

## Releases

We use [changesets](https://github.com/changesets/changesets) for versioning.

When your change should be included in a release:

```bash
pnpm changeset             # interactive: pick patch/minor/major, write summary
# or
pnpm changeset:auto        # auto-generate from conventional commits
```

Commit the `.changeset/*.md` file with your PR. The release workflow handles the rest.

## Pull Requests

- Keep PRs focused on a single change
- Ensure CI passes (required for merge)
- Add tests for new features
- Update docs if behavior changes
