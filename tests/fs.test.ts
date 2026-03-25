import { isENOENT, readJsonOptional, readJsonWithFallback } from '@lib/fs';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('isENOENT', () => {
  it('returns true for ENOENT-like error object', () => {
    expect(isENOENT({ code: 'ENOENT' })).toBe(true);
  });

  it('returns false for other error codes', () => {
    expect(isENOENT({ code: 'EACCES' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isENOENT(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isENOENT(void 0)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isENOENT('ENOENT')).toBe(false);
  });

  it('returns false for number', () => {
    expect(isENOENT(2)).toBe(false);
  });

  it('returns true for real Node.js ENOENT error', async () => {
    const { readFile } = await import('node:fs/promises');
    try {
      await readFile('/nonexistent/path/that/does/not/exist');
    } catch (error) {
      expect(isENOENT(error)).toBe(true);
      return;
    }
    throw new Error('Expected readFile to throw');
  });
});

describe('readJsonOptional', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-fs-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('returns parsed JSON for valid file', async () => {
    const path = join(tempDir, 'data.json');
    await Bun.write(path, JSON.stringify({ key: 'value' }));

    const result = await readJsonOptional(path);
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null for nonexistent file', async () => {
    const result = await readJsonOptional(join(tempDir, 'missing.json'));
    expect(result).toBeNull();
  });

  it('throws on corrupted JSON', async () => {
    const path = join(tempDir, 'bad.json');
    await Bun.write(path, '{{not json');

    await expect(readJsonOptional(path)).rejects.toThrow('Failed to parse');
  });
});

describe('readJsonWithFallback', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-fs-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('returns parsed JSON for valid file', async () => {
    const path = join(tempDir, 'data.json');
    await Bun.write(path, JSON.stringify({ key: 'value' }));

    const result = await readJsonWithFallback(path, { key: 'default' });
    expect(result).toEqual({ key: 'value' });
  });

  it('returns fallback for nonexistent file', async () => {
    const result = await readJsonWithFallback(join(tempDir, 'missing.json'), {
      key: 'default',
    });
    expect(result).toEqual({ key: 'default' });
  });

  it('throws on corrupted JSON', async () => {
    const path = join(tempDir, 'bad.json');
    await Bun.write(path, '{{not json');

    await expect(
      readJsonWithFallback(path, { key: 'default' }),
    ).rejects.toThrow('Failed to parse');
  });
});
