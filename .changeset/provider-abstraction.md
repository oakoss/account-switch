---
"@oakoss/account-switch": minor
---

Add Provider abstraction and `--provider` flag for multi-provider support

- Provider interface with snapshot/restore semantics for credential storage
- `--provider` flag on `acsw add` (defaults to claude)
- Profiles dispatch to the correct provider via stored metadata
- Repair logic extracted to library with path injection for testability
- ProfilesConfig injection eliminates mock.module from tests
- 52 tests covering all exported functions (up from 9)
