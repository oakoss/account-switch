import { join } from 'node:path';

import { PROFILE_NAME_REGEX } from './constants';

export function profilePaths(profilesDir: string, name: string) {
  if (!PROFILE_NAME_REGEX.test(name)) {
    throw new Error(`Invalid profile name: "${name}"`);
  }
  const dir = join(profilesDir, name);
  return {
    dir,
    credentials: join(dir, 'credentials.json'),
    account: join(dir, 'account.json'),
    meta: join(dir, 'profile.json'),
  };
}
