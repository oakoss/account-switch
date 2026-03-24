import * as ui from '@lib/ui';

export async function isClaudeRunning(): Promise<boolean | null> {
  try {
    const proc = Bun.spawn(['pgrep', '-xi', 'claude'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 1) return false;
    return text.trim().length > 0;
  } catch {
    return null;
  }
}

export async function guardClaudeRunning(): Promise<void> {
  const running = await isClaudeRunning();
  if (running === null) {
    ui.warn('Could not determine if Claude Code is running.');
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) process.exit(0);
  } else if (running) {
    ui.warn('Claude Code appears to be running.');
    ui.warn('Switching profiles while Claude is active may cause errors.');
    const ok = await ui.confirm('Continue anyway?');
    if (!ok) process.exit(0);
  }
}
