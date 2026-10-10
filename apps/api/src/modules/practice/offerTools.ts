// Buddy's offers to learn (docs/architecture.md §Tools): a button in the conversation that she
// starts with a tap — something to learn (`offer_learning`) or a Kopfrechnen round (`offer_drill`,
// #243). They change nothing; what code enforces is that the button can really start what it
// promises. Registered into Buddy's tools by modules/learning/register.ts (issue #107).

import { DrillSpec, TEST_MINUTES, TestMinutes } from '@learnbuddy/shared-types/contracts';

import { type ActionOf } from '../buddy/decision.js';
import { loadStandingOffers } from '../learning/state.js';
import { holdsWordPairs, normalizeForMatch } from '../buddy/text.js';
import {
  goalOf,
  materialOf,
  ToolRejection,
  type ToolContext,
  type ToolOutcome,
  requireQuote,
} from '../buddy/toolKit.js';
import { titleOf } from './drill.js';
import { fromLearnerText } from './generate.js';
import { practiceGoesWell } from './readiness.js';

export async function runOfferLearning(
  action: ActionOf<'offer_learning'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  // Practice or a test for a planned test stays within its sheets (live finding 6): the goal
  // the model named, or the one active goal whose title the offer names exactly.
  const forGoal = a.kind === 'test' || a.kind === 'practice';
  let goal = forGoal && a.goal ? goalOf(ctx, a.goal) : null;
  if (forGoal && !goal) {
    const named = [...ctx.aliases.goals.values()].filter(
      (g) => g.status === 'active' && normalizeForMatch(g.title) === normalizeForMatch(a.text),
    );
    goal = named.length === 1 ? named[0]! : null;
  }
  // Two of the five kinds are a button over CONTENT, not over a topic, and the generator says so
  // itself: `vocab` makes one question per pair the text holds and sets usable = false when it
  // holds none; `help` keeps only tasks whose words are in the text it was given
  // (practice/generate.ts: TASK.vocab, TASK.help, fromLearnerText). So an offer of those kinds
  // whose text NAMES the content instead of being it can never start. It still reaches the chat,
  // she taps it, and the card replaces "Let's go" with "I can't prepare anything from that,
  // sorry" under a reply that says the practice is ready (issue #196). Reproduced on every live
  // run: the text was the sheet's own title, "French vocabulary Unité 3", and the tap came back
  // 422 not_usable.
  //
  // So the floor is each generator's own precondition, enforced one step earlier where the model
  // can still be told — never something stricter than the thing it protects:
  //   vocab — the text has to BE a list of pairs (text.ts holdsWordPairs: structure, no language
  //           in it). Where the pairs come from is not the question: she may have typed them, or
  //           Buddy may have copied them off her sheet to ask them in one direction (#113).
  //   help  — the task has to be in her own words, which is exactly what the generator keeps.
  if (a.kind === 'vocab' && !holdsWordPairs(a.text)) {
    throw new ToolRejection(
      `"${a.text}" names a vocabulary list instead of being one, and questions are made from the pairs this text holds — so this button could not start anything. Either put the pairs themselves in "text" (one per line, "word – translation"), or, for a list on a sheet she photographed, use prepare_practice on that sheet with vocabulary_only.`,
    );
  }
  // A Diktat of her sheet (issue #242), questions about it („Erklär mal", #236) or its writing task
  // (Lange Texte, #258): the sheet must be one of hers, and only these three take one — every other
  // kind is about a topic or her text, and a sheet there would be silently ignored.
  const takesSheet =
    a.kind === 'spelling_dictation' || a.kind === 'teach_back' || a.kind === 'essay';
  const sheet = takesSheet && a.sheet ? materialOf(ctx, a.sheet) : null;
  if (a.kind === 'help' && !fromLearnerText(a.text, (ctx.learnerWords ?? []).join('\n'))) {
    throw new ToolRejection(
      `a help offer works on the task the learner wrote, so "text" must be their own words from this message — "${a.text}" names it instead, and hints cannot be made from a name. Without the task in the message, ask her to type or photograph it (no offer).`,
    );
  }
  // A Probetest only once practice on it goes well (issue #388, report §3.5: Pan & Rickard) —
  // decided by code from her practice runs, never by the model. Her own wish is the other door:
  // her words asking for it, checked like the clock's below. Asked or not, the button is the
  // same; what is refused is a test that is only Buddy's idea and would come too early.
  if (a.asked && a.kind !== 'test') {
    throw new ToolRejection('"asked" only goes with a practice test (kind "test") — leave it null');
  }
  if (a.kind === 'test') {
    if (a.asked) requireQuote(ctx, a.asked);
    else if (
      !(await practiceGoesWell(ctx.db, ctx.learnerId, { goalId: goal?.id ?? null, text: a.text }))
    ) {
      throw new ToolRejection(
        'a practice test is offered only once her practice on it is going well, and it is not yet (or she has hardly practised it). Unless she asked for a test herself (then put her words in "asked"), offer practice on it instead (kind "practice") and say a test makes sense once that sits.',
      );
    }
  }
  // One answer, one thing to tap. `prepare_practice` earlier in this same decision already made
  // the card she asked for; an offer beside it is a second button for the same wish — at best
  // redundant, and in the live run of 01.10. it was a refused one sitting under a reply that
  // said the practice was ready (issue #196; left open as a known gap when #184 landed). The
  // model gets the reason and answers again pointing at what it just prepared.
  if (ctx.created.preparedStepId) {
    throw new ToolRejection(
      'you already prepared practice in this same answer — that is the one thing she taps. Leave this offer out and say in your reply where the practice you prepared is.',
    );
  }
  // A clock only when she asked for one (issue #241). The minutes are one of a fixed list,
  // checked again here — the schema is what the model was shown, this is what holds — and the
  // words asking for it must be hers, from what she just wrote: a timer is never Buddy's idea,
  // and a background check, where she said nothing, can never set one. Prüfungsangst is the
  // reason a clock is not the default, so the floor is code, not a line in the prompt.
  let minutes: TestMinutes | null = null;
  if (a.time_limit) {
    if (a.kind !== 'test') {
      throw new ToolRejection(
        'a time limit only goes with a practice test (kind "test") — leave time_limit null here',
      );
    }
    const parsed = TestMinutes.safeParse(Number(a.time_limit.minutes));
    if (!parsed.success) {
      throw new ToolRejection(`a test runs ${TEST_MINUTES.join(', ')} minutes — pick one of them`);
    }
    requireQuote(ctx, a.time_limit.quote);
    minutes = parsed.data;
  }
  // The same offer twice is not a second thing she can tap — the first button is still there,
  // unstarted (issue #184). STATE says what stands, so this is the floor under the prompt, not
  // the rule itself: only an offer identical in every field it carries is refused, with the
  // reason, and the model answers again pointing at the one she already has.
  const standing = await loadStandingOffers(ctx.db, ctx.learnerId, ctx.now);
  const wanted = normalizeForMatch(a.text);
  if (
    standing.some(
      (o) =>
        o.kind === a.kind &&
        normalizeForMatch(o.text) === wanted &&
        o.goal_id === (goal?.id ?? null) &&
        o.difficulty === (a.difficulty ?? null) &&
        o.direction === (a.direction ?? null) &&
        (o.material_id ?? null) === (sheet?.id ?? null) &&
        o.minutes === minutes,
    )
  ) {
    throw new ToolRejection(
      'you already offered exactly this and its button is still standing, unstarted — leave this action out and tell her where it is instead',
    );
  }
  // Changes nothing: the learner starts it with a tap (the model never starts sessions).
  return {
    summary: {
      tool: 'offer_learning',
      kind: a.kind,
      text: a.text,
      goal_id: goal?.id ?? null,
      material_id: sheet?.id ?? null,
      // What she asked for beyond the topic; the tap hands it to the generator (issue #113).
      // A direction only ever reaches vocabulary pairs — other questions have none.
      difficulty: a.difficulty ?? null,
      direction: a.direction ?? null,
      // Only a test, and only on her wish (above); the tap hands it to the run (issue #241).
      minutes,
      // Nothing proves otherwise yet. The preparation that runs right after this (issue #48)
      // is what can take it back, by stamping `cannot_start_at` (issue #196).
      startable: true,
    },
    undo: null,
  };
}

/**
 * A Kopfrechnen round (issue #243). Like `offer_learning` it changes nothing — she starts it
 * with a tap — but everything it can carry is a value from a closed list, and code checks the
 * combination the model is not able to see in the schema alone: rows only for the tables,
 * carry only where crossing the ten exists. The title is the server's, in her language.
 */
export async function runOfferDrill(
  action: ActionOf<'offer_drill'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const parsed = DrillSpec.safeParse(action.args);
  if (!parsed.success) {
    throw new ToolRejection(
      `this range does not fit together (${parsed.error.issues.map((i) => i.message).join('; ')}) — rows only for times or divide, carry only for plus/minus within 20 or 100; leave the other null`,
    );
  }
  const spec = parsed.data;
  if (ctx.created.preparedStepId) {
    throw new ToolRejection(
      'you already prepared practice in this same answer — that is the one thing she taps. Leave this offer out.',
    );
  }
  return {
    summary: {
      tool: 'offer_drill',
      range: spec.range,
      rows: spec.rows ? [...spec.rows].sort((a, b) => a - b) : null,
      carry: spec.carry,
      title: titleOf(spec, ctx.locale),
    },
    undo: null,
  };
}
