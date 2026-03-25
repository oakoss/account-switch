import { createProviderConfig } from '@lib/constants';
import { isENOENT } from '@lib/fs';
import { readState, switchProfile } from '@lib/profiles';
import { createResolver } from '@lib/providers/registry';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';
import { join, dirname } from 'node:path';

async function findAcswrc(startDir: string): Promise<string | null> {
  let dir = startDir;

  while (true) {
    const rcPath = join(dir, '.acswrc');
    if (await Bun.file(rcPath).exists()) return rcPath;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

type AcswrcConfig = { profile?: string };

async function readAcswrc(path: string): Promise<AcswrcConfig | null> {
  let raw: unknown;
  try {
    raw = await Bun.file(path).json();
  } catch (error) {
    // Race: file may be deleted between findAcswrc's exists() check and this read
    if (isENOENT(error)) {
      return null;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse .acswrc at ${path}: ${msg}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `.acswrc at ${path} must be a JSON object (e.g., { "profile": "work" })`,
    );
  }

  const obj = raw as Record<string, unknown>;
  if (obj.profile !== undefined && typeof obj.profile !== 'string') {
    throw new Error(
      `.acswrc at ${path}: "profile" must be a string (e.g., { "profile": "work" })`,
    );
  }

  return obj as AcswrcConfig;
}

const APPLY_TIMEOUT_MS = 5000;

async function applyAcswrcInner(): Promise<void> {
  if (process.env.CI) {
    ui.info('acsw: skipping auto-switch in CI environment');
    return;
  }

  const rcPath = await findAcswrc(process.cwd());
  if (!rcPath) return;

  const rc = await readAcswrc(rcPath);
  if (!rc) return;

  if (!rc.profile) {
    ui.warn(`acsw: .acswrc at ${rcPath} is missing a "profile" key`);
    return;
  }

  const targetProfile = rc.profile.trim();
  if (!targetProfile) {
    ui.warn(`acsw: .acswrc at ${rcPath} has an empty "profile" value`);
    return;
  }

  const state = await readState();
  if (state.active === targetProfile) return;

  const { checkClaudeStatus } = await import('@lib/process');
  const status = await checkClaudeStatus();
  if (status === 'unknown') {
    ui.warn(
      'acsw: could not determine if Claude Code is running, skipping auto-switch',
    );
    return;
  }
  if (status === 'running') {
    ui.warn('acsw: Claude Code is running, skipping auto-switch');
    return;
  }

  const config = createProviderConfig();
  const resolve = createResolver(config);
  const result = await switchProfile(targetProfile, resolve);

  ui.info(
    `acsw: switched to ${ui.bold(targetProfile)}  ${ui.formatSubscription(result.subscriptionType)}`,
  );
}

async function applyAcswrc(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const inner = applyAcswrcInner().then(() => 'ok' as const);
    inner.catch(() => {});

    const result = await Promise.race([
      inner,
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), APPLY_TIMEOUT_MS);
      }),
    ]);
    if (result === 'timeout') {
      ui.warn(`acsw: auto-switch timed out after ${APPLY_TIMEOUT_MS / 1000}s`);
      ui.hint(
        "Run 'acsw use <profile>' manually, or 'acsw repair' to check state.",
      );
      process.exitCode = 1;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ui.error(`acsw: ${msg}`);
    ui.hint("Run 'acsw repair' if this persists.");
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

function detectShell(): string {
  const shell = process.env.SHELL ?? '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  throw new Error(
    `Could not detect a supported shell from $SHELL="${shell}". Use --shell zsh|bash|fish.`,
  );
}

function generateHook(shell: string): string {
  if (shell === 'zsh') {
    return `
autoload -U add-zsh-hook
_acsw_autoload_hook() {
  acsw env --apply
}
add-zsh-hook -D chpwd _acsw_autoload_hook
add-zsh-hook chpwd _acsw_autoload_hook

_acsw_autoload_hook
`.trimStart();
  }

  if (shell === 'bash') {
    return `
__acsw_cd() {
  \\cd "$@" || return $?
  acsw env --apply
}
alias cd=__acsw_cd

acsw env --apply
`.trimStart();
  }

  if (shell === 'fish') {
    return `
function _acsw_autoload_hook --on-variable PWD --description 'Switch acsw profile on directory change'
  status --is-command-substitution; and return
  acsw env --apply
end

_acsw_autoload_hook
`.trimStart();
  }

  throw new Error(`Unsupported shell: ${shell}. Use zsh, bash, or fish.`);
}

export default defineCommand({
  meta: { name: 'env', description: 'Shell integration for auto-switching' },
  args: {
    'use-on-cd': {
      type: 'boolean',
      description: 'Output shell hook for auto-switch on cd',
    },
    shell: { type: 'string', description: 'Shell type (zsh, bash, fish)' },
    apply: {
      type: 'boolean',
      description: 'Apply .acswrc for current directory (used by shell hook)',
    },
  },
  async run({ args }) {
    if (args.apply) {
      await applyAcswrc();
      return;
    }

    const SUPPORTED_SHELLS = new Set(['zsh', 'bash', 'fish']);
    if (args.shell && !SUPPORTED_SHELLS.has(args.shell)) {
      ui.error(`Unsupported shell: "${args.shell}". Use zsh, bash, or fish.`);
      process.exitCode = 1;
      return;
    }

    if (args['use-on-cd']) {
      const shell = args.shell ?? detectShell();
      console.log(generateHook(shell));
      return;
    }

    const shell = args.shell ?? detectShell();
    ui.blank();
    ui.info('Add this to your shell config:');
    ui.blank();
    if (shell === 'zsh') {
      ui.log(`  # ~/.zshrc`);
      ui.log(`  eval "$(acsw env --use-on-cd)"`);
    } else if (shell === 'bash') {
      ui.log(`  # ~/.bashrc`);
      ui.log(`  eval "$(acsw env --use-on-cd)"`);
    } else if (shell === 'fish') {
      ui.log(`  # ~/.config/fish/conf.d/acsw.fish`);
      ui.log(`  acsw env --use-on-cd | source`);
    }
    ui.blank();
    ui.hint('Then create a .acswrc in your project directory:');
    ui.log(`  { "profile": "work" }`);
    ui.blank();
  },
});
