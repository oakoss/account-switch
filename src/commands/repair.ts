import { repairProfiles } from '@lib/repair';
import * as ui from '@lib/ui';

export async function repair(): Promise<void> {
  ui.blank();
  ui.info('Checking profiles...');
  ui.blank();

  const { results, checked } = await repairProfiles();

  if (results.length === 0) {
    if (checked === 0) {
      ui.warn('No profiles found. Nothing to repair.');
    } else {
      ui.success(`All profiles healthy (${checked} checked)`);
    }
  } else {
    const fixed = results.filter((r) => r.fixed).length;
    const unfixed = results.filter((r) => !r.fixed).length;

    for (const r of results) {
      const icon = r.fixed ? ui.green('fixed') : ui.yellow('issue');
      console.log(`  [${icon}] ${ui.bold(r.profile)}: ${r.issue}`);
    }

    ui.blank();
    if (fixed > 0) ui.success(`Fixed ${fixed} issue(s)`);
    if (unfixed > 0) ui.warn(`${unfixed} issue(s) need manual attention`);
  }

  ui.blank();
}
