const colorsEnabled =
  !('NO_COLOR' in process.env) &&
  ('FORCE_COLOR' in process.env || process.stdout.isTTY === true);

const RESET = '\u001B[0m';
const BOLD = '\u001B[1m';
const DIM = '\u001B[2m';
const RED = '\u001B[31m';
const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const BLUE = '\u001B[34m';
const CYAN = '\u001B[36m';
const MAGENTA = '\u001B[35m';

function wrap(code: string, text: string): string {
  return colorsEnabled ? `${code}${text}${RESET}` : text;
}

export function bold(text: string): string {
  return wrap(BOLD, text);
}

export function dim(text: string): string {
  return wrap(DIM, text);
}

export function green(text: string): string {
  return wrap(GREEN, text);
}

export function red(text: string): string {
  return wrap(RED, text);
}

export function cyan(text: string): string {
  return wrap(CYAN, text);
}

export function yellow(text: string): string {
  return wrap(YELLOW, text);
}

export function magenta(text: string): string {
  return wrap(MAGENTA, text);
}

export function blue(text: string): string {
  return wrap(BLUE, text);
}

export function formatSubscription(sub: string | null): string {
  if (!sub) return dim('unknown');
  const map: Record<string, (s: string) => string> = {
    max: magenta,
    pro: cyan,
    free: dim,
    team: blue,
    enterprise: yellow,
  };
  const formatter = map[sub.toLowerCase()];
  return formatter ? formatter(sub) : dim(sub);
}
