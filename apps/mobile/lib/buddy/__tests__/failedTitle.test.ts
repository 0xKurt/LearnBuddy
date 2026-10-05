import { MaterialFailure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import de from '../../../locales/de/buddy.json';
import en from '../../../locales/en/buddy.json';
import es from '../../../locales/es/buddy.json';
import fr from '../../../locales/fr/buddy.json';
import itLocale from '../../../locales/it/buddy.json';
import { failedTitleKey } from '../failedTitle.js';

const LOCALES = { de, en, es, fr, it: itLocale };
type Locale = keyof typeof LOCALES;

function text(locale: Locale, key: string): string {
  const [ns, leaf] = key.split('.');
  const group: unknown = ns ? (LOCALES[locale] as Record<string, unknown>)[ns] : undefined;
  const value = leaf && group ? (group as Record<string, unknown>)[leaf] : undefined;
  if (typeof value !== 'string') throw new Error(`${locale}: missing buddy:${key}`);
  return value;
}

describe('failed card title (issue #411)', () => {
  it('never says "konnte ich nicht lesen" for a sheet that was read', () => {
    for (const reason of ['form_not_practicable', 'nothing_marked']) {
      for (const title of [null, 'Mathearbeit']) {
        expect(text('de', failedTitleKey({ reason, title }))).not.toMatch(/nicht lesen/);
      }
    }
  });

  it('still says so where the sheet was not read', () => {
    for (const reason of ['unreadable', 'model_error', 'blocked', null]) {
      expect(text('de', failedTitleKey({ reason, title: null }))).toMatch(/nicht lesen/);
    }
  });

  it('has a title in every language, with the name where there is one', () => {
    for (const locale of Object.keys(LOCALES) as Locale[]) {
      for (const reason of [...MaterialFailure.options, null, 'not_a_reason']) {
        expect(text(locale, failedTitleKey({ reason, title: null }))).not.toContain('{{');
        expect(text(locale, failedTitleKey({ reason, title: 'X' }))).toContain('{{title}}');
      }
    }
  });
});
