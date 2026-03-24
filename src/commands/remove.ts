import { createProviderConfig } from '@lib/constants';
import { profileExists, removeProfile, readState } from '@lib/profiles';
import { createResolver } from '@lib/providers/registry';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

export default defineCommand({
  meta: { name: 'remove', description: 'Remove a profile' },
  args: {
    name: { type: 'positional', description: 'Profile name', required: true },
  },
  async run({ args }) {
    if (!(await profileExists(args.name))) {
      ui.error(`Profile "${args.name}" does not exist.`);
      process.exit(1);
    }

    const state = await readState();
    const isActive = state.active === args.name;

    ui.blank();
    if (isActive) {
      ui.warn('This will log you out of Claude Code.');
    }
    const label = isActive ? ` ${ui.yellow('(currently active)')}` : '';
    const ok = await ui.confirm(`Delete profile "${args.name}"?${label}`);

    if (!ok) {
      ui.hint('Cancelled.');
      ui.blank();
      return;
    }

    const resolve = createResolver(createProviderConfig());

    await removeProfile(args.name, resolve);

    ui.blank();
    ui.success(`Profile ${ui.bold(args.name)} removed`);
    ui.blank();
  },
});
