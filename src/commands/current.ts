import { createProviderConfig } from '@lib/constants';
import { getActiveProfile, readState } from '@lib/profiles';
import { createResolver } from '@lib/providers/registry';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

export default defineCommand({
  meta: { name: 'current', description: 'Show active profile' },
  async run() {
    const resolve = createResolver(createProviderConfig());
    const active = await getActiveProfile(resolve);

    ui.blank();

    if (!active) {
      const state = await readState();
      if (state.active) {
        ui.warn(`Active profile "${state.active}" not found on disk.`);
        ui.hint("Run 'acsw repair' to check state.");
      } else {
        ui.info('No active profile');
        ui.hint("Run 'acsw add <name>' to create one.");
      }
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
