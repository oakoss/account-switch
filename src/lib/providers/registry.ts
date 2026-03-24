import type { Provider, ProviderConfig, ProviderResolver } from '@lib/types';

import { createClaudeProvider } from './claude';

type ProviderFactory = (config: ProviderConfig) => Provider;

const factories = new Map<string, ProviderFactory>([
  ['claude', createClaudeProvider],
]);

export function createProvider(name: string, config: ProviderConfig): Provider {
  const factory = factories.get(name);
  if (!factory) {
    const available = [...factories.keys()].join(', ');
    throw new Error(`Unknown provider: "${name}". Available: ${available}`);
  }
  return factory(config);
}

export function createDefaultProvider(config: ProviderConfig): Provider {
  return createProvider('claude', config);
}

export function createResolver(config: ProviderConfig): ProviderResolver {
  const cache = new Map<string, Provider>();
  return (name: string) => {
    let provider = cache.get(name);
    if (!provider) {
      provider = createProvider(name, config);
      cache.set(name, provider);
    }
    return provider;
  };
}
