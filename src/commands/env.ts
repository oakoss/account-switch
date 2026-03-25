import { createProviderConfig } from '@lib/constants';
import { applyAcswrc, detectShell, generateHook } from '@lib/env';
import { createResolver } from '@lib/providers/registry';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

const APPLY_TIMEOUT_MS = 5000;

async function runApply(): Promise<void> {
  const config = createProviderConfig();
  const resolve = createResolver(config);
  const result = await applyAcswrc(process.cwd(), resolve);

  if (result.status === 'ci-skip') {
    ui.info('acsw: skipping auto-switch in CI environment');
    return;
  }
  if (result.status === 'no-rc' || result.status === 'already-active') return;
  if (result.status === 'invalid-rc') {
    ui.warn(`acsw: .acswrc at ${result.path} has ${result.message}`);
    return;
  }
  if (result.status === 'not-found') {
    ui.warn(
      `acsw: profile "${result.profile}" not found, skipping auto-switch`,
    );
    return;
  }
  if (result.status === 'claude-running') {
    ui.warn('acsw: Claude Code is running, skipping auto-switch');
    return;
  }
  if (result.status === 'claude-unknown') {
    ui.warn(
      'acsw: could not determine if Claude Code is running, skipping auto-switch',
    );
    return;
  }
  ui.info(
    `acsw: switched to ${ui.bold(result.profile)}  ${ui.formatSubscription(result.info.subscriptionType)}`,
  );
}

async function applyWithTimeout(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const inner = runApply().then(() => 'ok' as const);
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
      await applyWithTimeout();
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
