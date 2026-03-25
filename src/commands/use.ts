import { createProviderConfig } from '@lib/constants';
import { createResolver } from '@lib/providers/registry';
import { attemptSwitch } from '@lib/switch';
import * as ui from '@lib/ui';
import { defineCommand } from 'citty';

import { handleSwitchResult } from './switch-handler';

export default defineCommand({
  meta: { name: 'use', description: 'Switch to a profile' },
  args: {
    name: { type: 'positional', description: 'Profile name', required: true },
  },
  async run({ args }) {
    const resolve = createResolver(createProviderConfig());
    const result = await attemptSwitch(args.name, resolve);
    ui.blank();
    await handleSwitchResult(args.name, result, resolve);
    ui.blank();
  },
});
