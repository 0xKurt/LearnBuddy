// The scoring of the grade-10 eval (issue #298), kept apart from the live run so every rule of it
// is proven offline (`__tests__/grade10.test.ts`): what the judges are asked, how a verdict in two
// orders becomes one, what code measures itself, what counts as a weakness, which outputs a
// human checks, and how far the human and the judge agree.
//
// Three things are deliberately NOT left to a judge:
//   - LENGTH is counted (`wordCount`, the same count the app uses for its own short texts). The
//     judge says whether the length fits the need; the number is code's.
//   - The POSITION of an answer in a comparison is controlled: every pairwise judgement is asked
//     twice, Buddy first and Buddy second. Only a verdict that survives the swap counts; one that
//     flips is reported as position bias, never as a win or a loss.
//   - The HUMAN sample is drawn by a fixed rule, not picked: every case the judge flagged, plus a
//     seeded draw from the rest, so a reviewer sees the judge's failures AND its passes.
//
// requires live verification in Claude Code session (eval tooling; the live run needs the real model)

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { wordCount } from '../../src/modules/practice/brief.js';
import type { Grade10Case, Subject } from './cases.js';

// ─────────────── what the judges answer ───────────────

const Score = z.number().int().min(1).max(5);

/** One explanation against the rubric. Scores 1–5, 5 = a good teacher would sign it. */
export const RubricVerdict = z.object({
  correctness: Score.describe(
    'Subject correctness: 5 = nothing wrong or misleading; 3 = a slip that could mislead; 1 = a real error',
  ),
  errors: z
    .array(z.string().trim().min(1).max(200))
    .max(5)
    .describe('Every factual error or misleading statement, quoted or named; empty when none'),
  clarity: Score.describe(
    'Clarity for a 15/16-year-old in grade 10: one thought at a time, technical words explained, an example she can picture',
  ),
  curriculum: Score.describe(
    'Fit to the grade-10 curriculum place given: the notions, notation and depth that class uses — not primary school, not university',
  ),
  length_fits: Score.describe(
    'Length fits the need: 5 = as long as needed and no longer; 1 = far too long or cut short',
  ),
  why: z.string().trim().min(1).max(300).describe('One short German sentence: the main reason'),
});
export type RubricVerdict = z.infer<typeof RubricVerdict>;

/** Which of two explanations a 15/16-year-old learns more from. */
export const PairVerdict = z.object({
  better: z.enum(['A', 'B', 'tie']),
  why: z.string().trim().min(1).max(300),
});
export type PairVerdict = z.infer<typeof PairVerdict>;

export const RUBRIC_JUDGE = `You review an explanation a learning companion wrote for a 15/16-year-old in grade 10 (Germany), in a chat on a phone.
You get the curriculum place, what she asked, FACTS a correct explanation must not contradict, and PITFALLS (classic mistakes).
Judge this one explanation against the schema, as an experienced teacher of that subject would:
- correctness: is anything wrong, or stated so it would mislead her? A pitfall that appears is an error. Not mentioning a fact is not an error.
- clarity: can she follow it — one thought at a time, every technical word explained where it is used, an example she can picture?
- curriculum: does it use the notions, notation and depth of grade 10 at that place?
- length_fits: is it as long as the question needs — not padded, not cut short?
A friendly tone is expected and is not a criterion. Answer with the JSON object described by the schema.`;

export const PAIR_JUDGE = `You compare two explanations of the same question for a 15/16-year-old in grade 10 (Germany), in a chat on a phone.
Which one would she learn more from — correct, clear, at her level, no longer than needed? Answer "tie" when neither is clearly better.
The order in which they are shown means nothing. Answer with the JSON object described by the schema.`;

export function rubricPrompt(c: Grade10Case, explanation: string): string {
  return [
    `CURRICULUM: ${c.curriculum}`,
    `TOPIC: ${c.topic}`,
    `SHE ASKED: ${c.ask}`,
    'FACTS:',
    ...c.facts.map((f) => `- ${f}`),
    'PITFALLS:',
    ...c.pitfalls.map((p) => `- ${p}`),
    '',
    `EXPLANATION:\n${explanation}`,
  ].join('\n');
}

export function pairPrompt(c: Grade10Case, a: string, b: string): string {
  return [`TOPIC: ${c.topic}`, `SHE ASKED: ${c.ask}`, '', `A:\n${a}`, '', `B:\n${b}`].join('\n');
}

// ─────────────── the swap ───────────────

/** Buddy against the reference, from Buddy's side. */
export type PairOutcome = 'buddy' | 'reference' | 'tie' | 'position_bias';

/**
 * Two verdicts on the same pair, once with Buddy as A and once as B. They count only when they
 * agree; a verdict that follows the position instead of the content is position bias.
 */
