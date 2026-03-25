import { checkClaudeStatus } from '@lib/process';
import * as ui from '@lib/ui';

export async function guardClaudeRunning(
  onDecline: () => void = () => process.exit(0),
): Promise<void> {
  const status = await checkClaudeStatus();
  if (status === 'unknown') {
    ui.warn('Could not determine if Claude Code is running.');
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) onDecline();
  } else if (status === 'running') {
    ui.warn('Claude Code appears to be running.');
    ui.warn('Switching profiles while Claude is active may cause errors.');
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) onDecline();
  }
}
