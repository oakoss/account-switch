# 002: CLI framework and UI abstraction

**Status:** Accepted
**Date:** 2026-03-24

## Context

Needed subcommand routing, typed argument parsing, auto-generated help, and interactive prompts (select, confirm). The original implementation used manual arg parsing and raw ANSI output.

## Decision

Adopt **citty** for CLI framework and **@clack/prompts** for interactive UI. Abstract output and prompts behind `OutputAdapter` and `PromptAdapter` interfaces in `src/lib/ui/types.ts`.

Color formatting is handled inline in `src/lib/ui/format.ts` (~60 lines), respecting `NO_COLOR` and `FORCE_COLOR` per [no-color.org](https://no-color.org/).

## Alternatives considered

| Option | Why not |
|--------|---------|
| cleye | citty has 100x adoption and 0 deps |
| commander / yargs | Heavy; designed for Node, not Bun-first |
| inquirer | 2.5 MB+, many transitive deps |
| picocolors | Existing format.ts covers the same ground in ~5 lines of NO_COLOR logic |

## Consequences

- Lazy subcommand loading via citty's `() => import()` pattern — unused commands don't add startup cost
- UI is swappable: `clack.ts` wires the concrete implementation, but tests or alternative UIs can substitute
- `process.exit(130)` on cancel lives in `clack.ts` — the one exception to "no process.exit in lib/"
- citty owns help text and version display
