import type { Provider } from '@lib/types';

import { isClaudeRunning } from '@lib/process';
import {
  validateProfileName,
  profileExists,
  addOAuthProfile,
} from '@lib/profiles';
import * as ui from '@lib/ui';

export async function add(
  name: string | undefined,
  provider: Provider,
): Promise<void> {
  if (!name) {
    ui.error('Usage: acsw add <name>');
    process.exit(1);
  }

  const nameError = validateProfileName(name);
  if (nameError) {
    ui.error(nameError);
    process.exit(1);
  }

  if (await profileExists(name)) {
    ui.error(`Profile "${name}" already exists.`);
    ui.hint(`Use 'acsw remove ${name}' to remove it first.`);
    process.exit(1);
  }

  ui.blank();

  const running = await isClaudeRunning();
  if (running === null) {
    ui.warn('Could not determine if Claude Code is running.');
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) process.exit(0);
  } else if (running) {
    ui.warn('Claude Code appears to be running.');
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) process.exit(0);
  }

  const snapshot = await provider.snapshot();
  if (!snapshot) {
    ui.error('No OAuth credentials found.');
    ui.hint("Log in with 'claude' first, then run this command again.");
    process.exit(1);
  }

  const info = provider.displayInfo(snapshot);
  if (info.label) {
    ui.info(`Found active session: ${info.label}`);
    if (info.context) {
      ui.hint(`  ${info.context}`);
    }
  }

  await addOAuthProfile(name, provider);

  ui.blank();
  ui.success(`Profile ${ui.bold(name)} saved`);
  ui.blank();
}
