import {
  generateBashCompletion,
  generateFishCompletion,
  generateZshCompletion,
  listProfileNames,
} from '@lib/completions';
import { PROFILES_DIR } from '@lib/constants';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

const SUPPORTED_SHELLS = new Set(['zsh', 'bash', 'fish']);

export default defineCommand({
  meta: { name: 'completions', description: 'Generate shell completions' },
  args: {
    shell: {
      type: 'positional',
      description: 'Shell type (zsh, bash, fish)',
      required: false,
    },
    'list-profiles': {
      type: 'boolean',
      description: 'List profile names (used by completion scripts)',
    },
  },
  async run({ args }) {
    if (args['list-profiles']) {
      const names = await listProfileNames(PROFILES_DIR);
      for (const name of names) {
        console.log(name);
      }
      return;
    }

    if (!args.shell) {
      ui.error('Shell type required. Use: acsw completions zsh|bash|fish');
      process.exitCode = 1;
      return;
    }

    if (!SUPPORTED_SHELLS.has(args.shell)) {
      ui.error(`Unsupported shell: "${args.shell}". Use zsh, bash, or fish.`);
      process.exitCode = 1;
      return;
    }

    const generators: Record<string, () => string> = {
      bash: generateBashCompletion,
      zsh: generateZshCompletion,
      fish: generateFishCompletion,
    };

    console.log(generators[args.shell]());
  },
});
