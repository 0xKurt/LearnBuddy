// Questions as the model writes them (from a photo, a topic, a typed list or
// homework), validated and stored. docs/architecture.md §Practice.
//
// One shape for every source, so practice, the tutor and FSRS treat them the
// same. The model writes data; the server checks every item on its own and
// drops broken ones instead of "repairing" them. A vocabulary pair becomes two
// questions (both directions), each with its own FSRS state.

import { Figure } from '@learnbuddy/shared-types/contracts';
import { compileExpression } from '@learnbuddy/shared-math';
import { z } from 'zod';

import type { Db } from '../../lib/db.js';

export const MATH_RULES = `Math (also in choices, answers and accepted_answers): write it between dollar signs in this LaTeX subset only: \\frac{a}{b}, x^{2}, x_{1}, \\sqrt{x}, \\cdot, \\times, \\div, \\pi, \\le, \\ge, \\ne, \\approx, \\degree, \\pm. Example: "Kürze $\\frac{6}{8}$." Plain numbers and words stay outside the dollar signs.`;

export const FIGURE_RULES = `Figures: add "figure" only when a question needs one (a fraction to see, a number line, a function graph, a bar chart, a geometric figure, a table) — as data, the app draws it. function_plot expressions use x, numbers, + - * / ^, sqrt, abs, sin, cos, tan, ln, log, exp, pi (e.g. "0.5*x^2-2"). Otherwise figure is null.`;

export const ItemDraft = z.object({
  kind: z
    .enum(['short', 'long', 'numeric', 'multiple_choice', 'formula', 'vocab', 'speak'])
    .describe(
      'vocab: prompt = word/phrase in prompt_lang, answer = translation in lang · speak: prompt = what to say aloud in lang',
    ),
  prompt: z.string().trim().min(1).max(600),
  answer: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe('The correct answer (speak: the same text as prompt)'),
  accepted_answers: z.array(z.string().trim().min(1).max(200)).max(6),
  unit: z.string().trim().max(20).nullable(),
  choices: z.array(z.string().trim().min(1).max(200)).max(6).nullable(),
  correct_choice: z.number().int().min(0).max(5).nullable(),
  topic: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .nullable()
    .describe('2–4 word topic shared by related questions'),
  difficulty: z.number().int().min(1).max(5),
  prompt_lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .default(null)
    .describe('vocab: ISO 639-1 language of the prompt, else null'),
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .default(null)
    .describe('vocab: language of the answer; speak: language to say it in; else null'),
  figure: Figure.nullable().default(null),
  source_excerpt: z.string().trim().max(300).nullable(),
});
export type ItemDraft = z.infer<typeof ItemDraft>;

/** A figure the app can really draw, or null (a broken figure never costs the question). */
function usableFigure(f: ItemDraft['figure']): ItemDraft['figure'] {
  if (!f) return null;
  switch (f.type) {
    case 'function_plot': {
      const functions = f.functions.filter((fn) => compileExpression(fn.expr) !== null);
      if (f.x_min >= f.x_max || f.y_min >= f.y_max) return null;
      if (functions.length === 0 && f.points.length === 0) return null;
      return { ...f, functions };
    }
    case 'number_line':
      if (f.min >= f.max || (f.max - f.min) / f.step > 40) return null;
      return f;
    case 'fraction':
      return f.fractions.every((x) => x.filled <= x.parts) ? f : null;
    case 'geometry': {
      const names = new Set(f.points.map((p) => p.name));
      const known = (n: string) => names.has(n);
      return {
        ...f,
        segments: f.segments.filter((sg) => known(sg.from) && known(sg.to)),
        polygons: f.polygons.filter((poly) => poly.every(known)),
        circles: f.circles.filter((c) => known(c.center)),
      };
    }
    case 'table':
      return f.rows.every((r) => r.length === f.header.length) ? f : null;
    default:
      return f;
  }
}

/** LaTeX the model forgot to put between dollar signs: the whole text is math then. */
function dollarMath(text: string): string {
  if (text.includes('$') || !/\\(frac|sqrt|cdot|times|div|pi|le|ge|ne|approx)\b|\^\{/.test(text))
    return text;
  return `$${text}$`;
}

/** Keep only items whose shape is consistent; returns them normalised. */
export function usableItems(items: ItemDraft[]): ItemDraft[] {
  const out: ItemDraft[] = [];
  for (const raw of items) {
    const it = {
      ...raw,
      prompt: dollarMath(raw.prompt),
      answer: dollarMath(raw.answer),
      accepted_answers: raw.accepted_answers.map(dollarMath),
      choices: raw.choices ? raw.choices.map(dollarMath) : null,
      figure: usableFigure(raw.figure),
    };
    if (it.kind === 'multiple_choice') {
      if (!it.choices || it.choices.length < 2 || it.correct_choice === null) continue;
      if (it.correct_choice >= it.choices.length) continue;
      out.push(it);
      continue;
    }
    const plain = { ...it, choices: null, correct_choice: null };
    if (it.kind === 'vocab') {
      if (!it.lang || !it.prompt_lang || it.lang === it.prompt_lang) continue;
      out.push(plain);
      continue;
    }
    if (it.kind === 'speak') {
      if (!it.lang) continue;
      out.push({ ...plain, answer: it.prompt, prompt_lang: null });
      continue;
    }
    out.push({ ...plain, lang: null, prompt_lang: null });
  }
  return out;
}

export type ItemSource = {
  learnerId: string;
  materialId: string | null;
  subjectId: string | null;
  origin: 'material' | 'buddy' | 'typed' | 'homework';
};

/** Stores the items (a vocabulary pair in both directions) and returns their ids in order. */
export async function insertItems(db: Db, src: ItemSource, items: ItemDraft[]): Promise<string[]> {
  const ids: string[] = [];
  const insert = async (it: ItemDraft) => {
    const row = await db.one<{ id: string }>(
      `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, accepted_answers, unit,
                          choices, correct_choice, topic, difficulty, source_excerpt, origin, lang, prompt_lang, figure)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
      [
        src.learnerId,
        src.materialId,
        src.subjectId,
        it.kind,
        it.prompt,
        it.answer,
        it.accepted_answers,
        it.unit,
        it.choices,
        it.correct_choice,
        it.topic,
        it.difficulty,
        it.source_excerpt,
        src.origin,
        it.lang,
        it.prompt_lang,
        it.figure ? JSON.stringify(it.figure) : null,
      ],
    );
    ids.push(row.id);
  };
  for (const it of items) {
    await insert(it);
    if (it.kind === 'vocab' && it.lang && it.prompt_lang) {
      // The other direction; its alternatives are unknown, the tutor judges variants.
      await insert({
        ...it,
        prompt: it.answer,
        answer: it.prompt,
        accepted_answers: [],
        prompt_lang: it.lang,
        lang: it.prompt_lang,
      });
    }
  }
  return ids;
}
