---
"@oakoss/account-switch": patch
---

Extract process detection into platform-specific backends. Adds Windows support via `tasklist` alongside existing `pgrep` for macOS/Linux.