export function swapOutcome(
  buddyFirst: PairVerdict['better'],
  buddySecond: PairVerdict['better'],
): PairOutcome {
  const first: PairOutcome =
    buddyFirst === 'A' ? 'buddy' : buddyFirst === 'B' ? 'reference' : 'tie';
  const second: PairOutcome =
    buddySecond === 'B' ? 'buddy' : buddySecond === 'A' ? 'reference' : 'tie';
  return first === second ? first : 'position_bias';
}

// ─────────────── what code measures ───────────────

/**
 * Words a chat explanation may have on a phone. The prompt says the length follows the need and
 * sets no cap (buddy prompt, "the one exception to brevity"), so this is a band, not a target:
 * under 30 words nothing is explained; over 250 is more than a minute of reading for a 15-year-old,
 * which on a phone is a wall.
 */
export const WORDS_MIN = 30;
export const WORDS_MAX = 250;

export type LengthBand = 'too_short' | 'ok' | 'too_long';

export function lengthBand(text: string): { words: number; band: LengthBand } {
  const words = wordCount(text);
  return { words, band: words < WORDS_MIN ? 'too_short' : words > WORDS_MAX ? 'too_long' : 'ok' };
}

// ─────────────── one case, all of it ───────────────

export type GuideResult =
  | { status: 'accepted'; lines: number; figure: boolean }
  | { status: 'rejected'; reason: string }
  | { status: 'error'; message: string };

export type CaseResult = {
  id: string;
  subject: Subject;
  topic: string;
  explanation: string;
  words: number;
  band: LengthBand;
  rubric: RubricVerdict | null;
  pair: PairOutcome | null;
  guide: GuideResult | null;
  /** What went wrong before anything could be judged (no answer, a model error). */
  failure: string | null;
};

/** The flags a case raises; empty = no finding. */
export function flagsOf(r: CaseResult): string[] {
  const flags: string[] = [];
  if (r.failure) flags.push(`keine Erklärung (${r.failure})`);
  if (r.rubric) {
    if (r.rubric.correctness <= 3 || r.rubric.errors.length > 0) flags.push('fachlich fragwürdig');
    if (r.rubric.clarity <= 3) flags.push('für 15/16-Jährige unklar');
    if (r.rubric.curriculum <= 3) flags.push('passt nicht zum Lehrplan Klasse 10');
    if (r.rubric.length_fits <= 2) flags.push('Länge passt nicht zur Frage');
  }
  if (r.band === 'too_long') flags.push(`zu lang (${r.words} Wörter)`);
  if (r.band === 'too_short' && !r.failure) flags.push(`zu kurz (${r.words} Wörter)`);
  if (r.pair === 'reference') flags.push('Lehrkraft-Referenz klar besser');
  if (r.guide?.status === 'rejected') flags.push(`Vormach-Plan verworfen (${r.guide.reason})`);
  if (r.guide?.status === 'error') flags.push('Vormach-Plan nicht erhalten');
  return flags;
}

