# 005: One profile per provider

**Status:** Accepted
**Date:** 2026-03-25

## Context

When planning multi-provider support, two models were considered:

1. **Multi-provider profiles:** one profile contains multiple provider accounts (claude + gh + aws)
2. **Single-provider profiles + groups:** one profile = one provider; groups compose them for switching

## Decision

Keep **1 profile = 1 provider**. Use grouped switching for multi-tool contexts.

Planned syntax (not yet implemented):

```bash
acsw group create work --profiles claude:work,aws:work-prod,gh:work
acsw group use work   # switches all three
```

## Alternatives considered

| Option                  | Why not                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-provider profiles | Forces upfront provider decisions; atomic rollback across N providers is complex (if Claude switches but gh fails, what rolls back?); adding a provider later requires updating all profiles |

## Consequences

- Simple rollback: each profile switch is a single provider operation
- Adding a new provider doesn't touch existing profiles
- Groups are a thin composition layer on top of existing profiles
- Users who only use Claude never encounter multi-provider complexity
- Trade-off: switching a "work context" requires a group rather than a single profile switch
