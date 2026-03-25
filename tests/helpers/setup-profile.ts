import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const mockCreds = { token: 'abc' };
export const mockIdentity = { email: 'test@example.com' };
export const mockSnap = { credentials: mockCreds, identity: mockIdentity };

export async function setupProfile(
  profilesDir: string,
  name: string,
  creds: unknown,
  identity: unknown,
): Promise<void> {
  const dir = join(profilesDir, name);
  await mkdir(dir, { recursive: true });
  const credPath = join(dir, 'credentials.json');
  await Bun.write(credPath, JSON.stringify(creds));
  await chmod(credPath, 0o600);
  if (identity) {
    await Bun.write(join(dir, 'account.json'), JSON.stringify(identity));
  }
  await Bun.write(
    join(dir, 'profile.json'),
    JSON.stringify({
      name,
      type: 'oauth',
      provider: 'mock',
      createdAt: '2026-01-01',
      lastUsed: null,
    }),
  );
}