export type Summary = {
  cases: number;
  judged: number;
  mean: { correctness: number; clarity: number; curriculum: number; length_fits: number } | null;
  /** Share of judged cases at 4 or 5, per criterion. */
  good: { correctness: number; clarity: number; curriculum: number; length_fits: number } | null;
  withErrors: number;
  length: Record<LengthBand, number>;
  pair: Record<PairOutcome, number>;
  guide: { asked: number; accepted: number; rejected: number; error: number };
  flagged: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const share = (xs: number[]) => (xs.length ? xs.filter((x) => x >= 4).length / xs.length : 0);

export function summarize(results: readonly CaseResult[]): Summary {
  const judged = results.flatMap((r) => (r.rubric ? [r.rubric] : []));
  const by = (k: 'correctness' | 'clarity' | 'curriculum' | 'length_fits') =>
    judged.map((j) => j[k]);
  const length: Record<LengthBand, number> = { too_short: 0, ok: 0, too_long: 0 };
  const pair: Record<PairOutcome, number> = { buddy: 0, reference: 0, tie: 0, position_bias: 0 };
  const guide = { asked: 0, accepted: 0, rejected: 0, error: 0 };
  for (const r of results) {
    if (!r.failure) length[r.band] += 1;
    if (r.pair) pair[r.pair] += 1;
    if (r.guide) {
      guide.asked += 1;
      guide[r.guide.status === 'accepted' ? 'accepted' : r.guide.status] += 1;
    }
  }
  return {
    cases: results.length,
    judged: judged.length,
    mean: judged.length
      ? {
          correctness: mean(by('correctness')),
          clarity: mean(by('clarity')),
          curriculum: mean(by('curriculum')),
          length_fits: mean(by('length_fits')),
        }
      : null,
    good: judged.length
      ? {
          correctness: share(by('correctness')),
          clarity: share(by('clarity')),
          curriculum: share(by('curriculum')),
          length_fits: share(by('length_fits')),
        }
      : null,
    withErrors: judged.filter((j) => j.errors.length > 0).length,
    length,
    pair,
    guide,
    flagged: results.filter((r) => flagsOf(r).length > 0).length,
  };
}

/** The concrete weaknesses: one line per flagged case, with what the judge or code saw. */
export function weaknesses(results: readonly CaseResult[]): string[] {
  return results.flatMap((r) => {
    const flags = flagsOf(r);
    if (flags.length === 0) return [];
    const detail = [
      ...(r.rubric?.errors ?? []).map((e) => `Fehler: ${e}`),
      ...(r.rubric ? [r.rubric.why] : []),
    ];
    return [
      `**${r.id}** (${r.topic}): ${flags.join('; ')}${detail.length ? ` — ${detail.join(' · ')}` : ''}`,
    ];
  });
}

// ─────────────── the human sample ───────────────

/** A stable number in [0, 1) for a case in a run: the same seed draws the same sample. */
function draw(seed: string, id: string): number {
  return createHash('sha256').update(`${seed}:${id}`).digest().readUInt32BE(0) / 2 ** 32;
}

/**
 * Which explanations a human reviews: every case the judge or code flagged, plus `extra` drawn
 * by the seed from the unflagged ones — so the reviewer also checks what the judge let pass.
 */
export function humanSample(
  results: readonly CaseResult[],
  seed: string,
  extra: number,
): CaseResult[] {
  const usable = results.filter((r) => r.rubric !== null);
  const flagged = usable.filter((r) => flagsOf(r).length > 0);
  const rest = usable
    .filter((r) => flagsOf(r).length === 0)
    .map((r) => ({ r, k: draw(seed, r.id) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, extra)
    .map((x) => x.r);
  const chosen = new Set([...flagged, ...rest].map((r) => r.id));
  return usable.filter((r) => chosen.has(r.id));
}

const HUMAN_FIELDS = ['correctness', 'clarity', 'curriculum', 'length_fits'] as const;
export type HumanField = (typeof HUMAN_FIELDS)[number];
export type HumanScores = Record<HumanField, number>;

/**
 * The sheet a teacher fills in: the question, the explanation, and four empty scores per case.
 * The judge's own scores are NOT on it — the reviewer must not be anchored by them.
 */
export function humanSheet(sample: readonly CaseResult[], cases: readonly Grade10Case[]): string {
  const out = [
    '# Klasse-10-Eval: Stichprobe für die menschliche Prüfung',
    '',
    'Bitte je Erklärung vier Werte von 1 bis 5 eintragen (5 = würde ich als Lehrkraft so unterschreiben).',
    'Die Werte des Modell-Richters stehen absichtlich nicht hier. Nur die Zahl hinter dem Doppelpunkt ändern.',
    '',
  ];
  for (const r of sample) {
    const c = cases.find((x) => x.id === r.id);
    out.push(
      `## ${r.id}`,
      '',
      `*Thema:* ${r.topic}${c ? ` · *Lehrplan:* ${c.curriculum}` : ''}`,
      '',
      `*Frage:* ${c?.ask ?? ''}`,
      '',
      ...r.explanation.split('\n').map((l) => `> ${l}`),
      '',
      ...HUMAN_FIELDS.map((f) => `- ${f}: _`),
      '- notiz: ',
      '',
    );
  }
  return `${out.join('\n')}\n`;
}

/** The filled-in sheet read back: case id → scores. A case with a missing or bad value is left out. */
export function readHumanSheet(md: string): Map<string, HumanScores> {
  const out = new Map<string, HumanScores>();
  for (const block of md.split(/^## /m).slice(1)) {
    const id = block.split('\n')[0]!.trim();
    const scores: Partial<HumanScores> = {};
    for (const f of HUMAN_FIELDS) {
      const m = new RegExp(`^- ${f}:\\s*([1-5])\\s*$`, 'm').exec(block);
      if (m) scores[f] = Number(m[1]);
    }
    if (HUMAN_FIELDS.every((f) => scores[f] !== undefined)) out.set(id, scores as HumanScores);
  }
  return out;
}

export type Agreement = {
  n: number;
  /** Same score. */
  exact: Record<HumanField, number>;
  /** At most one point apart. */
  withinOne: Record<HumanField, number>;
  /** Mean of judge − human: positive = the judge is more generous. */
  bias: Record<HumanField, number>;
};

/** How far the judge agrees with the human on the cases both scored. */
export function agreement(
  human: ReadonlyMap<string, HumanScores>,
  results: readonly CaseResult[],
): Agreement {
  const pairs = results.flatMap((r) => {
    const h = human.get(r.id);
    return h && r.rubric ? [{ h, j: r.rubric }] : [];
  });
  const per = (fn: (h: number, j: number) => number) =>
    Object.fromEntries(
      HUMAN_FIELDS.map((f) => [f, pairs.length ? mean(pairs.map((p) => fn(p.h[f], p.j[f]))) : 0]),
    ) as Record<HumanField, number>;
  return {
    n: pairs.length,
    exact: per((h, j) => (h === j ? 1 : 0)),
    withinOne: per((h, j) => (Math.abs(h - j) <= 1 ? 1 : 0)),
    bias: per((h, j) => j - h),
  };
}
