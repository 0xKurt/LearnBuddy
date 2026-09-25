import { describe, expect, it } from 'vitest';

import {
  chooseEngine,
  fallsBackToServer,
  hearResult,
  heardText,
  installedMatch,
  NOTHING_HEARD,
  type EngineFacts,
} from '../engine.js';

const ios: EngineFacts = {
  platform: 'ios',
  available: true,
  onDeviceSupported: true,
  installedLocales: null,
  locale: 'de-DE',
  failedBefore: false,
};

describe('chooseEngine', () => {
  it('uses the device on iOS when it can recognise offline', () => {
    expect(chooseEngine(ios)).toBe('device');
  });

  it('never uses the system recogniser in the browser', () => {
    expect(chooseEngine({ ...ios, platform: 'web' })).toBe('server');
  });

  it('falls back to our EU path when the device would need its servers', () => {
    expect(chooseEngine({ ...ios, onDeviceSupported: false })).toBe('server');
    expect(chooseEngine({ ...ios, available: false })).toBe('server');
  });

  it('does not try a locale again that already failed on the device', () => {
    expect(chooseEngine({ ...ios, failedBefore: true })).toBe('server');
  });

  it('needs the offline model on Android', () => {
    const android: EngineFacts = { ...ios, platform: 'android', locale: 'fr-FR' };
    expect(chooseEngine({ ...android, installedLocales: ['de-DE'] })).toBe('server');
    expect(chooseEngine({ ...android, installedLocales: ['fr-CA'] })).toBe('device');
    expect(chooseEngine({ ...android, installedLocales: null })).toBe('server');
    expect(chooseEngine({ ...android, installedLocales: [] })).toBe('server');
  });
});

describe('installedMatch', () => {
  it('prefers the exact locale, then the same language', () => {
    expect(installedMatch(['fr-CA', 'fr-FR'], 'fr_FR')).toBe('fr-FR');
    expect(installedMatch(['fr-CA'], 'fr-FR')).toBe('fr-CA');
    expect(installedMatch(['en-US'], 'fr-FR')).toBeNull();
  });
});

describe('fallsBackToServer', () => {
  it('continues with a recording when the device cannot do it', () => {
    expect(fallsBackToServer('language-not-supported')).toBe(true);
    expect(fallsBackToServer('network')).toBe(true);
  });

  it('shows her the rest', () => {
    expect(fallsBackToServer('no-speech')).toBe(false);
    expect(fallsBackToServer('not-allowed')).toBe(false);
    expect(fallsBackToServer('aborted')).toBe(false);
  });
});

describe('hearResult', () => {
  it('shows the running part and keeps finished parts', () => {
    let h = hearResult(NOTHING_HEARD, 'ich hab', false);
    expect(heardText(h)).toBe('ich hab');
    h = hearResult(h, 'ich hab eine Frage', true);
    expect(h).toEqual({ committed: 'ich hab eine Frage', interim: '' });
    h = hearResult(h, 'zu Brüchen', false);
    expect(heardText(h)).toBe('ich hab eine Frage zu Brüchen');
    h = hearResult(h, 'zu Brüchen', true);
    expect(heardText(h)).toBe('ich hab eine Frage zu Brüchen');
  });

  it('does not double text when a final result repeats everything', () => {
    const h = hearResult({ committed: 'eins', interim: '' }, 'eins zwei', true);
    expect(heardText(h)).toBe('eins zwei');
  });
});
