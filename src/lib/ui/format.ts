const RESET = '\u001B[0m';
const BOLD = '\u001B[1m';
const DIM = '\u001B[2m';
const RED = '\u001B[31m';
const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const BLUE = '\u001B[34m';
const CYAN = '\u001B[36m';
const MAGENTA = '\u001B[35m';

export function bold(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

export function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

export function green(text: string): string {
  return `${GREEN}${text}${RESET}`;
}

export function red(text: string): string {
  return `${RED}${text}${RESET}`;
}

export function cyan(text: string): string {
  return `${CYAN}${text}${RESET}`;
}

export function yellow(text: string): string {
  return `${YELLOW}${text}${RESET}`;
}

export function magenta(text: string): string {
  return `${MAGENTA}${text}${RESET}`;
}

export function blue(text: string): string {
  return `${BLUE}${text}${RESET}`;
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
