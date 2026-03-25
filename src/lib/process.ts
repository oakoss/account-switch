export type ClaudeStatus = 'running' | 'not-running' | 'unknown';

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

export async function checkClaudeStatus(): Promise<ClaudeStatus> {
  const running = await isClaudeRunning();
  if (running === null) return 'unknown';
  return running ? 'running' : 'not-running';
}
