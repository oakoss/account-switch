import { createProviderConfig } from '@lib/constants';
import { listProfiles } from '@lib/profiles';
import { createResolver } from '@lib/providers/registry';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

export default defineCommand({
  meta: { name: 'list', description: 'List all profiles' },
  async run() {
    const resolve = createResolver(createProviderConfig());
    const profiles = await listProfiles(resolve);

    ui.blank();

    if (profiles.length === 0) {
      ui.info('No profiles yet');
      ui.hint("Run 'acsw add <name>' to save your current session.");
      ui.blank();
      return;
    }

    ui.log(ui.bold('Profiles'));
    ui.blank();

    for (const p of profiles) {
      const icon = p.isActive ? ui.green('▸') : ' ';
      const name = p.isActive ? ui.green(ui.bold(p.name)) : p.name;
      const sub = ui.formatSubscription(p.subscriptionType);
      const email = p.email ? ui.dim(p.email) : '';
      const org = p.organizationName ? ui.dim(p.organizationName) : '';

      ui.log(`${icon} ${name}  ${sub}  ${email}`);
      if (org) {
        ui.log(`    ${org}`);
      }
    }

    ui.blank();
  },
});
