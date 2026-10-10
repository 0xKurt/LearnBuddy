// Answering one question, step 5 of `answerItem` (answer.ts, #311): the tutor, for what the rules
// leave open — one model call with structured output (two in homework when the first gives the
// solution away), its decision held to the rules' invariants, and the fixed answers when the
// model is unavailable or its safety filter holds the answer back. docs/architecture.md §Practice.

import type { Deps } from '../../deps.js';
import { isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { learnerTimezone } from '../../lib/zone.js';
import { t } from '../../i18n/index.js';
import { safeguardingText } from '../../i18n/safeguarding.js';
import { callModel } from '../../llm/call.js';
import { LlmError, type LlmMessage } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { promptVersion } from '../../llm/promptVersion.js';
import { ageOn, isMinor } from '../identity/model.js';
import { cautiousAt, curriculumLine } from '../curriculum/state.js';
import type { AnswerCase, Judged } from './answerJudge.js';
import { formNoteFor } from './evaluate.js';
import { givesHints } from './modeRules.js';
import { articleMissing, NEAR_MISS_REPLY } from './nearMiss.js';
import type { RubricClaim } from './rubric.js';
import { solutionsOf } from './service.js';
import { secretsOf } from './structured.js';
import {
  RubricDecision,
  TUTOR_SYSTEM,
  TutorDecision,
  enforceTutorInvariants,
  VALUE_CONFIRMED,
  givesAwayHomework,
  homeworkSolved,
  tutorContext,
  type TutorDecision as TutorDecisionT,
} from './tutor.js';
import { stepOnRequest } from './workedSteps.js';

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

/** This prompt's version: its name and a hash of what it sends (`promptVersion`, #425). */
export const TUTOR_PROMPT_VERSION = promptVersion(
  'tutor',
  TUTOR_SYSTEM,
  TUTOR_SCHEMA,
  RUBRIC_SCHEMA,
);

/** The tutor's judgement of her answer, and what it said about a rubric's elements. */
export type TutorJudgement = {
  judged: Judged;
  /**
   * What the model said about the elements it was asked about. It stays empty when no model was
   * called at all (the rules alone answered, or the model was unavailable) — and then every
   * judged element is `unknown` rather than missing: nobody measured it.
   */
  claims: readonly RubricClaim[];
  /** The app's fixed help answer (#389): nothing may be put on top of it. */
  safeguarded: boolean;
};

export async function tutorJudgement(deps: Deps, c: AnswerCase): Promise<TutorJudgement> {
  const { learner, session, question, hintRequest, rule } = c;
  const heard: { claims: readonly RubricClaim[] } = { claims: [] };
  try {
    const d = await tutorDecision(deps, c, heard);
    if (d.concern) {
      return { judged: safeguard(c, 'concern'), claims: heard.claims, safeguarded: true };
    }
    const judged: Judged =
      hintRequest && !(question && d.intent === 'wants_to_stop')
        ? {
            // "Tipp": whatever the model called it, this is help, shown as a hint — never a
            // graded answer, and its own gentle hint is kept (live finding 1). A question
            // counts a hint only when the tutor gave one (#391).
            verdict: 'not_an_attempt',
            evaluatedBy: 'model',
            reply: d.reply,
            gaveHint: !d.revealed_answer && (!question || d.gave_hint),
            revealed: d.revealed_answer,
            // Never in a test: there nothing but the fixed line is shown (#391).
            offersLater: question && d.intent === 'off_topic' && session.mode !== 'test',
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
    return {
      // „Zeig mir wie" on a proven way (#298): the way's next step, exactly as „Tipp" shows it.
      judged: stepOnRequest(c.item, d.intent, c.nextHint) ?? judged,
      claims: heard.claims,
      safeguarded: false,
    };
  } catch (err) {
    if (isAppError(err) && err.code !== 'budget_exhausted') throw err;
    // The safety filter held the answer back: the fixed help answer, as in the chat (#389).
    if (err instanceof LlmError && err.kind === 'blocked') {
      return { judged: safeguard(c, 'blocked'), claims: heard.claims, safeguarded: true };
    }
    // No model: say what the rules know, never pretend to have judged.
    const judged: Judged = hintRequest
      ? {
          // "Tipp" without a model: a general first step, honestly no judgement. A question
          // cannot be answered without one, and the reply says exactly that (#391).
          verdict: 'not_an_attempt',
          evaluatedBy: 'rule',
          reply: t(learner.locale, question ? 'practice.ask_unavailable' : 'practice.help_step'),
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
    return { judged, claims: heard.claims, safeguarded: false };
  }
}

/**
 * Distress in the answer field, or the provider's safety filter (issue #389): the reply is
 * the app's fixed help answer, the same as in the chat — never the model's words, never a
 * hint, a solution or the test's neutral line on top of it, and never a try.
 */
function safeguard(c: AnswerCase, kind: 'concern' | 'blocked'): Judged {
  return {
    verdict: 'not_an_attempt',
    evaluatedBy: 'rule',
    reply: safeguardingText(c.learner.locale, isMinor(c.learner, c.now), kind),
    gaveHint: false,
    revealed: false,
  };
}

/**
 * The tutor's decision, held to what code knows: one call, and in homework one repair when it
 * gives the solution away. What it says about a rubric's elements goes into `heard`.
 */
async function tutorDecision(
  deps: Deps,
  c: AnswerCase,
  heard: { claims: readonly RubricClaim[] },
): Promise<TutorDecisionT> {
  const { learner, session, item, text, rule, asked, curriculumPoint } = c;
  const { contents: tutorContents, day } = await tutorMessages(deps, c);
  // The elements are asked for in THIS request, not in a second one (issue #211): the
  // claims are captured into `heard` rather than returned, so the one call a question has
  // always cost stays one call. The repair round below (homework only) overwrites what the
  // first round said — right, it is the same answer judged again.
  const askTutor = async (messages: LlmMessage[]) => {
    const r = await callModel(deps, learner.id, day, {
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
      heard.claims = parsed.data.elements;
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
    return VALUE_CONFIRMED.has(rule) && d.verdict === 'incorrect' && held.verdict !== 'incorrect'
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
  if (!d.concern && leaks(d)) {
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
  return d;
}

/** What the tutor reads — the question in its context, the turns so far, her answer — and her day. */
async function tutorMessages(
  deps: Deps,
  c: AnswerCase,
): Promise<{ contents: LlmMessage[]; day: string }> {
  const { learner, sessionId, session, item, now, question, text, rule } = c;
  const { structured, rubric, asked, listenTask, listening, taskPart, curriculumPoint } = c;
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
  const contents: LlmMessage[] = [
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
            // An explanation's ladder is its points, not these follow-ups (#298).
            preparedHints: givesHints(session.mode) && !c.pointsLadder ? item.hints : [],
            preparedShown: item.prepared_hints_used,
            attempts: item.attempts,
            ruleVerdict: rule,
            mode: session.mode,
            learnerLevel:
              learner.level === 'school' ? `school grade ${learner.grade ?? '?'}` : learner.level,
            learnerAge: ageOn(learner.birth_date, now),
            language: learner.locale,
            // For a listening question the material IS the text she heard (issue #210):
            // without it the tutor would judge an answer about a text it cannot read. For a
            // part of a task it is the situation above it (#297): an open part („Begründe …")
            // is judged on it, and its question alone does not say what it is about.
            material: listenTask
              ? listenTask.text
              : (taskPart?.stem ?? item.extracted_text?.slice(0, MATERIAL_CHARS) ?? null),
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
            question,
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
  return { contents, day: localParts(now, tz).date };
}
