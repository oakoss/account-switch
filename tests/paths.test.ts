import { profilePaths } from '@lib/paths';
import { describe, it, expect } from 'bun:test';
import { join } from 'node:path';

describe('profilePaths', () => {
  it('returns all 4 path fields', () => {
    const result = profilePaths('/home/user/.acsw', 'work');
    expect(result.dir).toBe(join('/home/user/.acsw', 'work'));
    expect(result.credentials).toBe(
      join('/home/user/.acsw', 'work', 'credentials.json'),
    );
    expect(result.account).toBe(
      join('/home/user/.acsw', 'work', 'account.json'),
    );
    expect(result.meta).toBe(join('/home/user/.acsw', 'work', 'profile.json'));
  });

  it('accepts hyphens and underscores', () => {
    expect(() => profilePaths('/tmp', 'my-work')).not.toThrow();
    expect(() => profilePaths('/tmp', 'my_work')).not.toThrow();
    expect(() => profilePaths('/tmp', 'Work123')).not.toThrow();
  });

  it('throws on names with dots', () => {
    expect(() => profilePaths('/tmp', 'my.work')).toThrow(
      'Invalid profile name',
    );
  });

  it('throws on names with slashes', () => {
    expect(() => profilePaths('/tmp', '../etc')).toThrow(
      'Invalid profile name',
    );
  });

  it('throws on names with spaces', () => {
    expect(() => profilePaths('/tmp', 'my work')).toThrow(
      'Invalid profile name',
    );
  });

  it('throws on empty name', () => {
    expect(() => profilePaths('/tmp', '')).toThrow('Invalid profile name');
  });
});
