// Configuration only: no network, credentials or model calls.
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { llmGateway } from '../production.js';

const base = {
  DATABASE_URL: 'postgres://postgres@127.0.0.1:54316/postgres',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
};
const azure = {
  ...base,
  LLM_BACKEND: 'azure',
  AZURE_OPENAI_PRICES: JSON.stringify({
    source: 'https://example.test/fictional-test-prices',
    readOn: '2026-10-23',
    models: {
      'gpt-5.4': { inputPerM: 2, outputPerM: 8 },
      'gpt-5.4-mini': { inputPerM: 0.5, outputPerM: 2 },
    },
  }),
  AZURE_OPENAI_ENDPOINT: 'https://lb-test.openai.azure.com',
  AZURE_OPENAI_KEY: 'not-a-real-key',
  AZURE_OPENAI_DEPLOYMENT: 'buddy',
  AZURE_OPENAI_DEPLOYMENT_FAST: 'small',
  AZURE_OPENAI_REGION: 'swedencentral',
  AZURE_OPENAI_DEPLOYMENT_TYPE: 'DataZoneStandard',
};

describe('Azure is an explicit, EU-only configuration', () => {
  it('selects the Azure gateway without Google credentials', () => {
    const config = loadConfig(azure);
    expect(llmGateway(config).profile.name).toBe('azure');
  });

  it('keeps Vertex the default and disabled independent of Azure', () => {
    expect(loadConfig({ ...base, GOOGLE_CLOUD_PROJECT: 'test' }).LLM_BACKEND).toBe('vertex');
    expect(llmGateway(loadConfig({ ...base, LLM_BACKEND: 'disabled' })).available).toBe(false);
  });

  it.each([
    ['AZURE_OPENAI_KEY', undefined],
    ['AZURE_OPENAI_PRICES', undefined],
    ['AZURE_OPENAI_PRICES', '{}'],
    ['AZURE_OPENAI_MODEL', 'gpt-unknown'],
    ['AZURE_OPENAI_API_VERSION', '2023-01-01'],
    ['AZURE_OPENAI_DEPLOYMENT_FAST', undefined],
    ['AZURE_OPENAI_ENDPOINT', 'http://lb-test.openai.azure.com'],
    ['AZURE_OPENAI_ENDPOINT', 'https://lb-test.openai.azure.com.evil.test'],
    ['AZURE_OPENAI_ENDPOINT', 'https://lb-test.openai.azure.com/path'],
    ['AZURE_OPENAI_REGION', 'eastus'],
    ['AZURE_OPENAI_REGION', undefined],
    ['AZURE_OPENAI_DEPLOYMENT_TYPE', 'GlobalStandard'],
    ['AZURE_OPENAI_DEPLOYMENT_TYPE', undefined],
  ])('rejects %s=%s before constructing a client', (key, value) => {
    expect(() => loadConfig({ ...azure, [key]: value })).toThrow(key);
  });
});
