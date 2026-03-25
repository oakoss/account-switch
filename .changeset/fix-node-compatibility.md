---
"@oakoss/account-switch": patch
---

Fix "Bun is not defined" crash when installed via npm/pnpm. Replace Bun-specific APIs with Node.js equivalents so the `--target node` build works in both runtimes.
