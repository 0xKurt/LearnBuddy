// The grade-10 eval (issue #298, docs/evals/klasse10.md): how well does Buddy TEACH real Klasse-10
// material — and can the real model write a guided-example plan that code accepts?
//
// For every case in `cases.ts`:
//   1. A fresh grade-10 learner (16, Berlin) asks her question through the real turn
//      (POST /buddy/messages) on a throwaway database — same prompt, schema and temperature as in
//      production.
//   2. A judge model scores the answer against the case's facts and pitfalls (`score.ts`).
//   3. The same judge compares it with the teacher reference, ONCE IN EACH ORDER; a verdict that
//      flips with the order is counted as position bias, not as a result.
//   4. Code counts the words.
//   5. Where the case has a task, the real model writes a guided-example plan and code checks it
//      exactly as in the app (`planGuide`): accepted, or rejected with the reason.
// Then the report (numbers, every case, the weaknesses, every explanation) and a sheet for a human
// sample: every flagged case plus a seeded draw from the rest. A filled-in sheet is read back with
// GRADE10_HUMAN and turned into agreement numbers — without a new model run (GRADE10_FROM).
//
//   cd apps/api
//   LLM_BACKEND=vertex pnpm eval:grade10                      (all cases)
//   LLM_BACKEND=vertex pnpm eval:grade10 m-quadratisch c-redox (some)
//   GRADE10_FROM=out.json GRADE10_HUMAN=bogen.md pnpm eval:grade10   (report again, with the human)
//
// GRADE10_OUT (report, default ../../docs/evals/klasse10-<date>.md), GRADE10_JSON (raw results),
// GRADE10_SHEET (human sheet), GRADE10_SEED (sample seed, default the date), GRADE10_EXTRA
// (unflagged cases in the sample, default 3).
//
// requires live verification in Claude Code session (live model; throwaway Postgres per case)

import { readFileSync, writeFileSync } from 'node:fs';

import { config as loadDotenv } from 'dotenv';

import { loadConfig } from '../../src/config.js';
import { localParts } from '../../src/lib/time.js';
import { toJsonSchema } from '../../src/llm/json-schema.js';
import type { LlmGateway } from '../../src/llm/gateway.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { BUDDY_PROMPT_VERSION } from '../../src/modules/buddy/prompts.js';
import {
  GUIDE_PROMPT_VERSION,
  planGuide,
  type PlanItem,
} from '../../src/modules/practice/guide.js';
import type { PracticeLearner } from '../../src/modules/practice/service.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { CASES, type Grade10Case } from './cases.js';
import { renderReport, type RunInfo } from './report.js';
import {
  agreement,
  humanSample,
  humanSheet,
  lengthBand,
  PAIR_JUDGE,
  pairPrompt,
  PairVerdict,
  readHumanSheet,
  RUBRIC_JUDGE,
  rubricPrompt,
  RubricVerdict,
  swapOutcome,
  type CaseResult,
  type GuideResult,
} from './score.js';

loadDotenv({ path: '.env.local' });

const RUBRIC_SCHEMA = toJsonSchema(RubricVerdict);
const PAIR_SCHEMA = toJsonSchema(PairVerdict);
const JUDGE_VERSION = 'grade10-judge.v1';

async function judgeRubric(llm: LlmGateway, c: Grade10Case, text: string): Promise<RubricVerdict> {
  const r = await llm.generate({
    purpose: 'buddy_check',
    tier: 'smart',
    promptVersion: JUDGE_VERSION,
    system: RUBRIC_JUDGE,
    contents: [{ role: 'user', parts: [{ text: rubricPrompt(c, text) }] }],
    schema: RUBRIC_SCHEMA,
    maxOutputTokens: 800,
    temperature: 0,
    timeoutMs: 60_000,
    thinkingBudget: 1024,
  });
  return RubricVerdict.parse(r.json);
}

async function judgePair(llm: LlmGateway, c: Grade10Case, a: string, b: string) {
  const r = await llm.generate({
    purpose: 'buddy_check',
    tier: 'smart',
    promptVersion: JUDGE_VERSION,
    system: PAIR_JUDGE,
    contents: [{ role: 'user', parts: [{ text: pairPrompt(c, a, b) }] }],
    schema: PAIR_SCHEMA,
    maxOutputTokens: 400,
    temperature: 0,
    timeoutMs: 60_000,
    thinkingBudget: 0,
  });
  return PairVerdict.parse(r.json).better;
}

