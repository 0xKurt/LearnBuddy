// One answer to one question (docs/architecture.md §Practice): checked by rules where exactness is
// decidable, otherwise by the tutor model with structured output, then applied in one transaction
// behind the session lock — the turn, the question's state and, when it closes, FSRS. A use case
// of its own beside the start and the view (`service.ts`, `sessionView.ts`), like "Tipp"
// (`hint.ts`) and "Lösung zeigen" (`setAside.ts`).

import { type AnswerRequest, type AnswerResponse } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { learnerTimezone } from '../../lib/zone.js';
import { t } from '../../i18n/index.js';
import { callModel } from '../../llm/call.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { ageOn } from '../identity/model.js';
import { cautiousAt, curriculumLine, pointOf } from '../curriculum/state.js';
import { pickAnswers, taskOf, untriedPicks } from './bars.js';
import { listenTaskOf } from './listen.js';
import { checkDictation, dictationReply, nearlyRight, type DictationCheck } from './dictation.js';
import {
  differentNumber,
  formNoteFor,
  NEAR_MISS,
  noSingleSolution,
  plainMath,
  ruleCheck,
  type RuleVerdict,
  typoShapeFor,
} from './evaluate.js';
import {
  checkStaffLine,
  staffAgain,
  staffLineReply,
  staffTaskOf,
  writtenStaffLine,
  type StaffCheck,
} from './staff.js';
import { takeParts } from './partsAnswer.js';
import { givesHints, learnsFsrs } from './modeRules.js';
import { lockActiveSession } from './sessionRow.js';
import { settleTestClock, timeUpError } from './testClock.js';
import {
  answerTextOf,
  structuredNamesPart,
  partsVia,
  secretsOf,
  structuredDecidedBy,
  structuredReply,
  structuredVerdict,
} from './structured.js';
import { reviewItem, type ItemOutcome } from './fsrs.js';
import {
  articleMissing,
  equationReply,
  locatedOrNotHelp,
  NEAR_MISS_REPLY,
  pathReply,
  TYPO_REPLY,
} from './nearMiss.js';
import { CARD_PASS } from './cards.js';
import { DRILL_PASS } from './drill.js';
import { MAX_ACCEPTED } from './items.js';
import { explanationSoFar, NOTHING_EXPLAINED, recordExplained } from './teachBack.js';
import {
  askedElements,
  checkRubric,
  isExplanation,
  newlyExplained,
  rubricOf,
  rubricReply,
  rubricVerdict,
  type RubricClaim,
} from './rubric.js';
import {
  RubricDecision,
  TUTOR_PROMPT_VERSION,
  TUTOR_SYSTEM,
  TutorDecision,
  enforceTutorInvariants,
  VALUE_CONFIRMED,
  givesAwayHomework,
  homeworkSolved,
  mentionsSolution,
  tutorContext,
  type TutorDecision as TutorDecisionT,
} from './tutor.js';
import type { LlmMessage } from '../../llm/gateway.js';
import {
  settleTurn,
  nextSeq,
  replayOrLoad,
  shownSolution,
  solutionsOf,
  touchRun,
  type ItemRow,
  type PracticeLearner,
  type SessionItemRow,
} from './service.js';

// Exported for the schema inventory (`evals/schema`, issue #281); nothing else reads it.
export const TUTOR_SCHEMA = toJsonSchema(TutorDecision);
/**
 * Dasselbe Schema, erweitert um die Pflichtelemente einer Schreibaufgabe (issue #211). Es steht
 * neben dem gewöhnlichen, statt es zu ersetzen: eine Frage ohne Rubrik soll das Feld nicht
 * sehen und nicht mit Ausgabe-Tokens bezahlen. Der AUFRUF ist derselbe eine, in beiden Fällen.
 */
// Exported for the schema inventory (`evals/schema`, issue #281); nothing else reads it.
export const RUBRIC_SCHEMA = toJsonSchema(RubricDecision);
const MATERIAL_CHARS = 4000;

/**
 * After this many wrong tries the solution is explained (docs/buddy/03-fahrplan.md §2):
 * the old app withheld it forever, which frustrated; research on bottom-out hints and
 * worked examples supports a bounded ladder.
 */
const REVEAL_AFTER_MISSES = 3;

/**
 * Asked for help again, the solution is explained only once she has seen this many hints and
 * every prepared one (live finding 1: the first "Tipp" after a miss showed the solution).
 */
const HINTS_BEFORE_SOLUTION = 2;

/** Whether a (further) request for help shows the solution: the end of the hint ladder. */
function ladderDone(i: { hints: string[]; hints_used: number; prepared_hints_used: number }) {
  return (
    i.prepared_hints_used >= i.hints.length &&
    i.hints_used >= Math.max(i.hints.length, HINTS_BEFORE_SOLUTION)
  );
}

