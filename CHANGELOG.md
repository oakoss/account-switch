# Changelog

## 0.2.0

### Minor Changes

- [`6fb1a12`](https://github.com/oakoss/account-switch/commit/6fb1a12a4decee81888ee024289a7c1809153ff9) Thanks [@jbabin91](https://github.com/jbabin91)! - Add Provider abstraction and `--provider` flag for multi-provider support

  - Provider interface with snapshot/restore semantics for credential storage
  - `--provider` flag on `acsw add` (defaults to claude)
  - Profiles dispatch to the correct provider via stored metadata
  - Repair logic extracted to library with path injection for testability
  - ProfilesConfig injection eliminates mock.module from tests
  - 52 tests covering all exported functions (up from 9)
