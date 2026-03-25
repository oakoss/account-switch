import type { ProfileInfo } from '@lib/types';

import * as ui from '@lib/ui';

export function displaySwitchResult(name: string, profile: ProfileInfo): void {
  ui.success(
    `Switched to ${ui.bold(name)}  ${ui.formatSubscription(profile.subscriptionType)}`,
  );
  if (profile.email) {
    ui.hint(`  ${profile.email}`);
  }
  if (profile.organizationName) {
    ui.hint(`  ${profile.organizationName}`);
  }
}
