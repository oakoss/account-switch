import {
  log,
  confirm as clackConfirm,
  select as clackSelect,
  isCancel,
} from '@clack/prompts';

import type { OutputAdapter, PromptAdapter, SelectOptions } from './types';

export const output: OutputAdapter = {
  success(msg: string) {
    log.success(msg);
  },
  error(msg: string) {
    log.error(msg);
  },
  warn(msg: string) {
    log.warning(msg);
  },
  info(msg: string) {
    log.info(msg);
  },
  hint(msg: string) {
    log.message(msg, { symbol: ' ' });
  },
  blank() {
    console.log();
  },
  log(msg: string) {
    log.message(msg);
  },
};

export const prompts: PromptAdapter = {
  async confirm(message: string): Promise<boolean> {
    const result = await clackConfirm({ message, initialValue: false });
    if (isCancel(result)) process.exit(130);
    return result;
  },

  async select<T extends string | number>(
    opts: SelectOptions<T>,
  ): Promise<T | null> {
    const result = await (
      clackSelect as (opts: unknown) => Promise<T | symbol>
    )({ message: opts.message, options: opts.options });
    if (isCancel(result)) process.exit(130);
    return result;
  },
};
