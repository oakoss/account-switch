# 001: Dependency policy

**Status:** Accepted
**Date:** 2026-03-24

## Context

`acsw` is a CLI tool that runs on every `cd` via shell hook. Binary size (58 MB Bun overhead) and startup time (50ms budget) constrain dependency choices. As a credential-handling tool, supply chain risk matters more than in a typical CLI.

## Decision

Target minimal runtime dependencies. Currently 2: `citty` and `@clack/prompts`.

Evaluate libraries against three criteria:

- **Trust:** maintenance cadence, download volume, maintainer reputation
- **Performance:** bundle size, transitive dependency count
- **Value:** does it solve something the codebase can't do in <20 lines?

If a library fails any criterion, implement the functionality inline.

## Alternatives considered

| Library                | Category           | Why rejected                                                                      |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------- |
| picocolors             | Colors             | Existing `format.ts` is fine; just add `NO_COLOR` check (~5 lines)                |
| std-env                | Platform detection | Overkill for one `process.platform` check                                         |
| consola                | Logging            | Overlaps with existing clack-based UI abstraction                                 |
| conf / configstore     | Config files       | 5–9 transitive deps for functionality already in `fs.ts`                          |
| zod                    | Validation         | 700 KB+ for 2–3 small schemas. Revisit if config shapes multiply.                 |
| tinyexec               | Subprocess         | `exec()` in `@lib/spawn` is ~20 lines; tinyexec adds a dep for no gain           |
| cleye                  | CLI framework      | citty has 100x adoption, 0 deps, lazy subcommand loading                          |
| update-notifier        | Version check      | 10 transitive deps                                                                |
| simple-update-notifier | Version check      | Only relevant if npm is primary install channel                                   |
| shell-quote            | Arg quoting        | All `exec()` calls use array form — no shell injection risk                       |
| tabtab                 | Completions        | Abandoned (2018), 2.5 MB, pulls in inquirer                                       |
| omelette               | Completions        | Dynamic model re-invokes binary on every tab — latency with compiled Bun binary   |
| untildify              | Path expansion     | Trivially inlineable (2 lines)                                                    |
| env-paths              | XDG paths          | Appends `-nodejs` suffix; macOS path would regress UX                             |
| xdg-basedir            | XDG paths          | Does not provide macOS-native paths                                               |
| ci-info                | CI detection       | `!!process.env.CI` is sufficient for this use case                                |
| write-file-atomic      | Atomic writes      | Current `writeJson` is correct; SIGTERM risk is negligible for small config files |
| keytar                 | Credentials        | Archived by Atom in 2022, no security patches                                     |
| @github/keytar         | Credentials        | Requires node-gyp + C++ compiler at install time                                  |

## Consequences

- More manual code for things like color formatting and JSON I/O, but each is <20 lines
- Zero transitive supply chain risk beyond citty and @clack/prompts
- New dependencies require explicit justification against these criteria
- `@napi-rs/keyring` is the only planned addition (see [006](006-cross-platform-keyring.md))
