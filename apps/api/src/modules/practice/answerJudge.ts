// Answering one question, step 4 of `answerItem` (answer.ts, #311): the judgement code gives on
// its own — right, a near miss, a structured answer that stops being right at one place, a
// Diktat's place, the third miss, the first miss — at once and without a model. Only what is
// left goes to the tutor (`answerTutor.ts`). docs/architecture.md §Practice.

import type { AnswerResponse, EssayFeedback } from '@learnbuddy/shared-types/contracts';

import { t } from '../../i18n/index.js';
import type { Answering } from './answerLoad.js';
import type { Ruled } from './answerRules.js';
import type { Stepped } from './answerSteps.js';
import { codePassed, codeReply } from './codeCheck.js';
import { columnStepOf } from './columnCalc.js';
import { nearlyRight, dictationReply } from './dictation.js';
import { NEAR_MISS, plainMath, typoShapeFor } from './evaluate.js';
import { REVEAL_AFTER_MISSES, workedReply } from './ladder.js';
import { givesHints } from './modeRules.js';
import {
  articleMissing,
  equationReply,
  locatedOrNotHelp,
  NEAR_MISS_REPLY,
  pathReply,
  TYPO_REPLY,
} from './nearMiss.js';
import { ladderEndReply } from './pointSteps.js';
import { staffAgain, staffAnswerReply, staffSurfaceOf } from './staff.js';
import {
  structuredDecidedBy,
  structuredNamesPart,
  structuredReply,
  structuredVerdict,
} from './structured.js';
import { guidedTurn } from './workedSteps.js';

/** Everything known about the answer before anything is judged. */
export type AnswerCase = Answering & Ruled & Stepped;

export type Judged = {
  verdict: AnswerResponse['verdict'];
  evaluatedBy: 'rule' | 'model' | null;
  reply: string;
  gaveHint: boolean;
  /** The hint shown is the next prepared one (prepared_hints_used moves on). */
  usedPrepared?: boolean;
  revealed: boolean;
  /** The feedback on a version of her long text, stored with the tutor turn (#258). */
  essay?: EssayFeedback | null;
  /** Her question had nothing to do with the task: the reply offers "für nachher" (#391). */
  offersLater?: boolean;
  /** The division step the reply names, for the app to open (#420). */
  columnStep?: number | null;
  /** Her own step in a guided example (#298): where „Tipp" goes on from. Never help asked for. */
  ownStep?: number;
};

/**
 * The judgement by code alone, or null when the tutor decides. A version of her long text is
 * neither: `judgeEssay` (essay.ts) answers it before this is asked.
 *
 * A question in a practice test (#391) goes to the tutor like a test answer: its one call is the
 * distress check (#389). Its words are never shown — `asTestTurn` puts the test's fixed line in
 * their place, unless `concern` brought the fixed help answer.
 */
