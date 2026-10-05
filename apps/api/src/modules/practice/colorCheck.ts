// A question about Itten's colour wheel (issue #261). Its key is COMPUTED from the wheel's places
// — the complement is the field opposite, a mixture the field between two others, a field's class
// is where it stands — and the model's key must agree with it, or the question is not asked
// (Regel 0, "reject, never repair"; docs/architecture.md §Practice, Circuits).
//
//   · "Primär-, Sekundär- oder Tertiärfarbe?" is multiple choice whose three options code WRITES,
//     in the question's language;
//   · a complement or a mixture is a colour: typed — the key must be that field's name in the
//     question's language (the name the wheel itself shows), and no accepted answer may name
//     another field — or one of the marked fields, whose names code writes as the options in
//     the order they are marked;
//   · a number asked next to a wheel is dropped: nothing on it is counted.
//
// The names come from the same i18n keys as the wheel's own labels in the app
// (`apps/mobile/locales/<lang>/math.json`, held equal by `ColorWheel.test.tsx`): the word she
// reads on the field is the word code grades.

import {
  colorWheelKey,
  colorWheelProblem,
  HUE_CLASSES,
  isColorWheel,
  ITTEN_HUES,
  normalizeShortAnswer,
  type Hue,
} from '@learnbuddy/shared-math';

import { t, type Locale } from '../../i18n/index.js';
import { asLocale } from './chartRead.js';
import type { ItemDraft } from './items.js';
import { fixedChoice } from './treeCheck.js';

/** A field's name in `lang`, as the wheel writes it. */
const hueName = (lang: Locale, h: Hue) => t(lang, `practice.color.${h}`);

/** The same name, written with other case, spaces or a hyphen ("Blau-Violett", "blauviolett"). */
const sameName = (a: string, b: string) =>
  normalizeShortAnswer(a).replace(/ /g, '') === normalizeShortAnswer(b).replace(/ /g, '');

/**
 * The item with its colour-wheel question checked, the item unchanged when it asks nothing code
 * could compute, or null when it is not asked at all.
 */
export function checkedColor<T extends ItemDraft>(it: T, locale: string | null): T | null {
  const f = it.figure;
  if (f === null || !isColorWheel(f)) return it;
  if (colorWheelProblem(f) !== null || it.kind === 'numeric') return null;
  const key = colorWheelKey(f);
  if (key === null) return it;
  const lang = asLocale(it.prompt_lang) ?? asLocale(locale);
  if (lang === null) return null;
  if (key.kind === 'class') {
    const choices = HUE_CLASSES.map((c) => t(lang, `practice.color.${c}`));
    return fixedChoice(it, choices, key.index);
  }
  if (it.kind === 'multiple_choice') {
    const at = f.hl.indexOf(key.hue);
    if (f.hl.length < 2 || at < 0) return null;
    return fixedChoice(
      it,
      f.hl.map((h) => hueName(lang, h)),
      at,
    );
  }
  if (it.kind !== 'short') return null;
  const right = hueName(lang, key.hue);
  const others = ITTEN_HUES.filter((h) => h !== key.hue).map((h) => hueName(lang, h));
  if (!sameName(it.answer, right)) return null;
  if (it.accepted_answers.some((a) => others.some((o) => sameName(a, o)))) return null;
  return { ...it, answer: right };
}
