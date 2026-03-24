import type { Provider } from '../lib/types';

import { isClaudeRunning } from '../lib/process';
import { profileExists, switchProfile, readState } from '../lib/profiles';
import * as ui from '../lib/ui';

export async function use(
  name: string | undefined,
  provider: Provider,
): Promise<void> {
  if (!name) {
    ui.error('Usage: acsw use <name>');
    process.exit(1);
  }

  if (!(await profileExists(name))) {
    ui.error(`Profile "${name}" not found.`);
    ui.hint("Run 'acsw list' to see your profiles.");
    process.exit(1);
  }

  const state = await readState();
  if (state.active === name) {
    ui.blank();
    ui.success(`Already on ${ui.bold(name)}`);
    ui.blank();
    return;
  }

  const running = await isClaudeRunning();
  if (running === null) {
    ui.blank();
    ui.warn('Could not determine if Claude Code is running.');
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) process.exit(0);
  } else if (running) {
    ui.blank();
    ui.warn('Claude Code appears to be running.');
    ui.warn('Switching profiles while Claude is active may cause errors.');
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) process.exit(0);
  }

  ui.blank();
  const profile = await switchProfile(name, provider);

  ui.success(
    `Switched to ${ui.bold(name)}  ${ui.formatSubscription(profile.subscriptionType)}`,
  );
  if (profile.email) {
    ui.hint(`  ${profile.email}`);
  }
  if (profile.organizationName) {
    ui.hint(`  ${profile.organizationName}`);
  }
  ui.blank();
}
