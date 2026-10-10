// „Erklär mal" (issue #236): open questions she answers by EXPLAINING — by voice or in writing —
// checked against 3–6 key points. docs/architecture.md §Practice („Erklär mal").
//
// The generator writes a question and its key points in a list of its own (`teach_back`, only in a
// teach_back run), the way it writes a Diktat's entries: the key points are the KEY of the
// question, so code holds them to their rules before they become one (Regel 0 of #224, "reject,
// never repair"). What survives is stored as an ordinary free-text question (`long`) whose rubric
// is made of `key_point` elements (contracts/rubric.ts) — and from there on the answer path of
// #211 judges it: one tutor call per answer, a point only with a quote from her own words that the
// server finds, the exact part of a point checked by code (`practice/rubric.ts`).
//
// The follow-up question of each point is written here, at generation time, and checked like a
// hint: it may ask for the point, never give it away. So the ONE follow-up she gets after a gap is
// prepared text chosen by code (the first point still missing), never something the model says in
// the moment — and it costs no second model call. In practice „Tipp" shows a point itself, one at a
// time as a model sentence, and asks for the next with its follow-up (Vormachen, #298,
// `pointSteps.ts`).
//
// The open part of a task in parts („Begründe …", issue #297, `taskParts.ts`) is the same question
// on a situation: its key points are held to the same rules here (`keyPointsProblem`) and stored
// the same way (`keyPointFields`), so it is judged by the one path above, not by a second one.

import {
  KEY_POINT_EXACT_MAX,
  KEY_POINTS_MAX,
  KEY_POINTS_MIN,
  type StoredRubric,
} from '@learnbuddy/shared-types/contracts';
import { normalizeShortAnswer } from '@learnbuddy/shared-math';
import { z } from 'zod';

import type { Db } from '../../lib/db.js';
import type { StoredItem } from './items.js';
import { says } from './rubric.js';

/** How many explanation questions one run asks: a short oral check, not a test. */
export const MAX_TEACH_BACK = 5;

export const KeyPointDraft = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .describe(
      'What this point is ABOUT, 1–3 words in the learner\'s language (e.g. the place, the starting substances). She sees it next to ✓ or "still missing", so it names the aspect and never states the content.',
    ),
  point: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .describe(
      'What a complete explanation says here, as one short, correct statement in her language. Her answer is checked against it, and when she is stuck Buddy shows it to her as a model sentence, one point at a time.',
    ),
  ask: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .describe(
      'ONE follow-up question to her for when this point is missing, the way a teacher asks in class, in her language. It asks FOR the point and never contains it.',
    ),
  exact: z
    .array(z.string().trim().min(1).max(40))
    .max(KEY_POINT_EXACT_MAX)
    .default([])
    .describe(
      'Only a number, formula or technical term this point cannot be stated without ("CO2", "100 °C"), written as she would say or type it. The server checks it stands in her explanation exactly. Empty for most points.',
    ),
});

export type KeyPointDraft = z.infer<typeof KeyPointDraft>;

export const TeachBackDraft = z.object({
  prompt: z
    .string()
    .trim()
    .min(10)
    .max(300)
    .describe(
      'An open question that asks her to explain something in her own words, in her language. It does not list what the answer has to contain.',
    ),
  topic: z.string().trim().min(1).max(60),
  difficulty: z.number().int().min(1).max(5),
  points: z.array(KeyPointDraft).min(KEY_POINTS_MIN).max(KEY_POINTS_MAX),
});
export type TeachBackDraft = z.infer<typeof TeachBackDraft>;

export const TEACH_BACK_RULES = `ERKLÄR MAL ("teach_back"): the learner wants to EXPLAIN in her own words, by voice or in writing, like an oral check at school — either to be quizzed with open questions on a topic or one of her sheets, or to explain one thing she names. Fill "teach_back" and nothing else: one question when she wants to explain one thing, otherwise 2–${MAX_TEACH_BACK} open questions, easy to harder. Each question gets ${KEY_POINTS_MIN}–${KEY_POINTS_MAX} key points: what a complete explanation at her grade has to contain, each a different idea, in the order a teacher would expect them. A point is never just the question again, and its follow-up question never gives it away. Only well-established knowledge at her level; when SHEET TEXT is given, ask only about what it covers and take every exact term from it. No grade, no model answer: the points are for checking, and when she is stuck Buddy shows one of them at a time as a model sentence.`;

/**
 * Why drafted key points cannot be asked for, or null when they hold (Regel 0: the whole question
 * goes, never a repaired one — a question with a point taken out would check her against a
 * different explanation than the one it asks for). `shown` is everything she reads while she
 * answers: the question, and for an open part the situation above it (#297). Every reason is
 * mechanical:
 *
 *   · two points with the same name or the same statement — two ticks for one idea;
 *   · a point what she reads already states — she would be "explaining" what she was told;
 *   · a follow-up that is no question (no "?"), or that contains its point or one of its exact
 *     terms — it would hand over what it asks for;
 *   · a name that contains an exact term — the name stands on screen while she answers;
 *   · an exact term that folds to nothing (it would be "found" in any text), or, for a run from her
 *     sheet, one that does not stand on that sheet.
 */