async function runCase(llm: LlmGateway, c: Grade10Case): Promise<CaseResult> {
  const base = { id: c.id, subject: c.subject, topic: c.topic };
  const env = await createTestEnv({ start: '2026-10-05T15:00:00Z', gateway: llm });
  try {
    const l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2010-05-04' });
    // Grade 10 — what the curriculum place in every case assumes.
    await env.db.query(`update learners set level = 'school', grade = 10 where id = $1`, [
      l.learnerId,
    ]);
    await l.api.post('/buddy/messages', { client_message_id: crypto.randomUUID(), text: c.ask });
    const reply = await env.db.maybeOne<{ text: string }>(
      `select text from buddy_messages where learner_id = $1 and role = 'buddy' order by seq desc limit 1`,
      [l.learnerId],
    );
    const explanation = reply?.text?.trim() ?? '';
    const { words, band } = lengthBand(explanation);

    let guide: GuideResult | null = null;
    if (c.task) {
      const learner = await env.db.one<PracticeLearner>(
        `select id, display_name, locale, level, grade, birth_date::text as birth_date, curriculum_region
           from learners where id = $1`,
        [l.learnerId],
      );
      const item: PlanItem = {
        kind: c.task.kind,
        prompt: c.task.prompt,
        answer: c.task.answer,
        accepted_answers: [],
        unit: c.task.unit,
        choices: null,
        correct_choice: null,
        tolerance: null,
        spelling: null,
        subject_kind:
          c.subject === 'mathe' ? 'math' : c.subject === 'physik' ? 'physics' : 'chemistry',
        bar_task: null,
        staff_task: null,
        parts_task: null,
        listen_task: null,
        rubric: null,
        extracted_text: null,
      };
      try {
        const planned = await planGuide(
          env.deps,
          learner,
          item,
          c.task.kind === 'long' ? 'points' : 'steps',
          localParts(env.clock.now(), 'Europe/Berlin').date,
        );
        guide = planned.ok
          ? {
              status: 'accepted',
              lines:
                planned.plan.kind === 'steps'
                  ? planned.plan.lines.length
                  : planned.plan.points.length,
              figure: planned.plan.figure !== null,
            }
          : { status: 'rejected', reason: planned.reason };
      } catch (err) {
        guide = { status: 'error', message: err instanceof Error ? err.message : String(err) };
      }
    }

    if (!explanation) {
      return {
        ...base,
        explanation,
        words,
        band,
        rubric: null,
        pair: null,
        guide,
        failure: 'keine Antwort',
      };
    }
    const rubric = await judgeRubric(llm, c, explanation);
    const first = await judgePair(llm, c, explanation, c.reference);
    const second = await judgePair(llm, c, c.reference, explanation);
    return {
      ...base,
      explanation,
      words,
      band,
      rubric,
      pair: swapOutcome(first, second),
      guide,
      failure: null,
    };
  } catch (err) {
    return {
      ...base,
      explanation: '',
      words: 0,
      band: 'too_short',
      rubric: null,
      pair: null,
      guide: null,
      failure: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await env.close();
  }
}

async function main(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const out = process.env.GRADE10_OUT ?? `../../docs/evals/klasse10-${day}.md`;
  const seed = process.env.GRADE10_SEED ?? day;
  const extra = Number(process.env.GRADE10_EXTRA ?? '3');
  const from = process.env.GRADE10_FROM;

  let info: RunInfo;
  let results: CaseResult[];
  if (from) {
    // Report again from a saved run — to add the human sheet without paying for the model again.
    const saved = JSON.parse(readFileSync(from, 'utf8')) as {
      info: RunInfo;
      results: CaseResult[];
    };
    info = saved.info;
    results = saved.results;
  } else {
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused/unused',
      SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
      ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
    });
    if (config.LLM_BACKEND !== 'vertex') {
      throw new Error('Set LLM_BACKEND=vertex and the Vertex variables (docs/SETUP-VERTEX.md)');
    }
    if (!(await testDatabaseAvailable()))
      throw new Error('No local Postgres (LB_TEST_DATABASE_URL)');
    const llm = new VertexGateway(config);
    const only = process.argv.slice(2);
    const cases = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;
    results = [];
    for (const c of cases) {
      const r = await runCase(llm, c);
      results.push(r);
      console.log(
        `${r.failure ? '✗' : '·'} ${r.id}: ${r.rubric ? `${r.rubric.correctness}/${r.rubric.clarity}/${r.rubric.curriculum}/${r.rubric.length_fits}` : r.failure} · ${r.words} Wörter · ${r.pair ?? '–'} · Plan ${r.guide?.status ?? '–'}`,
      );
    }
    info = {
      at: new Date().toISOString(),
      model: config.VERTEX_MODEL_SMART,
      judgeModel: config.VERTEX_MODEL_SMART,
      prompts: { buddy: BUDDY_PROMPT_VERSION, guide: GUIDE_PROMPT_VERSION, judge: JUDGE_VERSION },
      seed,
    };
    if (process.env.GRADE10_JSON) {
      writeFileSync(process.env.GRADE10_JSON, `${JSON.stringify({ info, results }, null, 2)}\n`);
    }
  }

  const human = process.env.GRADE10_HUMAN
    ? readHumanSheet(readFileSync(process.env.GRADE10_HUMAN, 'utf8'))
    : null;
  writeFileSync(out, renderReport(info, results, human ? agreement(human, results) : null));
  const sheet = process.env.GRADE10_SHEET ?? out.replace(/\.md$/, '-stichprobe.md');
  writeFileSync(sheet, humanSheet(humanSample(results, seed, extra), CASES));
  console.log(`\nBericht: ${out}\nStichprobe: ${sheet}`);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
