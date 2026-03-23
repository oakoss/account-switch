import { homedir } from 'node:os';
import { join } from 'node:path';

export const CLAUDE_DIR = join(homedir(), '.claude');
export const CLAUDE_JSON = join(homedir(), '.claude.json');
export const CREDENTIALS_FILE = join(CLAUDE_DIR, '.credentials.json');

export const PROFILES_DIR = join(homedir(), '.acsw');
export const STATE_FILE = join(PROFILES_DIR, 'state.json');

export const KEYCHAIN_SERVICE = 'Claude Code-credentials';

export const PROFILE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export function getKeychainAccount(): string {
  const user = process.env.USER;
  if (!user) {
    throw new Error(
      'Could not determine system username ($USER is not set). ' +
        'This is required for macOS Keychain access.',
    );
  }
  return user;
}

export function profileDir(name: string): string {
  if (!PROFILE_NAME_REGEX.test(name)) {
    throw new Error(`Invalid profile name: "${name}"`);
  }
  return join(PROFILES_DIR, name);
}

export function profileCredentialsFile(name: string): string {
  return join(profileDir(name), 'credentials.json');
}

export function profileAccountFile(name: string): string {
  return join(profileDir(name), 'account.json');
}

export function profileMetaFile(name: string): string {
  return join(profileDir(name), 'profile.json');
}
