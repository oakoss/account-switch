import { output, prompts } from './ui/clack';

export type { SelectOption, SelectOptions } from './ui/types';

export {
  bold,
  dim,
  green,
  red,
  cyan,
  yellow,
  magenta,
  blue,
  formatSubscription,
} from './ui/format';

export const success = output.success;
export const error = output.error;
export const warn = output.warn;
export const info = output.info;
export const hint = output.hint;
export const blank = output.blank;
export const log = output.log;
export const confirm = prompts.confirm;
export const select = prompts.select;
