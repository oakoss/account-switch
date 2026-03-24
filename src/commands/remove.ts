import type { Provider } from '../lib/types';

import { profileExists, removeProfile, readState } from '../lib/profiles';
import * as ui from '../lib/ui';

export async function remove(
  name: string | undefined,
  provider: Provider,
): Promise<void> {
  if (!name) {
    ui.error('Usage: acsw remove <name>');
    process.exit(1);
  }

  if (!(await profileExists(name))) {
    ui.error(`Profile "${name}" does not exist.`);
    process.exit(1);
  }

  const state = await readState();
  const isActive = state.active === name;

  ui.blank();
  if (isActive) {
    ui.warn('This will log you out of Claude Code.');
  }
  const label = isActive ? ` ${ui.yellow('(currently active)')}` : '';
  const ok = await ui.confirm(`Delete profile "${name}"?${label}`);

  if (!ok) {
    ui.hint('Cancelled.');
    ui.blank();
    return;
  }

  await removeProfile(name, provider);

  ui.blank();
  ui.success(`Profile ${ui.bold(name)} removed`);
  ui.blank();
}
