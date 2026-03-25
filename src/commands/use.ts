import { createProviderConfig } from '@lib/constants';
import { profileExists, switchProfile, readState } from '@lib/profiles';
import { createResolver } from '@lib/providers/registry';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

import { guardClaudeRunning } from './guard-claude';

export default defineCommand({
  meta: { name: 'use', description: 'Switch to a profile' },
  args: {
    name: { type: 'positional', description: 'Profile name', required: true },
  },
  async run({ args }) {
    if (!(await profileExists(args.name))) {
      ui.error(`Profile "${args.name}" not found.`);
      ui.hint("Run 'acsw list' to see your profiles.");
      process.exit(1);
    }

    const state = await readState();
    if (state.active === args.name) {
      ui.blank();
      ui.success(`Already on ${ui.bold(args.name)}`);
      ui.blank();
      return;
    }

    ui.blank();
    await guardClaudeRunning();

    const resolve = createResolver(createProviderConfig());

    const profile = await switchProfile(args.name, resolve);

    ui.success(
      `Switched to ${ui.bold(args.name)}  ${ui.formatSubscription(profile.subscriptionType)}`,
    );
    if (profile.email) {
      ui.hint(`  ${profile.email}`);
    }
    if (profile.organizationName) {
      ui.hint(`  ${profile.organizationName}`);
    }
    ui.blank();
  },
});
