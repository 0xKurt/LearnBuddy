// Answering one question, step 6 of `answerItem` (answer.ts, #311): the reply she gets, whoever
// judged — a writing task's elements instead of one verdict, never the solution before the second
// hint, always the solution after the third miss, a test's neutral line, and the division step
// the reply names. Code alone. docs/architecture.md §Practice.

import { t } from '../../i18n/index.js';
import type { AnswerCase, Judged } from './answerJudge.js';
import type { TutorJudgement } from './answerTutor.js';
import { asTestTurn, ladderDone, REVEAL_AFTER_MISSES, workedReply } from './ladder.js';
import { givesHints } from './modeRules.js';
import { checkRubric, newlyExplained, rubricReply, rubricVerdict } from './rubric.js';
import { shownSolution } from './service.js';
import { secretsOf } from './structured.js';
import { mentionsSolution } from './tutor.js';

export function finishReply(
  c: AnswerCase,
  { judged: decided, claims, safeguarded }: TutorJudgement,
): {
  judged: Judged;
  /** The key points this answer newly covered, stored with it (`recordExplained`). */
  explained: string[];
  columnStep: number | null;
} {
  const { learner, session, item, question, hintRequest, essay, text } = c;
  const { structured, partsCheck, rubric, explaining, sofar, nextHint } = c;
  let judged = decided;
  let explained: string[] = [];
  // ─────────────── Schreibaufgabe: Rückmeldung je Element statt eines Urteils (issue #211) ──
  //
  // Hier wird das Gesamturteil ersetzt, nicht ergänzt. Der Grund steht im Issue: für eine
  // Inhaltsangabe, einen Bericht, eine Erörterung gibt es keine Musterlösung, gegen die ein
  // Gesamturteil zu rechtfertigen wäre — bewertet wird, ob die geforderten Elemente da sind.
  // Also entscheidet die Rubrik:
  //
  //   * das URTEIL kommt aus den Elementen (`rubricVerdict`), nicht aus dem Eindruck des
  //     Modells. Hält etwas und nicht alles, bleibt die Frage offen — und bekommt damit, wie
  //     bisher, keine FSRS-Note (`rateable` in answerApply.ts); ein Bruchteil wird nirgends
  //     erfunden.
  //   * der SATZ kommt aus der Rubrik und den Texten der App, nicht aus der Prosa des Modells:
  //     die Elemente mit ihrem Stand, darunter EIN nächster Schritt. Ohne Zahl, ohne Note.
  //   * `revealed` bleibt false. Eine Schreibaufgabe hat nichts aufzudecken — das ist der Befund
  //     von #197, und ein Modell, das es anders sieht, ändert daran nichts.
  //
  // Nur für eine echte Antwort: eine Tipp-Bitte und alles, was keine Antwort war, bleiben
  // unberührt (dort hat sie nichts geschrieben, das gegen die Elemente zu halten wäre).
  if (rubric && judged.verdict !== null && judged.verdict !== 'not_an_attempt') {
    const outcome = checkRubric(rubric, [...sofar.before, text].join('\n'), claims, sofar.settled);
    explained = newlyExplained(outcome, sofar.settled);
    // Her last try at an explanation ends with a closing line instead of a follow-up (#236).
    const last = item.attempts + 1 >= REVEAL_AFTER_MISSES;
    judged = {
      ...judged,
      verdict: rubricVerdict(outcome),
      reply: rubricReply(learner.locale, outcome, judged.reply, last),
      revealed: false,
    };
  }

  if (givesHints(session.mode) && !safeguarded) {
    // Never the solution before the second hint — whatever the model wrote. The prepared
    // hint (or a neutral line) takes its place, without a second model call.
    // A cloze reply quotes HER words and is code's, even where the model judged a gap
    // (issue #232); only a reply the tutor wrote can give a key away — any gap's key.
    const leaks = (reply: string) =>
      structured
        ? secretsOf(structured, item.prompt).secrets.some((s) =>
            mentionsSolution(reply, s, secretsOf(structured, item.prompt).visible),
          )
        : mentionsSolution(reply, shownSolution(item), item.prompt);
    if (
      judged.evaluatedBy === 'model' &&
      !essay &&
      !partsCheck &&
      judged.verdict !== 'correct' &&
      // A question never reveals (#391): the solution comes by the ladder, "Tipp" and a try.
      (question || item.hints_used < 2) &&
      (judged.revealed || leaks(judged.reply))
    ) {
      judged = {
        ...judged,
        reply:
          nextHint ?? t(learner.locale, hintRequest ? 'practice.help_step' : 'practice.try_again'),
        gaveHint: nextHint !== null || (hintRequest && !question),
        usedPrepared: nextHint !== null,
        revealed: false,
        offersLater: false,
      };
    }
    // Never withheld forever: after the third wrong try, or when she asks again at the end of
    // the hint ladder, the solution is explained and the question comes back soon (FSRS).
    const attempted = judged.verdict !== null && judged.verdict !== 'not_an_attempt';
    const misses = item.attempts + (attempted ? 1 : 0);
    const askedAfterLastHint = !question && judged.verdict === 'not_an_attempt' && ladderDone(item);
    if (
      !judged.revealed &&
      !essay &&
      judged.verdict !== 'correct' &&
      judged.verdict !== null &&
      // Her own step in a guided example asks for nothing (#298), however far the ladder is.
      judged.ownStep === undefined &&
      (misses >= REVEAL_AFTER_MISSES || askedAfterLastHint)
    ) {
      judged = {
        ...judged,
        // An explanation shows no model answer (#236): its points and the closing line stand.
        reply: explaining ? judged.reply : workedReply(learner.locale, item),
        gaveHint: false,
        usedPrepared: false,
        revealed: true,
      };
    }
  }

  if (session.mode === 'test' && !safeguarded) judged = asTestTurn(judged, learner.locale, item);

  // The step the reply names opens in the app (#420) — not in a test, which names no place, and
  // not once the solution is shown.
  const columnStep =
    session.mode === 'test' || judged.revealed ? null : (judged.columnStep ?? null);
  return { judged, explained, columnStep };
}
