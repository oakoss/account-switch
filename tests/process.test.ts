import { isClaudeRunning, checkClaudeStatus } from '@lib/process';
import * as spawnModule from '@lib/spawn';
import { describe, it, expect, spyOn } from 'bun:test';

describe('isClaudeRunning', () => {
  it('returns false when pgrep exits with 1 (no match)', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
    const result = await isClaudeRunning();
    expect(result).toBe(false);
    expect(spy.mock.calls[0]?.[0]).toEqual(['pgrep', '-xi', 'claude']);
    spy.mockRestore();
  });

  it('returns true when pgrep finds a process', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '12345',
      stderr: '',
      exitCode: 0,
    });
    const result = await isClaudeRunning();
    expect(result).toBe(true);
    spy.mockRestore();
  });

  it('returns false when pgrep exits 0 but stdout is empty', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    const result = await isClaudeRunning();
    expect(result).toBe(false);
    spy.mockRestore();
  });

  it('returns false on pgrep exit code 2 (syntax error) with empty stdout', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 2,
    });
    const result = await isClaudeRunning();
    expect(result).toBe(false);
    spy.mockRestore();
  });

  it('returns null when spawn throws', async () => {
    const spy = spyOn(spawnModule, 'exec').mockRejectedValue(
      new Error('pgrep not found'),
    );
    const result = await isClaudeRunning();
    expect(result).toBeNull();
    spy.mockRestore();
  });
});

describe('checkClaudeStatus', () => {
  it('returns not-running when pgrep finds nothing', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
    const result = await checkClaudeStatus();
    expect(result).toBe('not-running');
    spy.mockRestore();
  });

  it('returns running when pgrep finds a process', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '12345',
      stderr: '',
      exitCode: 0,
    });
    const result = await checkClaudeStatus();
    expect(result).toBe('running');
    spy.mockRestore();
  });

  it('returns unknown when spawn throws', async () => {
    const spy = spyOn(spawnModule, 'exec').mockRejectedValue(
      new Error('pgrep not found'),
    );
    const result = await checkClaudeStatus();
    expect(result).toBe('unknown');
    spy.mockRestore();
  });
});
