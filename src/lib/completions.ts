import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { PROFILE_NAME_REGEX } from './constants';
import { isENOENT } from './fs';

export async function listProfileNames(profilesDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(profilesDir);
  } catch (error: unknown) {
    if (isENOENT(error)) return [];
    throw error;
  }

  const names: string[] = [];
  for (const entry of entries) {
    const name = String(entry);
    if (!PROFILE_NAME_REGEX.test(name)) continue;
    if (await Bun.file(join(profilesDir, name, 'profile.json')).exists()) {
      names.push(name);
    }
  }
  return names.sort();
}

const SUBCOMMANDS = [
  'add',
  'use',
  'list',
  'ls',
  'remove',
  'rm',
  'current',
  'repair',
  'env',
  'completions',
];

const SUBCOMMAND_DESCRIPTIONS: Record<string, string> = {
  add: 'Save current session as a profile',
  use: 'Switch to a profile',
  list: 'List all profiles',
  remove: 'Remove a profile',
  current: 'Show active profile',
  repair: 'Validate and repair profiles',
  env: 'Shell integration for auto-switching',
  completions: 'Generate shell completions',
};

export function generateBashCompletion(): string {
  const cmds = SUBCOMMANDS.join(' ');
  return `_acsw() {
    local cur prev
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    if [[ \${COMP_CWORD} -eq 1 ]]; then
        local profiles
        profiles="$(acsw completions --list-profiles 2>/dev/null)"
        COMPREPLY=($(compgen -W "${cmds} \${profiles}" -- "\${cur}"))
        return 0
    fi

    case "\${COMP_WORDS[1]}" in
        use|remove|rm)
            local profiles
            profiles="$(acsw completions --list-profiles 2>/dev/null)"
            COMPREPLY=($(compgen -W "\${profiles}" -- "\${cur}"))
            return 0
            ;;
    esac
}
complete -F _acsw -o default acsw
`;
}

export function generateZshCompletion(): string {
  const subcmds = Object.entries(SUBCOMMAND_DESCRIPTIONS)
    .map(([name, desc]) => `                '${name}:${desc}'`)
    .join('\n');

  return `#compdef acsw
compdef _acsw acsw

_acsw() {
    local line state

    _arguments -C \\
        "1: :->cmds" \\
        "*::arg:->args"

    case "$state" in
        cmds)
            local -a subcommands profiles
            subcommands=(
${subcmds}
            )
            profiles=(\${(f)"$(acsw completions --list-profiles 2>/dev/null)"})
            _describe 'command' subcommands
            [[ -n "$profiles" ]] && compadd -X 'profiles' $profiles
            ;;
        args)
            case $line[1] in
                use|remove|rm)
                    local -a profiles
                    profiles=(\${(f)"$(acsw completions --list-profiles 2>/dev/null)"})
                    _describe 'profile' profiles
                    ;;
                env)
                    _arguments \\
                        '--use-on-cd[Output shell hook for auto-switch on cd]' \\
                        '--shell[Shell type]:shell:(zsh bash fish)' \\
                        '--apply[Apply .acswrc for current directory]'
                    ;;
            esac
            ;;
    esac
}

_acsw "$@"
`;
}

export function generateFishCompletion(): string {
  const cmds = SUBCOMMANDS.join(' ');
  const subcmdLines = Object.entries(SUBCOMMAND_DESCRIPTIONS)
    .map(
      ([name, desc]) =>
        `complete -c acsw -n "not __fish_seen_subcommand_from ${cmds}" -a "${name}" -d "${desc}"`,
    )
    .join('\n');

  return `# Disable file completions for acsw
complete -c acsw -f

# Subcommands
${subcmdLines}

# Profile names for bare acsw <profile> shortcut
complete -c acsw -n "not __fish_seen_subcommand_from ${cmds}" \\
    -a "(acsw completions --list-profiles 2>/dev/null)"

# Profile names for use and remove
complete -c acsw -n "__fish_seen_subcommand_from use remove rm" \\
    -a "(acsw completions --list-profiles 2>/dev/null)"

# env subcommand flags
complete -c acsw -n "__fish_seen_subcommand_from env" -l use-on-cd -d "Output shell hook for auto-switch on cd"
complete -c acsw -n "__fish_seen_subcommand_from env" -l shell -d "Shell type" -xa "zsh bash fish"
complete -c acsw -n "__fish_seen_subcommand_from env" -l apply -d "Apply .acswrc for current directory"
`;
}
