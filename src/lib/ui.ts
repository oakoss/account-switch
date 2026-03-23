const RESET = '\u001B[0m';
const BOLD = '\u001B[1m';
const DIM = '\u001B[2m';
const RED = '\u001B[31m';
const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const BLUE = '\u001B[34m';
const CYAN = '\u001B[36m';
const MAGENTA = '\u001B[35m';

export function success(msg: string): void {
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}

export function error(msg: string): void {
  console.error(`  ${RED}✗${RESET} ${RED}${msg}${RESET}`);
}

export function warn(msg: string): void {
  console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${BLUE}●${RESET} ${msg}`);
}

export function hint(msg: string): void {
  console.log(`  ${DIM}${msg}${RESET}`);
}

export function blank(): void {
  console.log();
}

export function bold(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

export function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

export function green(text: string): string {
  return `${GREEN}${text}${RESET}`;
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

async function readLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = Bun.file('/dev/stdin').stream().getReader();
      reader.read().then(
        ({ value }) => {
          reader.releaseLock();
          resolve(value ? Buffer.from(value).toString('utf8').trim() : '');
        },
        (error) => {
          reader.releaseLock();
          reject(
            new Error(
              `Failed to read from stdin: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        },
      );
    } catch (error) {
      reject(
        new Error(
          `stdin is not available: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  });
}

export async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`  ${message} ${dim('[y/N]')} `);
  const answer = (await readLine()).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

export async function prompt(message: string): Promise<string> {
  process.stdout.write(`  ${message} `);
  return readLine();
}

export async function pickNumber(max: number): Promise<number | null> {
  process.stdout.write(`\n  ${dim(`Select [1-${max}]:`)} `);
  const n = Number.parseInt(await readLine(), 10);
  if (n >= 1 && n <= max) return n;
  return null;
}
