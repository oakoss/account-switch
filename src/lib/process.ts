import { exec } from './spawn';

export type ClaudeStatus = 'running' | 'not-running' | 'unknown';

export type ProcessDetector = {
  isRunning(name: string): Promise<boolean | null>;
};

export function createPgrepDetector(): ProcessDetector {
  return {
    async isRunning(name: string): Promise<boolean | null> {
      try {
        const { stdout, exitCode } = await exec(['pgrep', '-xi', name]);
        if (exitCode === 1) return false;
        return stdout.length > 0;
      } catch {
        // pgrep may not be installed (ENOENT) or may lack permissions (EACCES).
        return null;
      }
    },
  };
}

export function createTasklistDetector(): ProcessDetector {
  return {
    async isRunning(name: string): Promise<boolean | null> {
      try {
        const { stdout, exitCode } = await exec([
          'tasklist',
          '/FI',
          `IMAGENAME eq ${name}.exe`,
          '/NH',
        ]);
        if (exitCode !== 0) return null;
        return !stdout.includes('No tasks are running');
      } catch {
        // tasklist may not be available.
        return null;
      }
    },
  };
}

export function createProcessDetector(platform?: string): ProcessDetector {
  const p = platform ?? process.platform;
  if (p === 'win32') return createTasklistDetector();
  return createPgrepDetector();
}

export async function checkClaudeStatus(
  detector?: ProcessDetector,
): Promise<ClaudeStatus> {
  const d = detector ?? createProcessDetector();
  const running = await d.isRunning('claude');
  if (running === null) return 'unknown';
  return running ? 'running' : 'not-running';
}
