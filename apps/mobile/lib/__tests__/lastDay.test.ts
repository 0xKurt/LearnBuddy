// A date that ends a sentence (#599): "Gerade ist Pause – bis einschließlich Do., 15. Okt.." —
// the template closes with its own full stop, and the short month already ended in one.

import { describe, expect, it } from 'vitest';

import de from '../../locales/de/settings.json';
import en from '../../locales/en/settings.json';
import es from '../../locales/es/settings.json';
import fr from '../../locales/fr/settings.json';
import it_ from '../../locales/it/settings.json';
import { formatLastDay } from '../time.js';

/** The pause ends at midnight after Thursday, 15 October 2026. */
const END = '2026-10-15T22:00:00Z';
const LOCALES = { de, en, fr, es, it: it_ } as const;

describe('a last day at the end of a sentence', () => {
  it('stands with one full stop in every language', () => {
    for (const [lang, t] of Object.entries(LOCALES))
      for (const template of [
        t.contact.answer_paused,
        t.contact.pause_until,
        t.contact.paused_toast,
      ]) {
        const said = template.replace('{{date}}', formatLastDay(END, lang, 'sentenceEnd'));
        expect(said, lang).not.toMatch(/\.\.$/);
      }
  });

  it('keeps the short month inside a sentence', () => {
    expect(formatLastDay(END, 'de')).toMatch(/Okt\.$/);
    expect(formatLastDay(END, 'de', 'sentenceEnd')).toMatch(/Oktober$/);
  });
});
