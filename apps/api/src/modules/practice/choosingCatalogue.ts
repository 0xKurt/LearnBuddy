// What the choosing call before a practice run reads (KI-Audit F5-3, #669): a catalogue of what
// the run's schema offers, not the generator's whole prompt (`generate.ts` `generateSystem`).

import { BAR_RULES } from './bars.js';
import { CODE_RULES } from './code.js';
import { FIGURE_INTRO } from './items.js';
import { STRUCTURED_RULE_OF } from './setProfiles.js';
import { STAFF_RULES } from './staff.js';
import { PART_TASK_RULES } from './taskParts.js';

/** A rule's first sentence: its name and when it applies, for the choosing call's catalogue. */
function firstSentence(rule: string): string {
  const first = rule.split(/(?<=\.)\s/)[0]!;
  return first.length <= 240 ? first : `${first.slice(0, first.lastIndexOf(' ', 240))} …`;
}

const BLOCK_RULE: Readonly<Record<string, string>> = {
  bars: BAR_RULES,
  staffs: STAFF_RULES,
  codes: CODE_RULES,
  part_tasks: PART_TASK_RULES,
};

/**
 * What the choosing call reads before a run (#669): what this run's schema offers, one line per
 * form from the same rules the run is told, and the figure types by name — not the whole prompt,
 * which teaches how to WRITE each form. No sample question.
 */
export function choosingCatalogue(
  offer: { forms: string[]; figures: string[] },
  context?: { intro: string; rules: Readonly<Record<string, string>> },
): string {
  const rule = (f: string) =>
    context?.rules[f] ?? (STRUCTURED_RULE_OF as Record<string, string>)[f] ?? BLOCK_RULE[f];
  const forms = offer.forms.flatMap((f) => {
    const r = rule(f);
    return r ? [`- ${firstSentence(r)}`] : [];
  });
  return [
    context?.intro ??
      'You prepare learning in the LearnBuddy app for the learner in LEARNER: the TASK and her text in the message say what this run is.',
    forms.length > 0 ? `Task forms beyond plain questions:\n${forms.join('\n')}` : '',
    offer.figures.length > 0
      ? `${firstSentence(FIGURE_INTRO)}\nFigure types: ${offer.figures.join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
