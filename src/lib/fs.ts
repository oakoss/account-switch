import { renameSync, unlinkSync } from 'node:fs';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function isENOENT(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readJsonOptional<T>(path: string): Promise<T | null> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (isENOENT(error)) return null;
    throw error;
  }
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${msg}`);
  }
}

export async function readJsonWithFallback<T>(
  path: string,
  fallback: T,
): Promise<T> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (isENOENT(error)) return fallback;
    throw error;
  }
  try {
    return JSON.parse(content) as T;
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
    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    if (mode) await chmod(tmpPath, mode);
    renameSync(tmpPath, path);
  } catch (error) {
    try {
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
