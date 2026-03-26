# Coding Standards

Patterns and conventions used across the `acsw` codebase. See also [CLAUDE.md](../CLAUDE.md) for project overview and commands.

## Module boundaries

### Lib vs commands

`src/lib/` modules are pure logic with no side effects:

- No `process.exit()` calls (exception: `ui/clack.ts` exits with 130 on user cancel, as a UI adapter boundary)
- No direct UI output (`ui.warn`, `ui.success`, etc.)
- Return values or throw errors; let callers decide presentation
- Accept injected config for testability

`src/commands/` modules handle UI and user interaction:

- Call lib functions and format results for display
- Own `process.exit()` and `process.exitCode` decisions
- Use `@clack/prompts` via the `@lib/ui` facade

### Shared command helpers

Reusable UI-layer logic lives in `src/commands/` (not `src/lib/`):

- `switch-handler.ts` — maps `SwitchResult` from `@lib/switch` to interactive UI (blocked-state prompts, display); accepts `onDecline` callback for callers needing `return` instead of `process.exit(0)`

### Non-interactive vs interactive paths

The `env --apply` hook runs on every `cd` and must never block:

- Uses `process.exitCode = 1` instead of `process.exit(1)`
- Catches all errors, surfaces via `ui.error`; never raw stack traces
- Skips rather than prompts (Claude running, detection failure, CI)

Interactive commands (`add`, `use`, picker) can prompt and exit.

## Config injection for testability

Every lib function that touches the filesystem accepts an optional config parameter with production defaults:

```typescript
export async function switchProfile(
  name: string,
  resolve: ProviderResolver,
  config: ProfilesConfig = DEFAULT_CONFIG,  // injected in tests
): Promise<ProfileInfo> {
```

Config types used:

- `ProfilesConfig` — `{ profilesDir, stateFile }` for profile operations
- `ProviderConfig` — `{ platform, homedir, env }` for provider/credential backends
- `RepairConfig` — same as `ProfilesConfig`, for repair operations

Tests create temp directories and pass custom configs:

```typescript
beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'acsw-test-'));
  config = { profilesDir: tempDir, stateFile: join(tempDir, 'state.json') };
});
```

## Import conventions

- `node:` protocol for Node builtins: `import { join } from 'node:path'`
- `@lib/` alias for cross-directory imports into lib: `import { switchProfile } from '@lib/switch'`
- `@commands/` alias for imports from outside the commands directory (e.g., dynamic subcommand loading in `index.ts`): `await import('@commands/switch-handler')`
- `./` relative imports for same-directory siblings: `import { isENOENT } from './fs'`
- Top-level static imports by default; dynamic imports only for intentional lazy loading (subcommands in `index.ts`)

## Error handling

### Tiers

1. **Lib modules** — throw on unexpected errors, return `null` for "not found"
2. **Commands** — catch lib errors, format with `ui.error()`, set exit code
3. **Shell hook** (`env --apply`) — catch everything, warn instead of crash, `process.exitCode = 1`

### ENOENT pattern

Use `isENOENT(error)` from `@lib/fs` in catch blocks:

```typescript
try {
  await unlink(path);
} catch (error: unknown) {
  if (isENOENT(error)) return;
  throw error;
}
```

### Error messages

Include the file path and actionable guidance:

```typescript
throw new Error(
  `${configPath} is corrupted and cannot be updated: ${msg}. Back up the file and run 'claude' to reinitialize it.`,
);
```

## File I/O

### Atomic writes

All JSON writes use temp-file-then-rename via `writeJson()` from `@lib/fs`:

```typescript
await writeJson(path, data); // standard
await writeJson(path, data, 0o600); // with permissions
await writeJsonSecure(path, data); // 0o600 + ensureDir
```

### Read patterns

- `readJsonOptional(path)` — returns `null` for missing files, throws on corruption
- `readJsonWithFallback(path, fallback)` — returns fallback for missing files, throws on corruption

Both throw with descriptive messages on parse failure. Never silently return bad data.

## Type conventions

### Central types

All shared types live in `src/lib/types.ts`: `Provider`, `ProviderSnapshot`, `ProviderConfig`, `ProfileMeta`, `ProfileInfo`, `ProfilesConfig`, etc.

### Co-located types

Types private to a single module stay in that module:

- `CredentialStore` in `src/lib/credentials/types.ts`
- `AcswrcConfig` in `src/lib/env.ts`
- `ClaudeSnapshot` in `src/lib/providers/claude.ts`
- `ClaudeJson` in `src/lib/config.ts`

### Opaque snapshots

`ProviderSnapshot = { credentials: unknown; identity: unknown }` — providers cast internally, callers treat as opaque. This avoids TypeScript variance issues with generics on `restore()`.

## Testing patterns

### Test structure

```typescript
describe('moduleName', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-prefix-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('does the thing', async () => {
    // arrange, act, assert
  });
});
```

### Mock providers

Use factories from `tests/helpers/mock-providers.ts`:

- `createMockProvider(snapshot)` — tracks `restoreCalls`, `clearCalled`, `current`
- `createFailingProvider(snapshot, failOnRestore, failOnRollback)` — for testing rollback paths
- `mockResolver(provider)` — wraps a provider as a `ProviderResolver`

### Testing Claude provider without Keychain

Set `platform: 'linux'` in `ProviderConfig` to force the file-based credential backend:

```typescript
const config: ProviderConfig = {
  platform: 'linux',
  homedir: tempDir,
  env: {},
};
```

### Assertions

- File contents: `JSON.parse(await readFile(path, 'utf8'))` then `expect(...)` (tests can use `Bun.file(path).json()`)
- File existence: `await fileExists(path)` from `@lib/fs` (tests can use `Bun.file(path).exists()`)
- File permissions: `(await stat(path)).mode & 0o777`
- Thrown errors: `await expect(fn()).rejects.toThrow('substring')`

## Subprocess pattern

Use `exec()` from `@lib/spawn` which wraps `child_process.spawn` and collects stdout/stderr before resolving to avoid pipe deadlock:

```typescript
import { exec } from '@lib/spawn';

const { stdout, stderr, exitCode } = await exec(['cmd', 'arg1', 'arg2']);
```

## Linting and formatting

- **oxfmt** handles all formatting. Run `pnpm format` after writing code rather than trying to match the style manually.
- **oxlint** enforces `unicorn/prefer-module` (no `require()`), `unicorn/no-useless-undefined` (use `void 0` if testing undefined explicitly), and `no-require-imports`.
- **TypeScript** catches unused imports after refactoring. Clean up imports when moving or deleting code.
- **markdownlint** enforces doc formatting. Run `pnpm lint:md` after editing markdown.

## Profile name validation

`PROFILE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/` — enforced in `profilePaths()` to prevent path traversal. All profile operations go through `profilePaths()` from `src/lib/paths.ts`.
