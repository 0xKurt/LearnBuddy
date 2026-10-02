// The words of the figure library (issues #250, #252, #261): an element's name, a part's names,
// a colour's name — in her language, from `library.*` in the language files. Its own module so
// the tap check (`figureTap.ts`) and the question builder (`library.ts`) share it.

import {
  elementId,
  type ElementFacts,
  type SchematicId,
  type WheelId,
} from '@learnbuddy/shared-types/contracts';

import { libraryTerm } from '../../i18n/index.js';

export function elementName(locale: string, e: ElementFacts): string | null {
  return libraryTerm(locale, `elements.${elementId(e)}`);
}

/** A part's names: the first is the name, the others are accepted too ("Zellkern", "Nukleus"). */
export function partNames(locale: string, drawing: SchematicId, part: string): string[] {
  const raw = libraryTerm(locale, `parts.${drawing}.${part}`);
  return raw
    ? raw
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

/** The part with its article, as "Tippe auf …" needs it ("den Zellkern"). */
export function partObject(locale: string, drawing: SchematicId, part: string): string | null {
  return libraryTerm(locale, `parts_tap.${drawing}.${part}`);
}

export function colorName(locale: string, id: WheelId): string | null {
  return libraryTerm(locale, `colors.${id}`);
}
