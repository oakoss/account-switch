import { createProviderConfig } from '@lib/constants';
import { checkClaudeStatus } from '@lib/process';
import {
  validateProfileName,
  profileExists,
  addOAuthProfile,
} from '@lib/profiles';
import { createProvider, createDefaultProvider } from '@lib/providers/registry';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

export default defineCommand({
  meta: { name: 'add', description: 'Save current session as a profile' },
  args: {
    name: { type: 'positional', description: 'Profile name', required: true },
    provider: {
      type: 'string',
      description: 'Provider to use',
      default: 'claude',
    },
  },
  async run({ args }) {
    const nameError = validateProfileName(args.name);
    if (nameError) {
      ui.error(nameError);
      process.exit(1);
    }

    if (await profileExists(args.name)) {
      ui.error(`Profile "${args.name}" already exists.`);
      ui.hint(`Use 'acsw remove ${args.name}' to remove it first.`);
      process.exit(1);
    }

    ui.blank();
    const status = await checkClaudeStatus();
    if (status === 'running' || status === 'unknown') {
      if (status === 'running') {
        ui.warn('Claude Code appears to be running.');
        ui.warn('Adding a profile while Claude is active may cause issues.');
      } else {
        ui.warn('Could not determine if Claude Code is running.');
      }
      const ok = await ui.confirm('Continue anyway?');
      if (!ok) process.exit(0);
    }

    const config = createProviderConfig();
    const provider =
      args.provider !== 'claude'
        ? createProvider(args.provider, config)
        : createDefaultProvider(config);

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

    await addOAuthProfile(args.name, provider, undefined, snapshot);

    ui.blank();
    ui.success(`Profile ${ui.bold(args.name)} saved`);
    ui.blank();
  },
});