export function keyPointsProblem(
  drafted: readonly KeyPointDraft[],
  shown: string,
  sheet: string | null,
): string | null {
  const names = new Set<string>();
  const points = new Set<string>();
  for (const p of drafted) {
    const name = normalizeShortAnswer(p.name);
    const point = normalizeShortAnswer(p.point);
    if (name === '' || point === '') return 'empty point';
    if (names.has(name) || points.has(point)) return 'duplicate point';
    names.add(name);
    points.add(point);
    if (says(shown, p.point)) return 'point stated in the question';
    if (!p.ask.includes('?')) return 'follow-up is no question';
    if (says(p.ask, p.point)) return 'follow-up gives the point away';
    for (const x of p.exact) {
      if (normalizeShortAnswer(x) === '') return 'empty exact term';
      if (says(p.ask, x)) return 'follow-up gives an exact term away';
      if (says(p.name, x)) return 'name gives an exact term away';
      if (sheet !== null && !says(sheet, x)) return 'exact term not on her sheet';
    }
  }
  return null;
}

/**
 * What a question checked against key points stores beside its prompt: the points as its rubric,
 * their follow-ups as its prepared hints — the same for an explanation question and for the open
 * part of a task in parts (#297).
 */
export function keyPointFields(drafted: readonly KeyPointDraft[]) {
  const rubric: StoredRubric = {
    form: 'explanation',
    elements: drafted.map((p) => ({
      name: p.name,
      missing: p.ask,
      check: { by: 'key_point', point: p.point, exact: p.exact },
    })),
  };
  return {
    // What the tutor is shown as SOLUTION: the points, which it judges against — never shown to
    // her (a free text sends no solution, `sessionView.ts`, issue #197).
    answer: drafted.map((p) => p.point).join('; '),
    // The points are the whole key: no wording of hers is right by rule, past the points.
    accepted_answers: [],
    unit: null,
    // She explains, often by voice: how a word is spelled is not what is asked.
    spelling: 'gentle' as const,
    // The follow-up questions in order, at once and without a model: „Tipp" where no ladder runs
    // (homework help). In practice an explanation's ladder is its points (#298, `pointSteps.ts`).
    hints: drafted.slice(0, 3).map((p) => p.ask),
    // No worked solution: an explanation shows no model answer (#236).
    worked_solution: null,
    rubric,
  };
}

/**
 * The questions of a teach_back run that may be stored, in order. `sheet` is the text of the sheet
 * the run is about (or null): an exact term must stand on it.
 */
export function teachBackItems(
  drafts: readonly TeachBackDraft[],
  sheet: string | null,
): StoredItem[] {
  const out: StoredItem[] = [];
  const asked = new Set<string>();
  for (const d of drafts) {
    const key = normalizeShortAnswer(d.prompt);
    if (asked.has(key) || keyPointsProblem(d.points, d.prompt, sheet) !== null) continue;
    asked.add(key);
    out.push({
      kind: 'long',
      prompt: d.prompt,
      choices: null,
      correct_choice: null,
      topic: d.topic,
      difficulty: d.difficulty,
      prompt_lang: null,
      lang: null,
      figure: null,
      read: null,
      tolerance: null,
      source_excerpt: null,
      curriculum_point: null,
      ...keyPointFields(d.points),
    });
    if (out.length >= MAX_TEACH_BACK) break;
  }
  return out;
}

// ─────────────── her explanation, over the follow-ups ───────────────

/** Where her explanation of one question stands in this run (#236). */
export type ExplanationSoFar = {
  /** The key points already covered, each confirmed by a quote from her (server refs). */
  settled: string[];
  /** What she said before to this question in this run: her answer to a follow-up adds to it. */
  before: string[];
};

export const NOTHING_EXPLAINED: ExplanationSoFar = { settled: [], before: [] };

/**
 * Her explanation so far: the points `session_items.explained` holds (migration 0088) and her
 * earlier answers to this question. Her answer to "Und wo passiert das?" is "In den
 * Chloroplasten" — judged alone it would drop everything she said before; judged with it, a quote
 * may stand in any of her answers, and every one of them is hers.
 */
export async function explanationSoFar(
  db: Db,
  sessionId: string,
  itemId: string,
): Promise<ExplanationSoFar> {
  const si = await db.maybeOne<{ explained: string[] }>(
    `select explained from session_items where session_id = $1 and item_id = $2`,
    [sessionId, itemId],
  );
  const turns = await db.query<{ text: string }>(
    `select text from practice_turns
      where session_id = $1 and item_id = $2 and role = 'learner' order by seq`,
    [sessionId, itemId],
  );
  return { settled: si?.explained ?? [], before: turns.map((r) => r.text) };
}

/**
 * Adds the points this answer covered, in the answer's transaction. A union, so the order two
 * answers land in cannot take a point away — a point once confirmed stays confirmed (0088).
 */
export async function recordExplained(
  tx: Db,
  sessionId: string,
  itemId: string,
  refs: readonly string[],
): Promise<void> {
  if (refs.length === 0) return;
  await tx.query(
    `update session_items
        set explained = array(select distinct r from unnest(explained || $3::text[]) as r order by r)
      where session_id = $1 and item_id = $2`,
    [sessionId, itemId, refs],
  );
}
