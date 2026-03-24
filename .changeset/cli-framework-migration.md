---
"@oakoss/account-switch": minor
---

Migrate CLI to citty + @clack/prompts with swappable UI abstraction

- **citty** handles arg parsing, subcommands, typed args, and auto-generated help text
- **@clack/prompts** powers interactive select picker, confirm dialogs, and structured log output
- UI abstraction layer (`OutputAdapter`/`PromptAdapter`) enables swapping implementations by changing one import
- Per-command `--help` now available (e.g., `acsw add --help`)
- Interactive profile picker uses arrow-key select instead of numbered input
- Ctrl+C during prompts exits cleanly with code 130
