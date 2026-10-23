// The dev client's Firebase file (#677): without an FCM client for its own package the dev
// build gets no push token, so the build config keeps google-services.json exactly when the
// file carries a client for "com.learnbuddy.app.dev", and leaves it out otherwise (the FCM
// Gradle plugin fails the build over a file without that client).

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExpoConfig } from 'expo/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import appJson from '../../app.json';

const firebase = (...packages: string[]) =>
  JSON.stringify({
    project_info: { project_id: 'test' },
    client: packages.map((p) => ({ client_info: { android_client_info: { package_name: p } } })),
  });

async function devConfig(file: string | null): Promise<ExpoConfig> {
  const projectRoot = mkdtempSync(join(tmpdir(), 'lb-appconfig-'));
  if (file !== null) writeFileSync(join(projectRoot, 'google-services.json'), file);
  vi.stubEnv('APP_VARIANT', 'development');
  vi.resetModules();
  const { default: build } = await import('../../app.config');
  return build({
    config: appJson.expo as ExpoConfig,
    projectRoot,
    staticConfigPath: null,
    packageJsonPath: null,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('dev build Firebase file', () => {
  it('keeps google-services.json once it carries the dev package', async () => {
    const config = await devConfig(firebase('com.learnbuddy.app', 'com.learnbuddy.app.dev'));
    expect(config.android?.package).toBe('com.learnbuddy.app.dev');
    expect(config.android?.googleServicesFile).toBe('./google-services.json');
  });

  it('leaves it out while only the store app is in it, or it is missing', async () => {
    expect((await devConfig(firebase('com.learnbuddy.app'))).android?.googleServicesFile).toBe(
      undefined,
    );
    expect((await devConfig(null)).android?.googleServicesFile).toBe(undefined);
  });
});

it.each(['preview', 'production'])(
  'preserves the Vosk plugin in the %s native APK config',
  async (variant) => {
    vi.stubEnv('APP_VARIANT', variant);
    vi.resetModules();
    const { default: build } = await import('../../app.config');
    const config = build({
      config: appJson.expo as ExpoConfig,
      projectRoot: '.',
      staticConfigPath: null,
      packageJsonPath: null,
    });
    expect(config.plugins).toContainEqual(['react-native-vosk', { models: [] }]);
  },
);
