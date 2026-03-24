import type { Provider, ProviderConfig } from '../types';

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
