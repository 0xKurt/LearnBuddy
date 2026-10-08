// A question answered by tapping a place in its figure (issue #248, `ItemDraft.tap`), checked
// before it is stored. Rule 0: the key must lie on exactly one place of the figure's grid — the
// grid the app offers (`tapAxes`, @learnbuddy/shared-math `tap.ts`) — or nobody could tap it; and
// the figure must not already mark it, or the tap would only copy it. A question that fails is
// dropped, never repaired: moving the key onto the grid would be another question than the one
// whose words, hints and solution were written for it.
//
// And the other way round: a clock face WITHOUT hands is only a figure to set. On a question that
// is not answered by tapping it would be an empty face beside a question about a time — dropped.

import {
  FIGURE_NAMES,
  gridParse,
  gridText,
  gridVerdict,
  isGridMap,
  isMap,
  isTappable,
  namedPlaces,
  regionName,
  regionNamed,
  tapProblem,
  tapVerdict,
} from '@learnbuddy/shared-math';
import { Figure as FigureSchema, type Figure } from '@learnbuddy/shared-types/contracts';

import { kindIn, TAP_KINDS } from './itemFields.js';

type Tapped = { kind: string; answer: string; figure: Figure | null; tap?: boolean | null };

/** Why this question cannot be asked as it is, or null when it can. */
export function tapItemProblem(it: Tapped): string | null {
  const f = it.figure;
  if (it.tap !== true) {
    return f?.type === 'clock' && f.c.length === 0 ? 'a clock face to set, but no tap' : null;
  }
  if (!kindIn(TAP_KINDS, it.kind)) return `a ${it.kind} question is not answered by a tap`;
  if (f === null) return 'nothing to tap';
  return tapProblem(FIGURE_NAMES, f, it.kind, it.answer);
}

/**
 * The question with `tap` settled to a plain boolean, or null when it cannot be asked: a tap
 * question whose key lies on no place of its figure, a figure that already marks the key, a tap
 * on a figure that offers none.
 */
export function checkedTap<T extends Tapped>(it: T): (T & { tap: boolean }) | null {
  if (tapItemProblem(it) !== null) return null;
  return { ...it, tap: it.tap === true && it.figure !== null && isTappable(it.figure) };
}

/**
 * Her tap judged exactly (issue #248): 'correct' on the key's place, 'incorrect' on any other
 * place of the figure — a rule's verdict, never the tutor's. Null for a question not answered by
 * tapping, and for an answer that is no place of the figure: the other rules judge that.
 */
export function tapRuleVerdict(
  item: { answer: string; figure?: unknown; tap?: boolean },
  text: string,
): 'correct' | 'incorrect' | null {
  if (item.tap !== true) return null;
  const figure = FigureSchema.safeParse(item.figure);
  if (!figure.success || !isTappable(figure.data)) return null;
  return tapVerdict(FIGURE_NAMES, figure.data, item.answer, text);
}

/**
 * Her typed name of a place judged exactly (issues #251, #252): on a map or a labelled picture,
 * 'correct' for the place's name in any of the five languages or another name it goes by
 * ("Bavaria" and "Bayern", "Nukleus" and "Zellkern"), 'incorrect' for another place of the figure.
 * Null where the figure's places have no names, and for an answer that names none of them — the
 * other rules judge that (a typo goes on to them).
 */
export function namedRuleVerdict(
  item: { answer: string; figure?: unknown },
  text: string,
): 'correct' | 'incorrect' | null {
  const figure = FigureSchema.safeParse(item.figure);
  if (
    !figure.success ||
    !isTappable(figure.data) ||
    namedPlaces(FIGURE_NAMES, figure.data) === null
  )
    return null;
  return tapVerdict(FIGURE_NAMES, figure.data, item.answer, text);
}

/**
 * Her typed coordinates of a crossing of the Gradnetz judged exactly (#429): read in her language
 * (`gridVerdict` — "20° O" is west in French), 'correct' for the key's crossing, 'incorrect' for
 * another point. Null where the figure has no grid, where she wrote no coordinates, and where her
 * "O" read as the German Ost would be the key outside German — the other rules judge that.
 */
export function gridRuleVerdict(
  item: { answer: string; figure?: unknown },
  text: string,
  locale: string | null,
): 'correct' | 'incorrect' | null {
  const figure = FigureSchema.safeParse(item.figure);
  if (!figure.success || !isMap(figure.data) || !isGridMap(figure.data)) return null;
  return gridVerdict(item.answer, text, locale);
}

/**
 * Her tapped place as it stands in the thread: in her language ("Bavaria", "nucleus" for an
 * English learner; "50° N, 10° E", #429), where the app sent the German name. Null for anything
 * that is no tap on a figure of named places or a grid, or names none of them — then her text
 * stands as it came.
 */
export function tappedAnswerText(
  item: { figure?: unknown; tap?: boolean },
  text: string,
  locale: string,
): string | null {
  if (item.tap !== true) return null;
  const parsed = FigureSchema.safeParse(item.figure);
  const figure = parsed.success ? parsed.data : null;
  if (figure && isMap(figure) && isGridMap(figure)) {
    const p = gridParse(text, 'de');
    return p ? gridText(p, locale) : null;
  }
  const places = figure ? namedPlaces(FIGURE_NAMES, figure) : null;
  if (!places) return null;
  const i = regionNamed(places, text);
  return i === null ? null : regionName(places, i, locale);
}
