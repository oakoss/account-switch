import { join, dirname } from 'node:path';

import { isENOENT } from './fs';

export type AcswrcConfig = { profile?: string };

export async function findAcswrc(startDir: string): Promise<string | null> {
  let dir = startDir;

  while (true) {
    const rcPath = join(dir, '.acswrc');
    if (await Bun.file(rcPath).exists()) return rcPath;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function readAcswrc(path: string): Promise<AcswrcConfig | null> {
  let raw: unknown;
  try {
    raw = await Bun.file(path).json();
  } catch (error) {
    // Race: file may be deleted between findAcswrc's exists() check and this read
    if (isENOENT(error)) {
      return null;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse .acswrc at ${path}: ${msg}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `.acswrc at ${path} must be a JSON object (e.g., { "profile": "work" })`,
    );
  }

  const obj = raw as Record<string, unknown>;
  if (obj.profile !== undefined && typeof obj.profile !== 'string') {
    throw new Error(
      `.acswrc at ${path}: "profile" must be a string (e.g., { "profile": "work" })`,
    );
  }

  return obj as AcswrcConfig;
}

export function detectShell(shellEnv?: string): string {
  const shell = shellEnv ?? process.env.SHELL ?? '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  throw new Error(
    `Could not detect a supported shell from $SHELL="${shell}". Use --shell zsh|bash|fish.`,
  );
}

export function generateHook(shell: string): string {
  if (shell === 'zsh') {
    return `
autoload -U add-zsh-hook
_acsw_autoload_hook() {
  acsw env --apply
}
add-zsh-hook -D chpwd _acsw_autoload_hook
add-zsh-hook chpwd _acsw_autoload_hook

_acsw_autoload_hook
`.trimStart();
  }

  if (shell === 'bash') {
    return `
__acsw_cd() {
  \\cd "$@" || return $?
  acsw env --apply
}
alias cd=__acsw_cd

acsw env --apply
`.trimStart();
  }

  if (shell === 'fish') {
    return `
function _acsw_autoload_hook --on-variable PWD --description 'Switch acsw profile on directory change'
  status --is-command-substitution; and return
  acsw env --apply
end

_acsw_autoload_hook
`.trimStart();
  }

  throw new Error(`Unsupported shell: ${shell}. Use zsh, bash, or fish.`);
}