/**
 * The worked solution when prepared, otherwise the plain solution.
 *
 * For a free text neither is "the solution" (issue #197): a prepared way is introduced as ONE
 * way, and where none was prepared the app says plainly that there is no single right answer
 * here — instead of reading out the 600-character key as if it were one.
 */
function workedReply(
  locale: string,
  i: Pick<ItemRow, 'kind' | 'answer' | 'choices' | 'correct_choice' | 'unit' | 'worked_solution'>,
): string {
  const free = noSingleSolution(i);
  if (i.worked_solution) {
    return `${t(locale, free ? 'practice.one_way_intro' : 'practice.worked_intro')} ${i.worked_solution}`;
  }
  if (free) return t(locale, 'practice.no_single_solution');
  // A Diktat's word stands in the solution card right under this line (issue #242): said here
  // too, it would be the same word twice (#286). The line says what to do with it instead.
  if (i.kind === 'spelling_dictation') return t(locale, 'practice.dictation.shown');
  return t(locale, 'practice.solution_is', { answer: shownSolution(i) });
}

function outcomeOf(si: { status: string; first_try_correct: boolean | null }): ItemOutcome {
  if (si.status === 'correct') return si.first_try_correct ? 'first_try' : 'with_help';
  return 'revealed';
}

/**
 * A test: one neutral acknowledgement per answer, never a hint or the
 * solution (whatever the model wrote); what was right comes at the end.
 */
function asTestTurn<
  J extends {
    verdict: AnswerResponse['verdict'];
    reply: string;
    gaveHint: boolean;
    revealed: boolean;
  },
>(j: J, locale: string): J {
  if (j.verdict === null) return { ...j, gaveHint: false, revealed: false };
  const key = j.verdict === 'not_an_attempt' ? 'practice.test_no_hints' : 'practice.test_noted';
  return { ...j, reply: t(locale, key), gaveHint: false, revealed: false };
}

