import { describe, expect, it } from 'vitest';

import { MESSAGES, dayLabel, t } from '../index.js';

function keys(node: unknown, prefix = ''): string[] {
  if (Array.isArray(node)) return [`${prefix}[${node.length}]`];
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe('server texts', () => {
  it('has exactly the same keys in every language', () => {
    const reference = keys(MESSAGES.de).sort();
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      expect(keys(messages).sort(), locale).toEqual(reference);
    }
  });

  it('uses the same placeholders in every language', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === 'string' && typeof b === 'string') {
        expect(placeholders(b), path).toEqual(placeholders(a));
      } else if (a && typeof a === 'object' && !Array.isArray(a)) {
        for (const k of Object.keys(a))
          walk(
            (a as Record<string, unknown>)[k],
            (b as Record<string, unknown>)[k],
            `${path}.${k}`,
          );
      }
    };
    for (const [locale, messages] of Object.entries(MESSAGES)) walk(MESSAGES.de, messages, locale);
  });

  it('interpolates and falls back to German for unknown locales', () => {
    expect(t('en', 'material.ready', { title: 'Fractions', count: 12 })).toBe(
      'Your questions for “Fractions” are ready (12).',
    );
    expect(t('xx', 'practice.correct')).toBe('Stimmt – gut gemacht!');
    expect(dayLabel('de', 5, 3)).toBe('Freitag');
    expect(dayLabel('fr', 5, 3)).toBe('Vendredi');
    expect(dayLabel('en', 5, 1)).toBe('Tomorrow');
  });
});
