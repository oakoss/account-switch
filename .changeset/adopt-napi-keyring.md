---
"@oakoss/account-switch": minor
---

Replace macOS Keychain shell-out with `@napi-rs/keyring` for cross-platform credential storage. macOS uses Keychain, Windows uses Credential Vault. Linux remains file-based.
