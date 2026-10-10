// Answering one question, step 2 of `answerItem` (answer.ts, #311): what she answered, in one
// line, and what code alone can say about it — a structured answer part by part, a note line or
// her beats, a Diktat exactly, everything else against the key (`ruleCheck`). Also what a writing
// task with a rubric asks for, and what she explained before. No model. docs/architecture.md
// §Practice.

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { pointOf } from '../curriculum/state.js';
import type { Answering } from './answerLoad.js';
import { taskOf } from './bars.js';
import { codeTaskOf } from './code.js';
import { checkCode, pickedLine, writtenCode, type CodeCheck } from './codeCheck.js';
import { checkDictation, type DictationCheck } from './dictation.js';
import { differentNumber, ruleCheck, type RuleVerdict } from './evaluate.js';
import { listenTaskOf } from './listen.js';
import { givesHints } from './modeRules.js';
import { takeParts } from './partsAnswer.js';
import { keyPointsOf, pointLadder } from './pointSteps.js';
import { askedElements, isExplanation, rubricOf } from './rubric.js';
import { checkStaffAnswer, staffTaskOf, type StaffAnswerCheck } from './staff.js';
import { answerTextOf } from './structured.js';
import { tappedAnswerText } from './tapCheck.js';
import { explanationSoFar, NOTHING_EXPLAINED } from './teachBack.js';

/** What the rules made of her answer: the verdict by key and what it was read from. */
export type Ruled = Awaited<ReturnType<typeof ruleVerdict>>;

export async function ruleVerdict(deps: Deps, a: Answering) {
  const { learner, sessionId, input, session, item, hintRequest, essay } = a;
  // ── a STRUCTURED answer (issues #228–#232): parts, judged by code (partsAnswer.ts) ──
  const { structured, partsCheck } = await takeParts(deps, item, {
    parts: input.parts,
    hintRequest,
    learnerId: learner.id,
  });

  // ── eine NOTENZEILE, die sie selbst geschrieben hat (issue #226), oder ihre SCHLÄGE zu einem
  //    gehörten Rhythmus (issue #445) ──
  //
  // Dieselbe Trennung wie oben, eine Stufe einfacher: die Zeile reist als eine kompakte
  // Maschinenform in `text` (`renderStaffLine`), die Schläge als ihre Abstände (`renderTaps`),
  // weil die App nichts Deutsches zusammenbauen soll und der Server nichts raten soll.
  // `checkStaffAnswer` liest sie zurück und vergleicht Tonnamen, Dauern und Taktfüllung bzw. die
  // Abstände in ihrem Tempo (`rhythm.ts`) — kein Modell, in keinem Zweig.
  //
  // Null heißt „hier ist nichts zu vergleichen": jede andere Notenaufgabe (die wird angetippt),
  // und eine Antwort, die überhaupt keine Zeile oder keine Schläge ist. Dann läuft alles wie
  // immer — gegen den Schlüssel in Worten, der in `items.answer` steht. Sie für falsch zu erklären
  // wäre ein Urteil über Noten, von denen keine da waren (Regel 5).
  const staffTask = staffTaskOf(item.staff_task);
  const staffCheck: StaffAnswerCheck | null =
    hintRequest || staffTask === null
      ? null
      : checkStaffAnswer(learner.locale, staffTask, input.text ?? '');
  /** Ihre Zeile in Worten bzw. wie oft sie geklopft hat, damit der Gesprächsfaden lesbar bleibt. */
  const staffWritten = staffCheck?.written ?? null;
  // ── a PROGRAM or a QUERY (issue #262) ──
  //
  // Her output, the line she tapped, her function or her query — checked by code RUNNING it in
  // the sandbox (`codeCheck.ts`), never by a model. "Which line?" takes only a line number of the
  // program shown; anything else is a form the question never offered.
  const codeTask = codeTaskOf(item.code_task);
  const codeCheck: CodeCheck | null =
    hintRequest || codeTask === null ? null : await checkCode(codeTask, input.text ?? '');
  if (codeTask?.task === 'find_error' && !hintRequest && codeCheck === null) {
    throw new AppError('invalid_input', 'This question is answered by tapping a line', {
      reason: 'use_line',
    });
  }
  const codeWritten =
    codeTask !== null && !hintRequest && pickedLine(input.text ?? '') !== null
      ? writtenCode(learner.locale, codeTask, input.text ?? '')
      : null;
  // A region of a map or a part of a picture she tapped (issues #251, #252): the app sends the
  // German name; in the thread it stands in her language, like every answer written here.
  const regionWritten =
    hintRequest || input.text == null ? null : tappedAnswerText(item, input.text, learner.locale);
  const text =
    structured && input.parts && partsCheck
      ? // Her arrangement in one line, so the thread, the tutor history and a disputed judgement
        // all see what she actually did.
        answerTextOf(structured, input.parts, learner.locale)
      : (staffWritten ??
        codeWritten ??
        regionWritten ??
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
  const rubric = hintRequest || essay ? null : rubricOf(item.rubric);
  // An explanation goes on over the follow-ups („Erklär mal", #236): what she said before counts,
  // a point once confirmed stays confirmed, and the model is not asked about it again.
  const explaining = rubric !== null && isExplanation(rubric);
  // Its key points are its hint ladder in practice (Vormachen, #298, `pointSteps.ts`) — also for
  // „Tipp", which judges nothing.
  const points = givesHints(session.mode) && !essay ? keyPointsOf(item.rubric) : null;
  const sofar =
    explaining || points ? await explanationSoFar(deps.db, sessionId, item.id) : NOTHING_EXPLAINED;
  const pointsLadder = points
    ? pointLadder(points, sofar.settled, item.prepared_hints_used, item.hints_used)
    : null;
  // A point Buddy showed is not asked about: it is his, never hers.
  const asked = rubric
    ? askedElements(rubric, [...sofar.settled, ...(pointsLadder?.shown ?? [])])
    : [];
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
        : codeCheck !== null
          ? codeCheck.verdict === 'correct'
            ? 'correct'
            : // In a test a program is right or not: no partial feedback until the end.
              codeCheck.verdict === 'partly' && session.mode !== 'test'
              ? 'parts_left'
              : 'incorrect'
          : ruleCheck(
              // A question code computed asks for an amount, so any form of it is right (#162);
              // a question she HEARD is judged on what she understood, not how she wrote it (#210).
              { ...item, form_free: barTask !== null, listening },
              { text: input.text ?? null, choice: input.choice ?? null, locale: learner.locale },
            );
  // A Diktat is decided by its own exact check (issue #242), never by the key comparison above.
  const byRules: RuleVerdict =
    dictationCheck !== null ? (dictationCheck.correct ? 'correct' : 'incorrect') : byOtherRules;
  // A plain number with another value is a wrong answer for sure — except in homework,
  // where "12" may be a right step towards 11/12.
  const byKey: RuleVerdict =
    byRules === 'unknown' && !hintRequest && session.mode !== 'help' && differentNumber(item, text)
      ? 'incorrect'
      : byRules;
  return {
    structured,
    partsCheck,
    staffTask,
    staffCheck,
    codeTask,
    codeCheck,
    text,
    barTask,
    curriculumPoint,
    rubric,
    explaining,
    sofar,
    pointsLadder,
    asked,
    listenTask,
    dictationCheck,
    listening,
    byKey,
  };
}
