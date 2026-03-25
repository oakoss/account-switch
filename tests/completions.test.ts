import {
  listProfileNames,
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
} from '@lib/completions';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// -- listProfileNames --

describe('listProfileNames', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acsw-comp-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('returns profile names that have profile.json', async () => {
    const work = join(tempDir, 'work');
    await mkdir(work, { recursive: true });
    await Bun.write(join(work, 'profile.json'), '{}');

    const personal = join(tempDir, 'personal');
    await mkdir(personal, { recursive: true });
    await Bun.write(join(personal, 'profile.json'), '{}');

    const names = await listProfileNames(tempDir);
    expect(names.sort()).toEqual(['personal', 'work']);
  });

  it('skips directories without profile.json', async () => {
    const valid = join(tempDir, 'valid');
    await mkdir(valid, { recursive: true });
    await Bun.write(join(valid, 'profile.json'), '{}');

    const empty = join(tempDir, 'empty');
    await mkdir(empty, { recursive: true });

    const names = await listProfileNames(tempDir);
    expect(names).toEqual(['valid']);
  });

  it('skips entries that fail PROFILE_NAME_REGEX', async () => {
    const valid = join(tempDir, 'valid');
    await mkdir(valid, { recursive: true });
    await Bun.write(join(valid, 'profile.json'), '{}');

    // .DS_Store and dotfiles should be skipped
    await Bun.write(join(tempDir, '.DS_Store'), '');

    const names = await listProfileNames(tempDir);
    expect(names).toEqual(['valid']);
  });

  it('returns empty array when directory does not exist', async () => {
    const names = await listProfileNames(join(tempDir, 'nonexistent'));
    expect(names).toEqual([]);
  });

  it('returns empty array when no profiles exist', async () => {
    const names = await listProfileNames(tempDir);
    expect(names).toEqual([]);
  });

  it('returns sorted names', async () => {
    for (const name of ['zebra', 'alpha', 'middle']) {
      const dir = join(tempDir, name);
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, 'profile.json'), '{}');
    }

    const names = await listProfileNames(tempDir);
    expect(names).toEqual(['alpha', 'middle', 'zebra']);
  });
});

// -- generateBashCompletion --

describe('generateBashCompletion', () => {
  it('contains the complete command for acsw', () => {
    const script = generateBashCompletion();
    expect(script).toContain('complete -F _acsw');
    expect(script).toContain('acsw');
  });

  it('includes subcommand names', () => {
    const script = generateBashCompletion();
    expect(script).toContain('add');
    expect(script).toContain('use');
    expect(script).toContain('list');
    expect(script).toContain('remove');
    expect(script).toContain('current');
    expect(script).toContain('repair');
    expect(script).toContain('env');
    expect(script).toContain('completions');
  });

  it('calls acsw completions --list-profiles for dynamic completion', () => {
    const script = generateBashCompletion();
    expect(script).toContain('acsw completions --list-profiles');
  });

  it('completes profile names for use and remove', () => {
    const script = generateBashCompletion();
    expect(script).toContain('use');
    expect(script).toContain('remove');
  });
});

// -- generateZshCompletion --

describe('generateZshCompletion', () => {
  it('starts with #compdef acsw', () => {
    const script = generateZshCompletion();
    expect(script).toContain('#compdef acsw');
  });

  it('includes subcommand descriptions', () => {
    const script = generateZshCompletion();
    expect(script).toContain('add:');
    expect(script).toContain('use:');
    expect(script).toContain('list:');
    expect(script).toContain('remove:');
  });

  it('calls acsw completions --list-profiles for dynamic completion', () => {
    const script = generateZshCompletion();
    expect(script).toContain('acsw completions --list-profiles');
  });
});

// -- generateFishCompletion --

describe('generateFishCompletion', () => {
  it('disables file completions', () => {
    const script = generateFishCompletion();
    expect(script).toContain('complete -c acsw -f');
  });

  it('includes subcommand completion with descriptions', () => {
    const script = generateFishCompletion();
    expect(script).toContain('-a "add"');
    expect(script).toContain('-a "use"');
    expect(script).toContain('-a "remove"');
  });

  it('calls acsw completions --list-profiles for dynamic completion', () => {
    const script = generateFishCompletion();
    expect(script).toContain('acsw completions --list-profiles');
  });

  it('uses __fish_seen_subcommand_from for context', () => {
    const script = generateFishCompletion();
    expect(script).toContain('__fish_seen_subcommand_from');
  });
});
