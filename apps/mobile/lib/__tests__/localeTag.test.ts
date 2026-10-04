// English was hardwired to en-GB (audit 30.09., #133): a learner in the US read
// day-first dates and a 24-hour clock in an app that otherwise spoke her language.
// The phone's region now decides, but only when the phone speaks the app's language.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { localeTag } from '../time.js';

describe('the formatting locale of an app language', () => {
  it("takes the phone's region when the phone speaks that language", () => {
    expect(localeTag('en', 'en-US')).toBe('en-US');
    expect(localeTag('de', 'de-AT')).toBe('de-AT');
    expect(localeTag('fr', 'fr-CA-u-ca-gregory')).toBe('fr-CA');
    expect(localeTag('es', 'es-419')).toBe('es-419');
  });

  it('keeps the default where the phone says nothing about that language', () => {
    expect(localeTag('en', 'de-DE')).toBe('en-GB');
    expect(localeTag('en', 'en')).toBe('en-GB');
    expect(localeTag('it', '')).toBe('it-IT');
  });

  it('formats an unsupported language as German, the app fallback', () => {
    expect(localeTag('ru', 'ru-RU')).toBe('de-DE');
  });
});

describe('dates on a phone set to US English', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /** A fresh copy of lib/time.ts on a phone whose own locale is `locale`. */
  async function onPhone(locale: string) {
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
      this: Intl.DateTimeFormat,
    ) {
      return { ...real.call(this), locale };
    });
    vi.resetModules();
    return import('../time.js');
  }

  it('reads month first in English, and German stays German', async () => {
    const time = await onPhone('en-US');
    expect(time.formatDay('2026-10-02', 'en')).toBe('Friday, October 2');
    expect(time.formatDay('2026-10-02', 'de')).toBe('Freitag, 2. Oktober');
  });

  it('keeps the British default when the phone is German', async () => {
    const time = await onPhone('de-DE');
    expect(time.formatDay('2026-10-02', 'en')).toBe('Friday 2 October');
  });
});
