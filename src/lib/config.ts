import type { OAuthAccount } from './types';

import { CLAUDE_JSON } from './constants';

type ClaudeJson = { oauthAccount?: OAuthAccount; [key: string]: unknown };

export async function readOAuthAccount(): Promise<OAuthAccount | null> {
  const file = Bun.file(CLAUDE_JSON);
  if (!(await file.exists())) return null;
  try {
    const data = (await file.json()) as ClaudeJson;
    return data.oauthAccount ?? null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`~/.claude.json exists but could not be parsed: ${msg}`);
  }
}

export async function writeOAuthAccount(
  account: OAuthAccount | null,
): Promise<void> {
  const file = Bun.file(CLAUDE_JSON);
  if (!(await file.exists())) {
    throw new Error(
      `${CLAUDE_JSON} not found. Run 'claude' first to initialize.`,
    );
  }

  let data: ClaudeJson;
  try {
    const raw = await file.text();
    data = JSON.parse(raw) as ClaudeJson;
  } catch (error) {
    const parseMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `~/.claude.json is corrupted and cannot be updated: ${parseMsg}. ` +
        `Back up the file and run 'claude' to reinitialize it.`,
    );
  }

  if (account) {
    data.oauthAccount = account;
  } else {
    delete data.oauthAccount;
  }

  const tmpPath = `${CLAUDE_JSON}.tmp`;
  try {
    await Bun.write(tmpPath, JSON.stringify(data, null, 2));
    const { renameSync } = await import('node:fs');
    renameSync(tmpPath, CLAUDE_JSON);
  } catch (error) {
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(tmpPath);
    } catch {
      /* cleanup best-effort */
    }
    throw error;
  }
}
