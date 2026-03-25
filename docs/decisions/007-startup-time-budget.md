# 007: Startup time budget

**Status:** Accepted
**Date:** 2026-03-24

## Context

The shell hook (`acsw env --apply`) runs on every `cd`. If it's slow, it blocks the user's shell prompt. fnm (Rust) targets <5ms; our compiled Bun binary has higher baseline overhead.

## Decision

Set a **50ms budget** for hot-path shell hook execution, with a **5-second hard timeout** as a safety net.

**Benchmarks** (macOS arm64, compiled via `bun build --compile`):

| Scenario | Time | Memory |
|----------|------|--------|
| No `.acswrc` (fast path) | ~20ms | ~29 MB |
| `.acswrc` present, switch attempt | ~40ms | ~32 MB |
| Cold start (first run after build) | ~680ms | ~29 MB |
| Binary size | 58 MB | — |

**Mitigations:**
- 5-second timeout on `applyAcswrc()` — if anything hangs (keychain prompt, slow disk, stalled `pgrep`), the hook bails with a warning instead of blocking the shell
- CI early-exit — `if (process.env.CI) return;` skips the hook entirely in CI
- `checkClaudeStatus()` returning `'unknown'` (detection failed) skips auto-switch instead of proceeding

## Alternatives considered

None — the budget is a constraint, not a design choice. The only alternative is a faster runtime (Rust), which is tracked as a future investigation.

## Consequences

- Both hot paths are under 50ms — acceptable
- 680ms cold start happens once after install or system restart — acceptable
- 58 MB binary size is Bun runtime overhead, not reducible without switching runtimes
- The budget constrains what the hook can do — any new work in the hook path must stay within 50ms
