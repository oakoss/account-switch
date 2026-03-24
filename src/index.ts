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
import {
  createProvider,
  createDefaultProvider,
  createResolver,
} from './lib/providers/registry';
import * as ui from './lib/ui';

const config: ProviderConfig = {
  platform: process.platform,
  homedir: homedir(),
  env: process.env as Record<string, string | undefined>,
};

const resolve = createResolver(config);

const HELP = `
  ${ui.bold('acsw')} — Switch between CLI tool accounts

  ${ui.dim('Usage:')}
    acsw                  Interactive profile picker
    acsw add <name>       Save current session as a profile
    acsw use <name>       Switch to a profile
    acsw list             List all profiles
    acsw remove <name>    Remove a profile
    acsw current          Show active profile
    acsw repair           Validate and fix profiles
    acsw help             Show this help

  ${ui.dim('Add options:')}
    --provider <name>     Provider to use (default: claude)

  ${ui.dim('Shortcuts:')}
    acsw <name>           Same as 'use <name>'
    acsw ls               Same as 'list'
    acsw rm <name>        Same as 'remove <name>'
    acsw --version        Show version
`;

function parseProviderFlag(args: string[]): {
  providerName: string | null;
  rest: string[];
} {
  const idx = args.indexOf('--provider');
  if (idx === -1) return { providerName: null, rest: args };
  const providerName = args[idx + 1];
  if (!providerName || providerName.startsWith('-')) {
    ui.error('--provider requires a value');
    process.exit(1);
  }
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { providerName, rest };
}

async function interactivePicker(): Promise<void> {
  const profiles = await listProfiles(resolve);

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

  await use(selected.name, resolve);
}

async function main(): Promise<void> {
  const [command, ...rawArgs] = process.argv.slice(2);
  const { providerName, rest: args } = parseProviderFlag(rawArgs);

  try {
    switch (command) {
      case undefined: {
        return interactivePicker();
      }

      case 'add': {
        const provider = providerName
          ? createProvider(providerName, config)
          : createDefaultProvider(config);
        return add(args[0], provider);
      }

      case 'use': {
        return use(args[0], resolve);
      }

      case 'list':
      case 'ls': {
        return list(resolve);
      }

      case 'remove':
      case 'rm': {
        return remove(args[0], resolve);
      }

      case 'current': {
        return current(resolve);
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
        const profiles = await listProfiles(resolve);
        const match = profiles.find((p) => p.name === command);
        if (match) {
          return use(command, resolve);
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
