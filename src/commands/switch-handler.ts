import type { SwitchResult } from '@lib/switch';
import type { ProfileInfo, ProfilesConfig, ProviderResolver } from '@lib/types';

import { switchProfile } from '@lib/profiles';
import * as ui from '@lib/ui';

function displaySwitch(name: string, profile: ProfileInfo): void {
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

export async function handleSwitchResult(
  name: string,
  result: SwitchResult,
  resolve: ProviderResolver,
  onDecline?: () => void,
  config?: ProfilesConfig,
): Promise<void> {
  if (result.status === 'not-found') {
    ui.error(`Profile "${name}" not found.`);
    ui.hint("Run 'acsw list' to see your profiles.");
    process.exit(1);
  }

  if (result.status === 'already-active') {
    ui.success(`Already on ${ui.bold(name)}`);
    return;
  }

  if (result.status === 'blocked') {
    if (result.reason === 'claude-running') {
      ui.warn('Claude Code appears to be running.');
      ui.warn('Switching profiles while Claude is active may cause errors.');
    } else {
      ui.warn('Could not determine if Claude Code is running.');
    }
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) {
      (onDecline ?? (() => process.exit(0)))();
      return;
    }
    try {
      const profile = await switchProfile(name, resolve, config);
      displaySwitch(name, profile);
    } catch (error) {
      ui.error(error instanceof Error ? error.message : String(error));
      ui.hint("Run 'acsw repair' to check your profile state.");
      process.exit(1);
    }
    return;
  }

  displaySwitch(name, result.profile);
}
