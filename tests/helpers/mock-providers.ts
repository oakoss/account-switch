import type { Provider, ProviderResolver, ProviderSnapshot } from '@lib/types';

export function createMockProvider(
  initial: ProviderSnapshot | null = null,
): Provider & {
  current: ProviderSnapshot | null;
  restoreCalls: ProviderSnapshot[];
  clearCalled: boolean;
} {
  const mock = {
    name: 'mock',
    current: initial,
    restoreCalls: [] as ProviderSnapshot[],
    clearCalled: false,

    async snapshot() {
      return mock.current;
    },
    async restore(snap: ProviderSnapshot) {
      mock.restoreCalls.push(snap);
      mock.current = snap;
    },
    async clear() {
      mock.clearCalled = true;
      mock.current = null;
    },
    displayInfo(snap: ProviderSnapshot) {
      const identity = snap.identity as { email?: string; org?: string } | null;
      const creds = snap.credentials as { tier?: string } | null;
      return {
        label: identity?.email ?? null,
        context: identity?.org ?? null,
        tier: creds?.tier ?? null,
      };
    },
  };
  return mock;
}

export function createFailingProvider(
  initial: ProviderSnapshot | null,
  failOnRestore = false,
  failOnRollback = false,
): Provider & { restoreCalls: ProviderSnapshot[] } {
  let callCount = 0;
  const mock = {
    name: 'failing-mock',
    restoreCalls: [] as ProviderSnapshot[],

    async snapshot() {
      return initial;
    },
    async restore(snap: ProviderSnapshot) {
      callCount++;
      mock.restoreCalls.push(snap);
      if (failOnRestore && callCount === 1) {
        throw new Error('restore failed: disk full');
      }
      if (failOnRollback && callCount === 2) {
        throw new Error('rollback failed: permission denied');
      }
    },
    async clear() {},
    displayInfo() {
      return { label: null, context: null, tier: null };
    },
  };
  return mock;
}

export function mockResolver(provider: Provider): ProviderResolver {
  return () => provider;
}
