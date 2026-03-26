import { exec } from '@lib/spawn';

export type ClaudeStatus = 'running' | 'not-running' | 'unknown';

export async function isClaudeRunning(): Promise<boolean | null> {
  try {
    const { stdout, exitCode } = await exec(['pgrep', '-xi', 'claude']);
    if (exitCode === 1) return false;
    return stdout.length > 0;
  } catch {
    // pgrep may not be installed (ENOENT) or may lack permissions (EACCES).
    // Return null so callers treat it as unknown status.
    return null;
  }
}

export async function checkClaudeStatus(): Promise<ClaudeStatus> {
  const running = await isClaudeRunning();
  if (running === null) return 'unknown';
  return running ? 'running' : 'not-running';
}
