import type { ProviderResolver } from '../lib/types';

import { readState, listProfiles } from '../lib/profiles';
import * as ui from '../lib/ui';

export async function current(resolve: ProviderResolver): Promise<void> {
  const state = await readState();

  ui.blank();

  if (!state.active) {
    ui.info('No active profile');
    ui.hint("Run 'acsw add <name>' to create one.");
    ui.blank();
    return;
  }

  const profiles = await listProfiles(resolve);
  const active = profiles.find((p) => p.isActive);

  if (!active) {
    ui.warn(`Active profile "${state.active}" not found on disk.`);
    ui.blank();
    return;
  }

  console.log(
    `  ${ui.green(ui.bold(active.name))}  ${ui.formatSubscription(active.subscriptionType)}`,
  );
  if (active.email) {
    ui.hint(`  ${active.email}`);
  }
  if (active.organizationName) {
    ui.hint(`  ${active.organizationName}`);
  }

  ui.blank();
}
