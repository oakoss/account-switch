#!/usr/bin/env node

import { createProviderConfig } from '@lib/constants';
import { listProfiles } from '@lib/profiles';
import { createResolver } from '@lib/providers/registry';
import { attemptSwitch } from '@lib/switch';
import * as ui from '@lib/ui';
import { defineCommand, runMain } from 'citty';

const KNOWN_COMMANDS = new Set([
  'add',
  'use',
  'list',
  'ls',
  'remove',
  'rm',
  'current',
  'repair',
  'env',
  'completions',
  'help',
  '--help',
  '-h',
  '--version',
  '-v',
]);

// Bun resolves JSON imports at build time, so this works in both dev and compiled binary
const { version: PKG_VERSION } = await import('../package.json');

const main = defineCommand({
  meta: {
    name: 'acsw',
    version: PKG_VERSION,
    description: 'Switch between CLI tool accounts',
  },
  subCommands: {
    add: () => import('@commands/add').then((m) => m.default),
    use: () => import('@commands/use').then((m) => m.default),
    list: () => import('@commands/list').then((m) => m.default),
    ls: () => import('@commands/list').then((m) => m.default),
    remove: () => import('@commands/remove').then((m) => m.default),
    rm: () => import('@commands/remove').then((m) => m.default),
    current: () => import('@commands/current').then((m) => m.default),
    repair: () => import('@commands/repair').then((m) => m.default),
    env: () => import('@commands/env').then((m) => m.default),
    completions: () => import('@commands/completions').then((m) => m.default),
  },
  async run({ rawArgs }) {
    // If a subcommand was given, citty already handled it — skip the picker
    if (rawArgs.length > 0) return;

    const config = createProviderConfig();
    const resolve = createResolver(config);
    const profiles = await listProfiles(resolve);

    if (profiles.length === 0) {
      ui.blank();
      ui.info('No profiles yet');
      ui.hint("Run 'acsw add <name>' to save your current session.");
      ui.blank();
      return;
    }

    ui.blank();
    const selected = await ui.select({
      message: 'Switch profile',
      options: profiles.map((p) => ({
        value: p.name,
        label: p.isActive
          ? `${ui.green(ui.bold(p.name))} ${ui.dim('(active)')}`
          : p.name,
        hint: [ui.formatSubscription(p.subscriptionType), p.email]
          .filter(Boolean)
          .join('  '),
      })),
    });

    if (!selected) return;

    const result = await attemptSwitch(selected, resolve);
    let declined = false;
    const { handleSwitchResult } = await import('@commands/switch-handler');
    await handleSwitchResult(selected, result, resolve, () => {
      declined = true;
    });
    if (declined) return;
    ui.blank();
  },
});

// Handle `acsw <profile-name>` shortcut before citty processes args
const firstArg = process.argv[2];
if (firstArg && !firstArg.startsWith('-') && !KNOWN_COMMANDS.has(firstArg)) {
  const { profileExists } = await import('@lib/profiles');

  let exists = false;
  try {
    exists = await profileExists(firstArg);
  } catch (error) {
    // profilePaths throws for invalid names — fall through to citty
    const isNameError =
      error instanceof Error &&
      error.message.startsWith('Invalid profile name');
    if (!isNameError) {
      ui.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  if (exists) {
    try {
      const resolve = createResolver(createProviderConfig());
      const result = await attemptSwitch(firstArg, resolve);
      const { handleSwitchResult } = await import('@commands/switch-handler');
      ui.blank();
      await handleSwitchResult(firstArg, result, resolve);
      ui.blank();
    } catch (error) {
      ui.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    process.exit(0);
  }
}

runMain(main);
