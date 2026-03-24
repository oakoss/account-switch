import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readJsonOptional<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as T;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${msg}`);
  }
}

export async function readJsonWithFallback<T>(
  path: string,
  fallback: T,
): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) return fallback;
  try {
    return (await file.json()) as T;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${msg}`);
  }
}

export async function writeJson(
  path: string,
  data: unknown,
  mode?: number,
): Promise<void> {
  const tmpPath = `${path}.tmp`;
  try {
    await Bun.write(tmpPath, JSON.stringify(data, null, 2));
    if (mode) await chmod(tmpPath, mode);
    const { renameSync } = await import('node:fs');
    renameSync(tmpPath, path);
  } catch (error) {
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(tmpPath);
    } catch {
      /* cleanup best-effort */
    }
    throw error;
  }
}

export async function writeJsonSecure(
  path: string,
  data: unknown,
): Promise<void> {
  await ensureDir(dirname(path));
  await writeJson(path, data, 0o600);
}
