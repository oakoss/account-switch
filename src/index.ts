#!/usr/bin/env node

import { homedir } from 'node:os';

import type { ProviderConfig } from './lib/types';

import { add } from './commands/add';
import { current } from './commands/current';
import { list } from './commands/list';
import { remove } from './commands/remove';
import { repair } from './commands/repair';
import { use } from './commands/use';
import { listProfiles } from './lib/profiles';
import { createDefaultProvider } from './lib/providers/registry';
import * as ui from './lib/ui';

const config: ProviderConfig = {
  platform: process.platform,
  homedir: homedir(),
  env: process.env as Record<string, string | undefined>,
};

const provider = createDefaultProvider(config);

const HELP = `
  ${ui.bold('acsw')} — Switch between Claude Code accounts

  ${ui.dim('Usage:')}
    acsw                  Interactive profile picker
    acsw add <name>       Save current session as a profile
    acsw use <name>       Switch to a profile
    acsw list             List all profiles
    acsw remove <name>    Remove a profile
    acsw current          Show active profile
    acsw repair           Validate and fix profiles
    acsw help             Show this help

  ${ui.dim('Shortcuts:')}
    acsw <name>           Same as 'use <name>'
    acsw ls               Same as 'list'
    acsw rm <name>        Same as 'remove <name>'
    acsw --version        Show version
`;

async function interactivePicker(): Promise<void> {
  const profiles = await listProfiles(provider);

  if (profiles.length === 0) {
    ui.blank();
    console.log(`  ${ui.bold('acsw')}`);
    ui.blank();
    ui.hint(
      "No profiles yet. Run 'acsw add <name>' to save your current session.",
    );
    ui.blank();
    return;
  }

  ui.blank();
  console.log(`  ${ui.bold('Switch profile')}`);
  ui.blank();

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const num = ui.dim(`${i + 1}.`);
    const name = p.isActive ? ui.green(ui.bold(p.name)) : p.name;
    const sub = ui.formatSubscription(p.subscriptionType);
    const active = p.isActive ? ui.dim(' (active)') : '';
    const email = p.email ? `  ${ui.dim(p.email)}` : '';

    console.log(`  ${num} ${name}${active}  ${sub}${email}`);
  }

  const choice = await ui.pickNumber(profiles.length);
  if (choice === null) {
    ui.blank();
    ui.hint(
      `No valid selection. Use a number between 1 and ${profiles.length}.`,
    );
    ui.blank();
    return;
  }

  const selected = profiles[choice - 1];
  if (selected.isActive) {
    ui.blank();
    ui.success(`Already on ${ui.bold(selected.name)}`);
    ui.blank();
    return;
  }

  await use(selected.name, provider);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  try {
    switch (command) {
      case undefined: {
        return interactivePicker();
      }

      case 'add': {
        return add(args[0], provider);
      }

      case 'use': {
        return use(args[0], provider);
      }

      case 'list':
      case 'ls': {
        return list(provider);
      }

      case 'remove':
      case 'rm': {
        return remove(args[0], provider);
      }

      case 'current': {
        return current(provider);
      }

      case 'repair': {
        return repair();
      }

      case 'help':
      case '--help':
      case '-h': {
        console.log(HELP);
        return;
      }

      case '--version':
      case '-v': {
        try {
          const pkgPath = new URL('../package.json', import.meta.url);
          const pkg = await Bun.file(pkgPath).json();
          console.log(pkg.version ?? 'unknown');
        } catch {
          console.log('unknown');
        }
        return;
      }

      default: {
        // Treat unknown arg as a profile name shortcut
        const profiles = await listProfiles(provider);
        const match = profiles.find((p) => p.name === command);
        if (match) {
          return use(command, provider);
        }
        ui.error(`Unknown command: "${command}"`);
        console.log(HELP);
        process.exit(1);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      ui.error(error.message);
    } else {
      ui.error(String(error));
    }
    process.exit(1);
  }
}

main();
