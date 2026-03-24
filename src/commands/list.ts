import type { ProviderResolver } from '../lib/types';

import { listProfiles } from '../lib/profiles';
import * as ui from '../lib/ui';

export async function list(resolve: ProviderResolver): Promise<void> {
  const profiles = await listProfiles(resolve);

  ui.blank();

  if (profiles.length === 0) {
    ui.info('No profiles yet');
    ui.hint("Run 'acsw add <name>' to save your current session.");
    ui.blank();
    return;
  }

  console.log(`  ${ui.bold('Profiles')}`);
  ui.blank();

  for (const p of profiles) {
    const icon = p.isActive ? ui.green('▸') : ' ';
    const name = p.isActive ? ui.green(ui.bold(p.name)) : p.name;
    const sub = ui.formatSubscription(p.subscriptionType);
    const email = p.email ? ui.dim(p.email) : '';
    const org = p.organizationName ? ui.dim(p.organizationName) : '';

    console.log(`  ${icon} ${name}  ${sub}  ${email}`);
    if (org) {
      console.log(`      ${org}`);
    }
  }

  ui.blank();
}
