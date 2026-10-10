// Which way she answers this question — exactly one (CLAUDE.md rule 16: Buddy or code picks the
// form, she never chooses between two ways to say the same thing). Pure: the screen renders it.

import { isStructuredKind, type ItemView } from '@learnbuddy/shared-types/contracts';

import { isTappable } from '../../../../packages/shared-math/src/tap.js';

export function answerForm(item: ItemView, open: boolean) {
  const choices =
    item.kind === 'multiple_choice' && item.choices && item.choices.length > 0
      ? item.choices
      : null;
  // Vocabulary she is recognising: her own words to tap, instead of typing every one of
  // them on a phone (issue #147). Not a different question — tapping one sends it as the
  // answer and the same rules grade it — but it IS the whole way to answer here: four
  // cards and a field would not fit a 360×740 phone without scrolling (rule 16). Producing
  // the foreign word is still typed; the server only offers tapping where she is
  // recognising (practice/tapChoices.ts).
  const tapChoices =
    choices === null && item.tap_choices && item.tap_choices.length > 0 ? item.tap_choices : null;
  const speaking = item.kind === 'speak';
  // A structured item (issues #228–#232): ordering, matching, a table, a cloze. Its own surface
  // is the WHOLE way to answer — no answer field; the server takes only `parts` for it.
  const structured = isStructuredKind(item.kind);
  // Die leere Notenzeile, auf die sie schreibt (issue #226). Wie eine Anordnung ist sie der GANZE
  // Weg zu antworten: ein Antwortfeld gibt es daneben nicht, und das eine „Prüfen“ steht darunter.
  const staff = open && item.surface?.mode === 'notes' ? item.surface : null;
  // Das Feld, auf das sie einen gehörten Rhythmus klopft (issue #445): ihre Schläge sind die Antwort.
  const taps = open && item.surface?.mode === 'taps';
  // The fraction bar (issue #162) is the other case of the same surface, and since #402 a board
  // like the others (report #388 §9): the shaded bar is the answer, the bar's field her question.
  const surface = open ? item.surface : null;
  const barSurface = surface?.mode === 'shade' || surface?.mode === 'pick' ? surface : null;
  // A figure she taps a place in (issue #248): a board like the bar — the place is the answer, and
  // the figure stands there, at the bottom, instead of in the question card.
  const tapFigure = open && item.tap && item.figure && isTappable(item.figure) ? item.figure : null;
  // A program whose failing line she taps (issue #262): its lines are the board, so the program
  // stands there, at the bottom, instead of in the question card — once, not twice.
  const codeLines =
    open && item.surface?.mode === 'code_line' && item.figure?.type === 'code' ? item.figure : null;
  // A program, a query or an output she writes (issue #262): typed like any answer, in the one
  // input bar — in monospace, without math keys and without a mic.
  const code = open && item.surface?.mode === 'code_type' ? item.surface : null;
  const typed =
    open &&
    choices === null &&
    tapChoices === null &&
    !structured &&
    staff === null &&
    !taps &&
    barSurface === null &&
    tapFigure === null &&
    codeLines === null &&
    !speaking;
  /** The question's figure IS her board and stands in the answer, not in the card. */
  const figureInAnswer = tapFigure !== null || codeLines !== null;
  // A board stands under the card and needs the height, so a reading text above keeps its smaller
  // box: a structured item's while it is open — and the options of a closed multiple choice, which
  // stay read only above "Weiter" (#521). With the text's full box they ran 9–14 pt past a
  // 360×740 phone (#387).
  const board = open ? structured : choices !== null;
  return {
    choices,
    tapChoices,
    speaking,
    structured,
    staff,
    taps,
    barSurface,
    tapFigure,
    codeLines,
    code,
    typed,
    figureInAnswer,
    board,
  };
}

/** Which way she answers this question (`answerForm`). */
export type AnswerForm = ReturnType<typeof answerForm>;
