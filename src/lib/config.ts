import type { OAuthAccount } from './types';

import { CLAUDE_JSON } from './constants';

type ClaudeJson = { oauthAccount?: OAuthAccount; [key: string]: unknown };

export async function readOAuthAccount(
  path?: string,
): Promise<OAuthAccount | null> {
  const configPath = path ?? CLAUDE_JSON;
  const file = Bun.file(configPath);
  if (!(await file.exists())) return null;
  try {
    const data = (await file.json()) as ClaudeJson;
    return data.oauthAccount ?? null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`${configPath} exists but could not be parsed: ${msg}`);
  }
}

export async function writeOAuthAccount(
  account: OAuthAccount | null,
  path?: string,
): Promise<void> {
  const configPath = path ?? CLAUDE_JSON;
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    throw new Error(
      `${configPath} not found. Run 'claude' first to initialize.`,
    );
  }

  let data: ClaudeJson;
  try {
    const raw = await file.text();
    data = JSON.parse(raw) as ClaudeJson;
  } catch (error) {
    const parseMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${configPath} is corrupted and cannot be updated: ${parseMsg}. ` +
        `Back up the file and run 'claude' to reinitialize it.`,
    );
  }

  if (account) {
    data.oauthAccount = account;
  } else {
    delete data.oauthAccount;
  }

  const tmpPath = `${configPath}.tmp`;
  try {
    await Bun.write(tmpPath, JSON.stringify(data, null, 2));
    const { renameSync } = await import('node:fs');
    renameSync(tmpPath, configPath);
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
