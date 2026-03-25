import type { ProviderConfig } from '@lib/types';

import { homedir } from 'node:os';
import { join } from 'node:path';

export const CLAUDE_JSON = join(homedir(), '.claude.json');

export const PROFILES_DIR = join(homedir(), '.acsw');
export const STATE_FILE = join(PROFILES_DIR, 'state.json');

export const KEYCHAIN_SERVICE = 'Claude Code-credentials';

export const PROFILE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export type CommandEntry = { name: string; description: string };

export const COMMANDS: readonly CommandEntry[] = [
  { name: 'add', description: 'Save current session as a profile' },
  { name: 'use', description: 'Switch to a profile' },
  { name: 'list', description: 'List all profiles' },
  { name: 'remove', description: 'Remove a profile' },
  { name: 'current', description: 'Show active profile' },
  { name: 'repair', description: 'Validate and fix profiles' },
  { name: 'env', description: 'Shell integration for auto-switching' },
  { name: 'completions', description: 'Generate shell completions' },
];

export const COMMAND_ALIASES: Record<string, string> = {
  ls: 'list',
  rm: 'remove',
};

export const ALL_COMMAND_NAMES = [
  ...COMMANDS.map((c) => c.name),
  ...Object.keys(COMMAND_ALIASES),
];

export function createProviderConfig(): ProviderConfig {
  return {
    platform: process.platform,
    homedir: homedir(),
    env: process.env as Record<string, string | undefined>,
  };
}

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
