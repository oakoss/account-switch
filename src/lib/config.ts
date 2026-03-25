import { readFile } from 'node:fs/promises';

import type { OAuthAccount } from './types';

import { CLAUDE_JSON } from './constants';
import { isENOENT, writeJson } from './fs';

type ClaudeJson = { oauthAccount?: OAuthAccount; [key: string]: unknown };

export async function readOAuthAccount(
  path?: string,
): Promise<OAuthAccount | null> {
  const configPath = path ?? CLAUDE_JSON;
  let content: string;
  try {
    content = await readFile(configPath, 'utf8');
  } catch (error) {
    if (isENOENT(error)) return null;
    throw error;
  }
  try {
    const data = JSON.parse(content) as ClaudeJson;
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
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    if (isENOENT(error)) {
      throw new Error(
        `${configPath} not found. Run 'claude' first to initialize.`,
      );
    }
    throw error;
  }

  let data: ClaudeJson;
  try {
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

  await writeJson(configPath, data);
}
