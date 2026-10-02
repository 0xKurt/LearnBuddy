// Server-side texts (push notifications, deterministic messages) live in
// language files next to this module; code never contains user-facing copy.

import de from './de.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import it from './it.json' with { type: 'json' };

export type Locale = 'de' | 'en' | 'fr' | 'es' | 'it';

type Messages = typeof de;
export const MESSAGES: Record<Locale, Messages> = { de, en, fr, es, it };

type Leaf<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends readonly string[]
      ? never
      : Leaf<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaf<Messages>;

/** The voice picker's sample sentence in every language (shared-cache guard). */
export function sampleTexts(): string[] {
  return (Object.values(MESSAGES) as Messages[]).map((m) => m.voice.sample);
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node)
      node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export function t(
  locale: string,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  const messages = MESSAGES[(locale as Locale) in MESSAGES ? (locale as Locale) : 'de'];
  // A count of one has its own sentence where a language needs it ("Eine Aufgabe liegt
  // bereit", not "1 Aufgaben" — p2-server-texts-no-grammar-or-plural).
  const one =
    vars.count === 1
      ? (lookup(messages, `${key}_one`) ?? lookup(MESSAGES.de, `${key}_one`))
      : undefined;
  const template = one ?? lookup(messages, key) ?? lookup(MESSAGES.de, key) ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
}

/**
 * A word of the figure library (`library.*`: an element, a part of a drawing, a colour) in her
 * language, or null when the library has none. Keys are built from ids (`elements.na`), which
 * `t` cannot type; every id has its word in all five files (`library.test.ts`).
 */
export function libraryTerm(locale: string, key: string): string | null {
  const messages = MESSAGES[(locale as Locale) in MESSAGES ? (locale as Locale) : 'de'];
  return lookup(messages, `library.${key}`) ?? null;
}

/** "Freitag" / "Morgen" / "Heute" for a learner-local date relative to today. */
export function dayLabel(locale: string, weekday: number, daysFromToday: number): string {
  const messages = MESSAGES[(locale as Locale) in MESSAGES ? (locale as Locale) : 'de'];
  if (daysFromToday === 0) return messages.relative.today;
  if (daysFromToday === 1) return messages.relative.tomorrow;
  const name = messages.weekday[weekday - 1] ?? '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}