export function judgeByRules(c: AnswerCase): Judged | null {
  const { learner, session, item, question, hintRequest, text } = c;
  const { partsCheck, staffTask, staffCheck, codeTask, codeCheck, dictationCheck } = c;
  const { followed, rule, guided, onlyOneLeft, atLadderEnd, pointsLadder } = c;
  if (hintRequest && !question && givesHints(session.mode) && atLadderEnd) {
    // Asked again at the end of the ladder: the solution explained (an explanation's last point,
    // #298), at once, no model.
    return {
      verdict: 'not_an_attempt',
      evaluatedBy: 'rule',
      reply: ladderEndReply(learner.locale, item, pointsLadder),
      gaveHint: false,
      revealed: true,
    };
  } else if (rule === 'correct' || guided?.kind === 'solved') {
    // Right — or, in a guided example (#298), the way's last line with the key's value.
    const praise = t(
      learner.locale,
      session.mode === 'help' ? 'practice.help_solved' : 'practice.correct',
    );
    // Her own function passed every test: the count says what "right" consisted of (#262).
    const passed = codeCheck && codeTask ? codePassed(learner.locale, codeCheck, codeTask) : null;
    return {
      verdict: 'correct',
      // A cloze gap the model judged (issue #232) makes it the model's verdict, honestly.
      evaluatedBy: partsCheck ? structuredDecidedBy(partsCheck) : 'rule',
      reply: followed
        ? t(learner.locale, 'practice.parts.follow_on', { part: `${followed})` })
        : passed
          ? `${passed} ${praise}`
          : praise,
      gaveHint: false,
      revealed: false,
    };
  } else if (guided !== null) {
    // Her step in a guided example, judged by code (#298); a third miss still ends the ladder below.
    return { ...guidedTurn(learner.locale, guided), evaluatedBy: 'rule', gaveHint: false };
  } else if (rule === 'parts_left' && staffCheck !== null) {
    // Eine Notenzeile, von der ein Stück hält (issue #226), oder Schläge, von denen die ersten
    // sitzen (issue #445) — dasselbe Urteil, eine Form weiter.
    // Die Frage bleibt offen, nichts wird zurückgesetzt, und sie bekommt EINE Stelle: wie viele
    // Zeichen von vorne stimmen, und ab dem zweiten Versuch auch, wo es aufhört („in Takt 2 ist
    // mehr, als in den Takt passt“). Das ist genau die Rückmeldung, die issue #226 verlangt.
    return {
      verdict: 'partially_correct',
      evaluatedBy: 'rule',
      reply: staffAnswerReply(learner.locale, staffCheck, item.attempts),
      gaveHint: false,
      revealed: false,
    };
  } else if (rule === 'parts_left' && codeCheck !== null) {
    // A program of which a part holds (issue #262): the first lines of her output, or some tests
    // of her function. The question stays open, and the reply comes from the real run ("2 von 4
    // Tests bestanden. summe(2, 3) soll 5 ergeben …").
    return {
      verdict: 'partially_correct',
      evaluatedBy: 'rule',
      reply: codeReply(learner.locale, codeCheck, item.attempts),
      gaveHint: false,
      revealed: false,
    };
  } else if (partsCheck && structuredVerdict(partsCheck) === null) {
    // A cloze gap nobody could judge (no model, issue #232) and nothing else wrong: no
    // verdict is claimed and no try is counted (CLAUDE.md rule 5).
    return {
      verdict: null,
      evaluatedBy: null,
      reply: t(learner.locale, 'practice.cannot_check'),
      gaveHint: false,
      revealed: false,
    };
  } else if (
    NEAR_MISS.has(rule) &&
    !articleMissing(rule, item) &&
    locatedOrNotHelp(rule, session)
  ) {
    // A near miss needs no model: a fixed, kind answer at once. A slip shows the
    // spelling and stays open, so she types it right herself (never in homework,
    // which never shows the solution — there the tutor judges).
    // The spelling only from the second try on, and then it counts as help given — like a
    // hint, because that is what it is (issue #207). `first_try_correct` is false after the
    // first attempt anyway, so a later right answer is already recorded as "with help"; the
    // hint count makes the record say WHY.
    const spellOut = rule === 'typo' && item.attempts > 0;
    return {
      verdict: 'partially_correct',
      evaluatedBy: 'rule',
      reply:
        rule === 'typo'
          ? spellOut
            ? t(learner.locale, 'practice.typo', { answer: plainMath(item.answer) })
            : t(learner.locale, TYPO_REPLY[typoShapeFor(item, text)])
          : // Code found the place: the broken step (issue #209) or the count that does not
            // add up (issue #212). Only then the fixed near-miss texts.
            (pathReply(learner.locale, text) ??
            equationReply(learner.locale, item, text) ??
            t(learner.locale, NEAR_MISS_REPLY[rule] ?? 'practice.accents')),
      gaveHint: spellOut,
      revealed: false,
    };
  } else if (session.mode === 'test' && rule === 'incorrect') {
    // A test only needs the judgement, and the rules already have it: no model
    // call (it would only write a hint the test replaces with a neutral word).
    return {
      verdict: 'incorrect',
      evaluatedBy: partsCheck ? structuredDecidedBy(partsCheck) : 'rule',
      reply: '',
      gaveHint: false,
      revealed: false,
    };
  } else if (
    givesHints(session.mode) &&
    rule === 'incorrect' &&
    (item.attempts + 1 >= REVEAL_AFTER_MISSES || onlyOneLeft)
  ) {
    // The third wrong try (or no real choice left), wrong for sure: the solution explained, at
    // once and without a model.
    return {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply: workedReply(learner.locale, item),
      gaveHint: false,
      revealed: true,
    };
  } else if (givesHints(session.mode) && rule === 'incorrect' && codeCheck !== null) {
    // A wrong answer to a program gets its line from code, at every try (issue #262). Not to save
    // a call but because of rule 5: the tutor cannot run the program, and a model writing about
    // the output of a program it did not run sounds sure and can be wrong. Code has the run and
    // names what it gave — the first test that fails, the line where the output departs, SQLite's
    // own message. The third miss explains the solution, as everywhere (the branch above).
    return {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply: codeReply(learner.locale, codeCheck, item.attempts),
      gaveHint: false,
      revealed: false,
    };
  } else if (
    givesHints(session.mode) &&
    rule === 'incorrect' &&
    staffTask !== null &&
    // Eine Aufgabe mit Fläche (Zeile, Schläge) nur, wenn wirklich etwas davon ankam: sonst hat
    // `ruleCheck` sie gegen den Schlüssel in Worten geprüft, und dafür ist der Satz der falsche.
    (staffSurfaceOf(staffTask) === null || staffCheck !== null)
  ) {
    // Eine falsche Notenantwort bekommt eine feste, freundliche Zeile von Code — bei jedem
    // Versuch, nicht nur beim ersten, und ohne Modellaufruf.
    //
    // Das ist kein Sparen, sondern Regel 5: der Tutor SIEHT die gezeichnete Notenzeile nicht.
    // Er bekommt Frage, Schlüssel und ihren Text, aber nicht das Bild, aus dem die Antwort
    // abgelesen wird — und ein Modell, das über ein Bild schreibt, das es nicht hat, erzeugt
    // genau die sicher klingende Falschaussage, die hier niemand erkennen könnte. Code weiß
    // dagegen, wo sie hinschauen muss, und sagt genau das (`staffAgain`); bei einer selbst
    // geschriebenen Zeile und bei Schlägen sogar die Stelle (`staffAnswerReply`). Die dritte
    // Fehlprobe erklärt die Lösung, wie überall — der Zweig darüber greift vorher.
    return {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply:
        staffCheck !== null
          ? staffAnswerReply(learner.locale, staffCheck, item.attempts)
          : staffAgain(learner.locale, staffTask),
      gaveHint: false,
      revealed: false,
    };
  } else if (partsCheck && rule === 'incorrect') {
    // A structured answer that is not right yet (issues #228–#230): code knows WHERE it stops
    // being right, so it says so — every time, not only on the first try, and never through a
    // model (0 model calls per answer). The third miss above shows the solution; a test above
    // says nothing until the end.
    // A cloze whose gaps are only off by spelling is a near miss, not wrong (issue #232);
    // its reply names her words, gap by gap.
    return {
      verdict: structuredVerdict(partsCheck) ?? 'incorrect',
      evaluatedBy: structuredDecidedBy(partsCheck),
      reply: structuredReply(learner.locale, partsCheck, item.attempts),
      // A match names its wrong link from the second miss on: that is a hint (#229).
      gaveHint: structuredNamesPart(partsCheck, item.attempts),
      revealed: false,
      columnStep: partsCheck.type === 'column_calc' ? columnStepOf(partsCheck) : null,
    };
  } else if (dictationCheck !== null && !dictationCheck.correct && rule === 'incorrect') {
    // A Diktat she did not get right yet (issue #242): code names the place — "Doppel-m fehlt",
    // "groß schreiben" — at every try, never through a model (0 model calls per answer). Her word
    // stays hers in the sentence; the key comes with the third miss above or "Lösung zeigen".
    return {
      verdict: nearlyRight(dictationCheck.spot) ? 'partially_correct' : 'incorrect',
      evaluatedBy: 'rule',
      reply: dictationReply(learner.locale, dictationCheck.spot),
      gaveHint: false,
      revealed: false,
    };
  } else if (givesHints(session.mode) && rule === 'incorrect' && item.attempts === 0) {
    // The FIRST wrong try: kind feedback at once, no model. A slip deserves a quick "try
    // again" and not a lesson, and the hints stay for "Tipp" (live finding 1).
    //
    // From the second one on it goes to the tutor instead (issue #156). The same question
    // wrong twice is a gap, not a slip, and the rules can only repeat themselves — the
    // external audit watched exactly that: "Noch nicht ganz …", "Noch nicht ganz …", then
    // the solution, with the error itself never engaged with. The JUDGEMENT stays the
    // rules' either way: `enforceTutorInvariants` holds a rule-certain wrong answer wrong
    // whatever the model says. Only the reply is the tutor's.
    return {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply: t(learner.locale, 'practice.try_again'),
      gaveHint: false,
      revealed: false,
    };
  }
  return null;
}
