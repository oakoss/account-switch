import { createProviderConfig } from '@lib/constants';
import { readState, listProfiles } from '@lib/profiles';
import { createResolver } from '@lib/providers/registry';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

export default defineCommand({
  meta: { name: 'current', description: 'Show active profile' },
  async run() {
    const state = await readState();

    ui.blank();

    if (!state.active) {
      ui.info('No active profile');
      ui.hint("Run 'acsw add <name>' to create one.");
      ui.blank();
      return;
    }

    const resolve = createResolver(createProviderConfig());
    const profiles = await listProfiles(resolve);
    const active = profiles.find((p) => p.isActive);

    if (!active) {
      ui.warn(`Active profile "${state.active}" not found on disk.`);
      ui.blank();
      return;
    }

    ui.log(
      `${ui.green(ui.bold(active.name))}  ${ui.formatSubscription(active.subscriptionType)}`,
    );
    if (active.email) {
      ui.hint(`  ${active.email}`);
    }
    if (active.organizationName) {
      ui.hint(`  ${active.organizationName}`);
    }

    ui.blank();
  },
});
