import {
  checkClaudeStatus,
  createPgrepDetector,
  createProcessDetector,
  createTasklistDetector,
  type ProcessDetector,
} from '@lib/process';
import * as spawnModule from '@lib/spawn';
import { describe, it, expect, spyOn } from 'bun:test';

// -- createPgrepDetector --

describe('createPgrepDetector', () => {
  it('returns false when pgrep exits with 1 (no match)', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
    const detector = createPgrepDetector();
    const result = await detector.isRunning('claude');
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
    const detector = createPgrepDetector();
    const result = await detector.isRunning('claude');
    expect(result).toBe(true);
    spy.mockRestore();
  });

  it('returns false when pgrep exits 0 but stdout is empty', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    const detector = createPgrepDetector();
    const result = await detector.isRunning('claude');
    expect(result).toBe(false);
    spy.mockRestore();
  });

  it('returns null when exec throws', async () => {
    const spy = spyOn(spawnModule, 'exec').mockRejectedValue(
      new Error('pgrep not found'),
    );
    const detector = createPgrepDetector();
    const result = await detector.isRunning('claude');
    expect(result).toBeNull();
    spy.mockRestore();
  });
});

// -- createTasklistDetector --

describe('createTasklistDetector', () => {
  it('returns true when tasklist finds the process', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout:
        'claude.exe                    1234 Console                    1    123,456 K',
      stderr: '',
      exitCode: 0,
    });
    const detector = createTasklistDetector();
    const result = await detector.isRunning('claude');
    expect(result).toBe(true);
    expect(spy.mock.calls[0]?.[0]).toEqual([
      'tasklist',
      '/FI',
      'IMAGENAME eq claude.exe',
      '/NH',
    ]);
    spy.mockRestore();
  });

  it('returns false when tasklist finds no match', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: 'INFO: No tasks are running which match the specified criteria.',
      stderr: '',
      exitCode: 0,
    });
    const detector = createTasklistDetector();
    const result = await detector.isRunning('claude');
    expect(result).toBe(false);
    spy.mockRestore();
  });

  it('returns null on non-zero exit code', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: 'error',
      exitCode: 1,
    });
    const detector = createTasklistDetector();
    const result = await detector.isRunning('claude');
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null when exec throws', async () => {
    const spy = spyOn(spawnModule, 'exec').mockRejectedValue(
      new Error('tasklist not found'),
    );
    const detector = createTasklistDetector();
    const result = await detector.isRunning('claude');
    expect(result).toBeNull();
    spy.mockRestore();
  });
});

// -- createProcessDetector --

describe('createProcessDetector', () => {
  it('returns pgrep detector for darwin', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
    const detector = createProcessDetector('darwin');
    await detector.isRunning('test');
    expect(spy.mock.calls[0]?.[0]).toEqual(['pgrep', '-xi', 'test']);
    spy.mockRestore();
  });

  it('returns pgrep detector for linux', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
    const detector = createProcessDetector('linux');
    await detector.isRunning('test');
    expect(spy.mock.calls[0]?.[0]).toEqual(['pgrep', '-xi', 'test']);
    spy.mockRestore();
  });

  it('returns tasklist detector for win32', async () => {
    const spy = spyOn(spawnModule, 'exec').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    const detector = createProcessDetector('win32');
    await detector.isRunning('test');
    expect(spy.mock.calls[0]?.[0]).toEqual([
      'tasklist',
      '/FI',
      'IMAGENAME eq test.exe',
      '/NH',
    ]);
    spy.mockRestore();
  });
});

// -- checkClaudeStatus --

describe('checkClaudeStatus', () => {
  function mockDetector(result: boolean | null): ProcessDetector {
    return { isRunning: async () => result };
  }

  it('returns not-running when detector says false', async () => {
    const result = await checkClaudeStatus(mockDetector(false));
    expect(result).toBe('not-running');
  });

  it('returns running when detector says true', async () => {
    const result = await checkClaudeStatus(mockDetector(true));
    expect(result).toBe('running');
  });

  it('returns unknown when detector says null', async () => {
    const result = await checkClaudeStatus(mockDetector(null));
    expect(result).toBe('unknown');
  });
});
