import { readOAuthAccount } from '../lib/config';
import { readCredentials } from '../lib/credentials';
import { isClaudeRunning } from '../lib/process';
import {
  validateProfileName,
  profileExists,
  addOAuthProfile,
} from '../lib/profiles';
import * as ui from '../lib/ui';

export async function add(name: string | undefined): Promise<void> {
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

  // Read current credentials to verify they exist
  const creds = await readCredentials();
  if (!creds) {
    ui.error('No OAuth credentials found.');
    ui.hint("Log in with 'claude' first, then run this command again.");
    process.exit(1);
  }

  const account = await readOAuthAccount();
  if (account?.emailAddress) {
    ui.info(`Found active session: ${account.emailAddress}`);
    if (account.organizationName) {
      ui.hint(`  ${account.organizationName}`);
    }
  }

  await addOAuthProfile(name);

  ui.blank();
  ui.success(`Profile ${ui.bold(name)} saved`);
  ui.blank();
}