export async function answerItem(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: AnswerRequest,
  /** "Tipp" with no prepared hint left: a request for help, never an answer to grade. */
  opts: { hintRequest?: boolean } = {},
): Promise<AnswerResponse> {
  const hintRequest = opts.hintRequest === true;
  const first = await replayOrLoad(deps, learner.id, sessionId, input.client_turn_id);
  if ('replayed' in first) return first.replayed;
  const { session } = first;
  const now = deps.now();
  // A timed test (issue #241): an answer that arrives after the time is up is not graded — no
  // rule, no model, no turn — and the test ends with what she had answered in time.
  if ((await settleTestClock(deps.db, learner.id, sessionId, now)) === 'time_up') {
    throw timeUpError();
  }
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  // One path per session (issue #147): a flashcard pass is turned over, never answered,
  // hinted at or revealed. The pass was decided when it started, so the server refuses the
  // other way in rather than letting two kinds of evidence meet on one question.
  if (session.pass === CARD_PASS) {
    throw new AppError('conflict', 'These are cards: you say yourself whether you knew it', {
      reason: 'use_cards',
    });
  }
  // A Kopfrechnen round (issue #243) is answered through its own door, which checks by code
  // and never reaches the tutor; this path would call the model on a second miss.
  if (session.pass === DRILL_PASS) {
    throw new AppError('conflict', 'A quick round is answered on its pad', {
      reason: 'use_drill',
    });
  }
  const item = await deps.db.maybeOne<
    ItemRow & SessionItemRow & { extracted_text: string | null; subject_kind: string | null }
  >(
    `select i.*, si.status, si.attempts, si.hints_used, si.prepared_hints_used, si.first_try_correct,
            si.position, si.item_id,
            m.extracted_text, s.kind as subject_kind
       from session_items si join items i on i.id = si.item_id left join materials m on m.id = i.material_id
       left join subjects s on s.id = i.subject_id
      where si.session_id = $1 and si.item_id = $2`,
    [sessionId, input.item_id],
  );
  if (!item) throw new AppError('not_found', 'Question not in this session');
  if (item.status !== 'open') throw new AppError('conflict', 'This question is already closed');

  if (item.kind === 'speak') {
    throw new AppError('conflict', 'This question is answered by speaking', {
      reason: 'use_speak',
    });
  }
  // A Diktat has no written hint (issue #242): a hint about a word she is to spell would spell it,
  // and writing one would be a model call. The help is hearing it again, slower — on the card.
  if (hintRequest && item.kind === 'spelling_dictation') {
    throw new AppError('conflict', 'The help here is hearing it again', { reason: 'no_hints' });
  }

  // ── a STRUCTURED answer (issues #228–#232): parts, judged by code (partsAnswer.ts) ──
  const { structured, partsCheck } = await takeParts(deps, item, {
    parts: input.parts,
    hintRequest,
    learnerId: learner.id,
  });

  // ── eine NOTENZEILE, die sie selbst geschrieben hat (issue #226) ──
  //
  // Dieselbe Trennung wie oben, eine Stufe einfacher: die Zeile reist als eine kompakte
  // Maschinenform in `text` (`renderStaffLine`), weil die App nichts Deutsches zusammenbauen
  // soll und der Server nichts raten soll. `checkStaffLine` liest sie zurück und vergleicht
  // Tonnamen, Dauern und Taktfüllung — kein Modell, in keinem Zweig.
  //
  // Null heißt „hier ist nichts zu vergleichen": jede andere Notenaufgabe (die wird angetippt),
  // und eine Antwort, die überhaupt keine Notenzeile ist. Dann läuft alles wie immer — gegen den
  // Schlüssel in Worten, der in `items.answer` steht. Sie für falsch zu erklären wäre ein Urteil
  // über Noten, von denen keine da waren (Regel 5).
  const staffTask = staffTaskOf(item.staff_task);
  const staffCheck: StaffCheck | null =
    hintRequest || staffTask === null ? null : checkStaffLine(staffTask, input.text ?? '');
  /** Ihre Zeile in Worten, damit der Gesprächsfaden lesbar bleibt (wie `answerTextOf`). */
  const staffWritten =
    staffCheck !== null ? writtenStaffLine(learner.locale, input.text ?? '') : null;
  const text =
    structured && input.parts && partsCheck
      ? // Her arrangement in one line, so the thread, the tutor history and a disputed judgement
        // all see what she actually did.
        answerTextOf(structured, input.parts)
      : (staffWritten ??
        input.text ??
        (input.choice != null && item.choices ? (item.choices[input.choice] ?? null) : null));
  if (!text) throw new AppError('invalid_input', 'Empty answer');
  // The reviewed task this question was computed from, if any (issue #162).
  const barTask = taskOf(item.bar_task);
  // The curriculum place this question is at, if any (migration 0074, issue #214). Read
  // forgivingly: an unknown key means "no place", never a wrong rule.
  const curriculumPoint = pointOf(item.curriculum_point);
  // The required elements of a writing task, if any (issue #211). A free text with a rubric is
  // judged element by element instead of getting one of four verdicts about the whole text; a
  // free text without one behaves exactly as it has since #197.
  const rubric = hintRequest ? null : rubricOf(item.rubric);
  // An explanation goes on over the follow-ups („Erklär mal", #236): what she said before counts,
  // a point once confirmed stays confirmed, and the model is not asked about it again.
  const explaining = rubric !== null && isExplanation(rubric);
  const sofar = explaining
    ? await explanationSoFar(deps.db, sessionId, item.id)
    : NOTHING_EXPLAINED;
  const asked = rubric ? askedElements(rubric, sofar.settled) : [];
  /** The key points this answer newly covered, stored with it (`recordExplained`). */
  let explained: string[] = [];
  // What the model said about the elements it was asked about. It stays empty when no model was
  // called at all (the rules alone answered, or the model was unavailable) — and then every
  // judged element is `unknown` rather than missing: nobody measured it.
  let claims: readonly RubricClaim[] = [];
  // The spoken text this question was answered from, if any (issue #210). It decides two
  // things below: that only the content is judged (never the spelling of a word she HEARD),
  // and that the tutor is given that text as the material it may judge against.
  const listenTask = listenTaskOf(item.listen_task);
  // A Diktat (issue #242) is checked by code alone, exactly, against its key — and a miss is
  // answered with the PLACE (`practice/dictation.ts`), never by the tutor. It is no listening
  // task in the sense of #210: there the spelling of what she heard does NOT count, here it is the
  // whole point. So `listening` below stays false for it.
  const dictationCheck: DictationCheck | null =
    !hintRequest && item.kind === 'spelling_dictation'
      ? checkDictation(item.answer, input.text ?? '')
      : null;
  const listening = listenTask !== null && item.kind !== 'spelling_dictation';
  // A request for help is not an answer: nothing for the rules to check.
  // Two checks that code does ENTIRELY on its own and that therefore come before the key
  // comparison: every part of a structured answer (issues #228–#230), right or not yet right,
  // and a written note line (issue #226), which ends in `parts_left` when some of it holds.
  // Neither ever asks a model.
  const byOtherRules: RuleVerdict = hintRequest
    ? 'unknown'
    : partsCheck !== null
      ? partsCheck.correct
        ? 'correct'
        : 'incorrect'
      : staffCheck !== null
        ? staffCheck.verdict === 'correct'
          ? 'correct'
          : staffCheck.verdict === 'partly'
            ? 'parts_left'
            : 'incorrect'
        : ruleCheck(
            // A question code computed asks for an amount, so any form of it is right (#162);
            // a question she HEARD is judged on what she understood, not how she wrote it (#210).
            { ...item, form_free: barTask !== null, listening },
            { text: input.text ?? null, choice: input.choice ?? null },
          );
  // A Diktat is decided by its own exact check (issue #242), never by the key comparison above.
  const byRules: RuleVerdict =
    dictationCheck !== null ? (dictationCheck.correct ? 'correct' : 'incorrect') : byOtherRules;
  // A plain number with another value is a wrong answer for sure — except in homework,
  // where "12" may be a right step towards 11/12.
  const rule: RuleVerdict =
    byRules === 'unknown' && !hintRequest && session.mode !== 'help' && differentNumber(item, text)
      ? 'incorrect'
      : byRules;
  const nextHint = givesHints(session.mode) ? (item.hints[item.prepared_hints_used] ?? null) : null;
  // Two options and one was wrong: tapping the other one is no knowledge. A wrong choice that
  // leaves a single untried option closes the question with the solution explained — shown,
  // never right (user feedback #9).
  // The same holds for two bars she compares (issue #162): once one of them is ruled out,
  // tapping the other is elimination, not knowledge.
  const twoBars = barTask !== null && pickAnswers(barTask) !== null;
  let onlyOneLeft = false;
  if (
    givesHints(session.mode) &&
    rule === 'incorrect' &&
    ((item.kind === 'multiple_choice' && item.choices !== null) || twoBars)
  ) {
    const wrong = await deps.db.query<{ text: string }>(
      `select distinct text from practice_turns
        where session_id = $1 and item_id = $2 and role = 'learner' and verdict = 'incorrect'`,
      [sessionId, item.id],
    );
    const said = [...wrong.map((w) => w.text), text];
    const untried = untriedPicks(barTask, said);
    if (untried !== null) {
      onlyOneLeft = untried.length <= 1;
    } else if (item.choices) {
      const tried = new Set(said);
      onlyOneLeft = item.choices.filter((c) => !tried.has(c)).length <= 1;
    }
  }

  type Judged = {
    verdict: 'correct' | 'partially_correct' | 'incorrect' | 'not_an_attempt' | null;
    evaluatedBy: 'rule' | 'model' | null;
    reply: string;
    gaveHint: boolean;
    /** The hint shown is the next prepared one (prepared_hints_used moves on). */
    usedPrepared?: boolean;
    revealed: boolean;
  };
  let judged: Judged;
  if (hintRequest && givesHints(session.mode) && ladderDone(item)) {
    // Asked again at the end of the ladder: the solution explained, at once, no model.
    judged = {
      verdict: 'not_an_attempt',
      evaluatedBy: 'rule',
      reply: workedReply(learner.locale, item),
      gaveHint: false,
      revealed: true,
    };
  } else if (rule === 'correct') {
    judged = {
      verdict: 'correct',
      // A cloze gap the model judged (issue #232) makes it the model's verdict, honestly.
      evaluatedBy: partsCheck ? structuredDecidedBy(partsCheck) : 'rule',
      reply: t(
        learner.locale,
        session.mode === 'help' ? 'practice.help_solved' : 'practice.correct',
      ),
      gaveHint: false,
      revealed: false,
    };
  } else if (rule === 'parts_left' && staffCheck !== null) {
    // Eine Notenzeile, von der ein Stück hält (issue #226) — dasselbe Urteil, eine Form weiter.
    // Die Frage bleibt offen, nichts wird zurückgesetzt, und sie bekommt EINE Stelle: wie viele
    // Zeichen von vorne stimmen, und ab dem zweiten Versuch auch, wo es aufhört („in Takt 2 ist
    // mehr, als in den Takt passt“). Das ist genau die Rückmeldung, die issue #226 verlangt.
    judged = {
      verdict: 'partially_correct',
      evaluatedBy: 'rule',
      reply: staffLineReply(learner.locale, staffCheck, item.attempts),
      gaveHint: false,
      revealed: false,
    };
  } else if (partsCheck && structuredVerdict(partsCheck) === null) {
    // A cloze gap nobody could judge (no model, issue #232) and nothing else wrong: no
    // verdict is claimed and no try is counted (CLAUDE.md rule 5).
    judged = {
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
    judged = {
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
    judged = {
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
    judged = {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply: workedReply(learner.locale, item),
      gaveHint: false,
      revealed: true,
    };
  } else if (
    givesHints(session.mode) &&
    rule === 'incorrect' &&
    staffTask !== null &&
    // Eine Schreibaufgabe nur, wenn wirklich eine Zeile ankam: sonst hat `ruleCheck` sie gegen
    // den Schlüssel in Worten geprüft, und dafür ist der Satz hier der falsche.
    (staffTask.task !== 'write_line' || staffCheck !== null)
  ) {
    // Eine falsche Notenantwort bekommt eine feste, freundliche Zeile von Code — bei jedem
    // Versuch, nicht nur beim ersten, und ohne Modellaufruf.
    //
    // Das ist kein Sparen, sondern Regel 5: der Tutor SIEHT die gezeichnete Notenzeile nicht.
    // Er bekommt Frage, Schlüssel und ihren Text, aber nicht das Bild, aus dem die Antwort
    // abgelesen wird — und ein Modell, das über ein Bild schreibt, das es nicht hat, erzeugt
    // genau die sicher klingende Falschaussage, die hier niemand erkennen könnte. Code weiß
    // dagegen, wo sie hinschauen muss, und sagt genau das (`staffAgain`); bei einer selbst
    // geschriebenen Zeile sogar die Stelle (`staffLineReply`). Die dritte Fehlprobe erklärt
    // die Lösung, wie überall — der Zweig darüber greift vorher.
    judged = {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply:
        staffCheck !== null
          ? staffLineReply(learner.locale, staffCheck, item.attempts)
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
    judged = {
      verdict: structuredVerdict(partsCheck) ?? 'incorrect',
      evaluatedBy: structuredDecidedBy(partsCheck),
      reply: structuredReply(learner.locale, partsCheck, item.attempts),
      // A match names its wrong link from the second miss on: that is a hint (#229).
      gaveHint: structuredNamesPart(partsCheck, item.attempts),
      revealed: false,
    };
  } else if (dictationCheck !== null && !dictationCheck.correct && rule === 'incorrect') {
    // A Diktat she did not get right yet (issue #242): code names the place — "Doppel-m fehlt",
    // "groß schreiben" — at every try, never through a model (0 model calls per answer). Her word
    // stays hers in the sentence; the key comes with the third miss above or "Lösung zeigen".
    judged = {
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
    judged = {
      verdict: 'incorrect',
      evaluatedBy: 'rule',
      reply: t(learner.locale, 'practice.try_again'),
      gaveHint: false,
      revealed: false,
    };
  } else {
    try {
      const preferences = await deps.db.query<{ statement: string }>(
        `select statement from buddy_memories
          where learner_id = $1 and status = 'active' and kind = 'preference'
            and (valid_until is null or valid_until > $2)
          order by created_at desc, seq desc limit 5`,
        [learner.id, now],
      );
      const history = await deps.db.query<{ role: 'learner' | 'tutor'; text: string }>(
        `select role, text from practice_turns where session_id = $1 and item_id = $2 order by seq`,
        [sessionId, item.id],
      );
      const tz = await learnerTimezone(deps.db, learner.id);
      const tutorContents: LlmMessage[] = [
        {
          role: 'user',
          parts: [
            {
              text: tutorContext({
                // A listening item says so (#210; never a Diktat, #242); a structured item's
                // question is more than its instruction: a cloze's text with its gaps (#232).
                item: {
                  ...item,
                  listening,
                  ...(structured ? { prompt: secretsOf(structured, item.prompt).visible } : {}),
                },
                hintsGiven: item.hints_used,
                preparedHints: givesHints(session.mode) ? item.hints : [],
                preparedShown: item.prepared_hints_used,
                attempts: item.attempts,
                ruleVerdict: rule,
                mode: session.mode,
                learnerLevel:
                  learner.level === 'school'
                    ? `school grade ${learner.grade ?? '?'}`
                    : learner.level,
                learnerAge: ageOn(learner.birth_date, now),
                language: learner.locale,
                // For a listening question the material IS the text she heard (issue #210):
                // without it the tutor would judge an answer about a text it cannot read.
                material: listenTask
                  ? listenTask.text
                  : item.extracted_text
                    ? item.extracted_text.slice(0, MATERIAL_CHARS)
                    : null,
                preferences: preferences.map((p) => p.statement),
                // What her Bundesland expects at this question's curriculum place — or, when
                // no state rule applies, that none does and the judgement stays cautious
                // (issue #214). Null for a question at none of the twelve places.
                curriculum: curriculumLine({
                  point: curriculumPoint,
                  region: learner.curriculum_region,
                  grade: learner.grade,
                }),
                rubric: rubric ? { form: rubric.form, asked } : null,
                // The value is right and only the form differs: what code read off the two
                // syntax trees, so the tutor decides about the question, not the algebra (#235).
                formNote: rule === 'other_form' ? formNoteFor(item, text) : null,
              }),
            },
          ],
        },
        ...history.map((h) => ({
          role: h.role === 'learner' ? ('user' as const) : ('model' as const),
          parts: [{ text: h.text }],
        })),
        { role: 'user', parts: [{ text }] },
      ];
      // The elements are asked for in THIS request, not in a second one (issue #211): the
      // claims are captured into `claims` above rather than returned, so the one call a
      // question has always cost stays one call. The repair round below (homework only)
      // overwrites what the first round said — right, it is the same answer judged again.
      const askTutor = async (messages: LlmMessage[]) => {
        const r = await callModel(deps, learner.id, localParts(now, tz).date, {
          purpose: 'tutor',
          tier: 'smart',
          promptVersion: TUTOR_PROMPT_VERSION,
          system: TUTOR_SYSTEM,
          contents: messages,
          schema: asked.length ? RUBRIC_SCHEMA : TUTOR_SCHEMA,
          maxOutputTokens: 1024,
          temperature: 0.3,
          timeoutMs: 20_000,
          thinkingBudget: 0,
        });
        // A writing task with required elements answers in a wider schema — the same decision
        // plus one line per element (issue #211); everything else answers as before.
        let d: TutorDecisionT;
        if (asked.length) {
          const parsed = RubricDecision.safeParse(r.json);
          if (!parsed.success) throw new Error('tutor output invalid');
          claims = parsed.data.elements;
          d = parsed.data;
        } else {
          const parsed = TutorDecision.safeParse(r.json);
          if (!parsed.success) throw new Error('tutor output invalid');
          d = parsed.data;
        }
        const held = enforceTutorInvariants(
          d,
          rule,
          articleMissing(rule, item),
          // At a place where the states disagree and no rule applies to her, a confident
          // "wrong" is a claim nobody can back: it becomes "partly right" (issue #214).
          curriculumPoint !== null &&
            cautiousAt(curriculumPoint, learner.curriculum_region, learner.grade),
        );
        // Code confirmed the value and the model still said "wrong" (issue #227, finding 1).
        // The verdict is held at "partly right" above; the words it wrote for "wrong" would
        // contradict that, so the reply is the app's own: the value holds, the form is open.
        return VALUE_CONFIRMED.has(rule) &&
          d.verdict === 'incorrect' &&
          held.verdict !== 'incorrect'
          ? { ...held, reply: t(learner.locale, 'practice.same_value'), gave_hint: false }
          : held;
      };
      // Homework: a task is solved only when code finds her final answer (by value, or the key
      // or an accepted answer in her words). A "correct" code cannot confirm is a right step:
      // the task stays open, and the reply must not say "right" under a "Fast" (audit H-10).
      // This runs FIRST, so the leak check judges the final verdict and reply (audit H-9).
      const solvedByHer = (x: TutorDecisionT): TutorDecisionT =>
        session.mode === 'help' &&
        item.kind !== 'long' &&
        x.verdict === 'correct' &&
        !homeworkSolved(item, text)
          ? {
              ...x,
              verdict: 'partially_correct',
              reply: t(learner.locale, 'practice.help_final_answer'),
              gave_hint: false,
              revealed_answer: false,
            }
          : x;
      // Only the task itself may state a value; her own guesses are no licence (audit M-28).
      const leaks = (x: TutorDecisionT) =>
        session.mode === 'help' && givesAwayHomework(x, solutionsOf(item), item.prompt);
      let d = solvedByHer(await askTutor(tutorContents));
      if (leaks(d)) {
        // Homework: the solution must not be given. One repair with the reason, then a safe hint.
        d = solvedByHer(
          await askTutor([
            ...tutorContents,
            { role: 'model', parts: [{ text: d.reply }] },
            {
              role: 'user',
              parts: [
                {
                  text: 'SYSTEM CHECK (not the learner): that reply gives the solution away, which is not allowed for homework. Write it again as one small hint or question without the answer.',
                },
              ],
            },
          ]),
        );
        if (leaks(d)) {
          d = {
            ...d,
            verdict: d.verdict === 'correct' ? 'partially_correct' : d.verdict,
            reply: t(learner.locale, 'practice.help_step'),
            gave_hint: true,
            revealed_answer: false,
          };
        }
      }
      judged = hintRequest
        ? {
            // "Tipp": whatever the model called it, this is help, shown as a hint — never a
            // graded answer, and its own gentle hint is kept (live finding 1).
            verdict: 'not_an_attempt',
            evaluatedBy: 'model',
            reply: d.reply,
            gaveHint: !d.revealed_answer,
            revealed: d.revealed_answer,
          }
        : d.intent === 'wants_to_stop'
          ? {
              // She has had enough (issue #161). The words here are the app's, not the
              // model's: this is the moment where a cheerful "du bist schon so nah dran"
              // is both untrue and pressure, and the external audit caught exactly that.
              // What she gets is a real choice — stop for today, or one small example —
              // and the way out is already on screen ("Übung beenden").
              verdict: 'not_an_attempt',
              evaluatedBy: 'rule',
              reply: t(learner.locale, 'practice.had_enough'),
              gaveHint: false,
              revealed: false,
            }
          : {
              verdict: d.verdict,
              evaluatedBy: 'model',
              reply: d.reply,
              gaveHint: d.gave_hint,
              revealed: d.revealed_answer,
            };
    } catch (err) {
      if (isAppError(err) && err.code !== 'budget_exhausted') throw err;
      // No model: say what the rules know, never pretend to have judged.
      judged = hintRequest
        ? {
            // "Tipp" without a model: a general first step, honestly no judgement.
            verdict: 'not_an_attempt',
            evaluatedBy: 'rule',
            reply: t(learner.locale, 'practice.help_step'),
            gaveHint: false,
            revealed: false,
          }
        : rule === 'close' || rule === 'spelling'
          ? {
              verdict: 'partially_correct',
              evaluatedBy: 'rule',
              reply: t(learner.locale, NEAR_MISS_REPLY[rule] ?? 'practice.accents'),
              gaveHint: false,
              revealed: false,
            }
          : rule === 'incorrect'
            ? {
                verdict: 'incorrect',
                evaluatedBy: 'rule',
                reply: t(learner.locale, 'practice.not_quite'),
                gaveHint: false,
                revealed: false,
              }
            : {
                verdict: null,
                evaluatedBy: null,
                reply: t(learner.locale, 'practice.cannot_check'),
                gaveHint: false,
                revealed: false,
              };
    }
  }

  // ─────────────── Schreibaufgabe: Rückmeldung je Element statt eines Urteils (issue #211) ──
  //
  // Hier wird das Gesamturteil ersetzt, nicht ergänzt. Der Grund steht im Issue: für eine
  // Inhaltsangabe, einen Bericht, eine Erörterung gibt es keine Musterlösung, gegen die ein
  // Gesamturteil zu rechtfertigen wäre — bewertet wird, ob die geforderten Elemente da sind.
  // Also entscheidet die Rubrik:
  //
  //   * das URTEIL kommt aus den Elementen (`rubricVerdict`), nicht aus dem Eindruck des
  //     Modells. Hält etwas und nicht alles, bleibt die Frage offen — und bekommt damit, wie
  //     bisher, keine FSRS-Note (`rateable` weiter unten); ein Bruchteil wird nirgends erfunden.
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

  if (givesHints(session.mode)) {
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
      !partsCheck &&
      judged.verdict !== 'correct' &&
      item.hints_used < 2 &&
      (judged.revealed || leaks(judged.reply))
    ) {
      judged = {
        ...judged,
        reply:
          nextHint ?? t(learner.locale, hintRequest ? 'practice.help_step' : 'practice.try_again'),
        gaveHint: nextHint !== null || hintRequest,
        usedPrepared: nextHint !== null,
        revealed: false,
      };
    }
    // Never withheld forever: after the third wrong try, or when she asks again at the end of
    // the hint ladder, the solution is explained and the question comes back soon (FSRS).
    const attempted = judged.verdict !== null && judged.verdict !== 'not_an_attempt';
    const misses = item.attempts + (attempted ? 1 : 0);
    const askedAfterLastHint = judged.verdict === 'not_an_attempt' && ladderDone(item);
    if (
      !judged.revealed &&
      judged.verdict !== 'correct' &&
      judged.verdict !== null &&
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

  if (session.mode === 'test') judged = asTestTurn(judged, learner.locale);

  // A concurrent duplicate of the same answer that won gets its result back (`settleTurn`).
  return settleTurn(
    deps,
    learner.id,
    sessionId,
    item.id,
    input.client_turn_id,
    judged.verdict,
    () =>
      deps.db.tx(async (tx) => {
        // The session row first (one order everywhere): an answer to a session that ended
        // meanwhile is refused behind the same lock, and closing the last question finishes it.
        await lockActiveSession(tx, learner.id, sessionId);
        const si = await tx.one<SessionItemRow>(
          `select item_id, position, status, attempts, hints_used, prepared_hints_used, first_try_correct
           from session_items where session_id = $1 and item_id = $2 for update`,
          [sessionId, item.id],
        );
        if (si.status !== 'open') throw new AppError('conflict', 'This question is already closed');
        const seq = await nextSeq(tx, sessionId);
        await tx.query(
          `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id)
         values ($1, $2, $3, $4, 'learner', $5, $6, $7, $8)`,
          [
            sessionId,
            learner.id,
            item.id,
            seq,
            text,
            judged.verdict,
            judged.evaluatedBy,
            input.client_turn_id,
          ],
        );
        await tx.query(
          `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, gave_hint, revealed)
         values ($1, $2, $3, $4, 'tutor', $5, $6, $7)`,
          [sessionId, learner.id, item.id, seq + 1, judged.reply, judged.gaveHint, judged.revealed],
        );
        // The key learns: an answer the model judged right that the rules did not know
        // is accepted by the rules next time — at once and without a model.
        //
        // Two limits, because this is the one place where a MODEL judgement becomes a RULE and
        // then outlives everything (issue #227, finding 3):
        //
        //   - never in a test. There the model judges with less context, its reply is thrown
        //     away and replaced, and nobody reads what it decided — the worst possible moment
        //     to make one of its judgements permanent.
        //   - never past MAX_ACCEPTED, the same ceiling the reading prompts name. Without it the
        //     list grows without end, every entry widens what counts as right, and a key that
        //     accepts everything accepts a wrong answer too. Postgres does the counting, so two
        //     answers arriving at once cannot both slip past a check done in code.
        if (
          judged.evaluatedBy === 'model' &&
          judged.verdict === 'correct' &&
          rule === 'unknown' &&
          (item.kind === 'vocab' || item.kind === 'short') &&
          session.mode !== 'help' &&
          session.mode !== 'test' &&
          text.trim().length <= 80
        ) {
          await tx.query(
            `update items set accepted_answers = array_append(accepted_answers, $3)
            where id = $1 and learner_id = $2 and not ($3 = any(accepted_answers))
              and coalesce(array_length(accepted_answers, 1), 0) < $4`,
            [item.id, learner.id, text.trim(), MAX_ACCEPTED],
          );
        }
        const attempted = judged.verdict !== null && judged.verdict !== 'not_an_attempt';
        const attempts = si.attempts + (attempted ? 1 : 0);
        const hints = si.hints_used + (judged.gaveHint ? 1 : 0);
        const prepared = si.prepared_hints_used + (judged.usedPrepared ? 1 : 0);
        let status: SessionItemRow['status'] = 'open';
        let firstTry: boolean | null = si.first_try_correct;
        if (judged.verdict === 'correct') {
          status = 'correct';
          firstTry = si.attempts === 0 && si.hints_used === 0;
        } else if (judged.revealed) {
          status = 'revealed';
          firstTry = false;
        } else if (session.mode === 'test' && attempted) {
          // One try per question in a test.
          status = 'missed';
          firstTry = false;
        }
        // Working on a task she set aside brings it back in line (deferred_at cleared).
        await tx.query(
          `update session_items set attempts = $3, hints_used = $4, status = $5, first_try_correct = $6,
                                  closed_at = case when $5 = 'open' then null else $7::timestamptz end,
                                  deferred_at = null, prepared_hints_used = $8,
                                  -- How the CLOSING answer was given (issue #163); an open
                                  -- question keeps nothing, a tap is not production.
                                  answered_by = case when $5 = 'open' then null else $9::text end
          where session_id = $1 and item_id = $2`,
          [
            sessionId,
            item.id,
            attempts,
            hints,
            status,
            firstTry,
            now,
            prepared,
            // Arranging parts is tapping (issue #163), unless the app says otherwise — and a
            // cloze without a word bank can only be typed (issue #232).
            input.via ?? (partsCheck && structured ? partsVia(structured) : 'typed'),
          ],
        );
        await recordExplained(tx, sessionId, item.id, explained);
        // A free text she did not get right produces NO review: `Again` is a statement about
        // memory, and nothing here was measured (issue #197). Got right, it counts like any
        // other question. The cost is that such a question does not come back on a schedule —
        // which is the honest price for not inventing the rating.
        const rateable = status === 'correct' || !noSingleSolution(item);
        if (status !== 'open' && learnsFsrs(session.mode) && rateable) {
          // What the spaced repetition held BEFORE this review is recorded by `reviewItem`
          // itself (`session_items.state_before`, issue #164), from the same read that
          // overwrites it — so a judgement she says is wrong can be taken back without
          // costing her the history from earlier sessions.
          await reviewItem(
            tx,
            learner.id,
            sessionId,
            item.id,
            outcomeOf({ status, first_try_correct: firstTry }),
            now,
          );
        }
        await touchRun(tx, learner.id, sessionId, now);
      }),
  );
}
