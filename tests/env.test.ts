import { findAcswrc, readAcswrc, detectShell, generateHook } from '@lib/env';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// -- findAcswrc --

describe('findAcswrc', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-env-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('finds .acswrc in the start directory', async () => {
    await Bun.write(join(tempDir, '.acswrc'), '{"profile":"work"}');

    const result = await findAcswrc(tempDir);
    expect(result).toBe(join(tempDir, '.acswrc'));
  });

  it('finds .acswrc in a parent directory', async () => {
    await Bun.write(join(tempDir, '.acswrc'), '{"profile":"work"}');
    const child = join(tempDir, 'sub', 'deep');
    await mkdir(child, { recursive: true });

    const result = await findAcswrc(child);
    expect(result).toBe(join(tempDir, '.acswrc'));
  });

  it('returns nearest ancestor .acswrc', async () => {
    await Bun.write(join(tempDir, '.acswrc'), '{"profile":"root"}');
    const child = join(tempDir, 'sub');
    await mkdir(child, { recursive: true });
    await Bun.write(join(child, '.acswrc'), '{"profile":"child"}');

    const result = await findAcswrc(child);
    expect(result).toBe(join(child, '.acswrc'));
  });

  it('returns null when no .acswrc exists', async () => {
    const result = await findAcswrc(tempDir);
    expect(result).toBeNull();
  });
});

// -- readAcswrc --

describe('readAcswrc', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-rc-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('parses valid .acswrc with profile', async () => {
    const rcPath = join(tempDir, '.acswrc');
    await Bun.write(rcPath, '{"profile":"work"}');

    const result = await readAcswrc(rcPath);
    expect(result).toEqual({ profile: 'work' });
  });

  it('parses .acswrc without profile key', async () => {
    const rcPath = join(tempDir, '.acswrc');
    await Bun.write(rcPath, '{}');

    const result = await readAcswrc(rcPath);
    expect(result).toEqual({});
  });

  it('returns null for deleted file (ENOENT race)', async () => {
    const result = await readAcswrc(join(tempDir, 'nonexistent'));
    expect(result).toBeNull();
  });

  it('throws on invalid JSON', async () => {
    const rcPath = join(tempDir, '.acswrc');
    await Bun.write(rcPath, '{{not json');

    await expect(readAcswrc(rcPath)).rejects.toThrow('Failed to parse');
  });

  it('throws on non-object (array)', async () => {
    const rcPath = join(tempDir, '.acswrc');
    await Bun.write(rcPath, '[1,2,3]');

    await expect(readAcswrc(rcPath)).rejects.toThrow('must be a JSON object');
  });

  it('throws on non-object (null)', async () => {
    const rcPath = join(tempDir, '.acswrc');
    await Bun.write(rcPath, 'null');

    await expect(readAcswrc(rcPath)).rejects.toThrow('must be a JSON object');
  });

  it('throws on non-object (string)', async () => {
    const rcPath = join(tempDir, '.acswrc');
    await Bun.write(rcPath, '"hello"');

    await expect(readAcswrc(rcPath)).rejects.toThrow('must be a JSON object');
  });

  it('throws when profile is not a string', async () => {
    const rcPath = join(tempDir, '.acswrc');
    await Bun.write(rcPath, '{"profile":123}');

    await expect(readAcswrc(rcPath)).rejects.toThrow(
      '"profile" must be a string',
    );
  });
});

// -- detectShell --

describe('detectShell', () => {
  it('detects zsh', () => {
    expect(detectShell('/bin/zsh')).toBe('zsh');
  });

  it('detects bash', () => {
    expect(detectShell('/bin/bash')).toBe('bash');
  });

  it('detects fish', () => {
    expect(detectShell('/usr/local/bin/fish')).toBe('fish');
  });

  it('detects zsh from full path', () => {
    expect(detectShell('/usr/local/bin/zsh')).toBe('zsh');
  });

  it('throws for unknown shell', () => {
    expect(() => detectShell('/bin/csh')).toThrow('Could not detect');
  });

  it('throws for empty string', () => {
    expect(() => detectShell('')).toThrow('Could not detect');
  });

  it('falls back to process.env.SHELL when no argument given', () => {
    // In the test environment, $SHELL is typically set to zsh or bash
    if (process.env.SHELL) {
      expect(() => detectShell()).not.toThrow();
    }
  });
});

// -- generateHook --

describe('generateHook', () => {
  it('generates zsh hook with chpwd and dedup guard', () => {
    const hook = generateHook('zsh');
    expect(hook).toContain('add-zsh-hook -D chpwd _acsw_autoload_hook');
    expect(hook).toContain('add-zsh-hook chpwd _acsw_autoload_hook');
    expect(hook).toContain('acsw env --apply');
  });

  it('generates bash hook with cd alias', () => {
    const hook = generateHook('bash');
    expect(hook).toContain('alias cd=__acsw_cd');
    expect(hook).toContain('acsw env --apply');
  });

  it('generates fish hook with PWD variable', () => {
    const hook = generateHook('fish');
    expect(hook).toContain('--on-variable PWD');
    expect(hook).toContain('acsw env --apply');
  });

  it('throws for unsupported shell', () => {
    expect(() => generateHook('csh')).toThrow('Unsupported shell');
  });

  it('does not start with a newline', () => {
    expect(generateHook('zsh').startsWith('\n')).toBe(false);
    expect(generateHook('bash').startsWith('\n')).toBe(false);
    expect(generateHook('fish').startsWith('\n')).toBe(false);
  });

  it('ends with a trailing newline', () => {
    expect(generateHook('zsh').endsWith('\n')).toBe(true);
    expect(generateHook('bash').endsWith('\n')).toBe(true);
    expect(generateHook('fish').endsWith('\n')).toBe(true);
  });
});
