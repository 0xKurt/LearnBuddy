// Does Buddy's essay feedback see what a teacher sees? (issue #258, Abnahme: an eval set of at
// least 20 texts per text type, agreement with a teacher documented before it goes live.)
//
// Sends every text of `cases.ts` through the real API to the live model — one essay call each,
// the call the app makes — and compares Buddy's state of every key point with the set's
// expectation (`score.ts`). The report is for a teacher to check: it has a column for the
// teacher's own judgement, which is what documents agreement with a teacher.
//
//   cd apps/api
//   LB_TEST_DATABASE_URL=postgres://… npx tsx evals/essay/run.ts   (the model of .env.local)
//   ESSAY_OUT=report.md   writes the report        ESSAY_ONLY=analyse   one text type
//   ESSAY_LIMIT=3         the first n cases of each type (a probe before the whole set)
//
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { writeFileSync } from 'node:fs';

import { config as loadDotenv } from 'dotenv';

import { loadConfig } from '../../src/config.js';
import { ESSAY_PROMPT_VERSION } from '../../src/modules/practice/essay.js';
import { llmGateway } from '../../src/production.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { ESSAY_CASES, type EssayCase } from './cases.js';
import { runCase } from './runCase.js';
import { report, setProblems, summarize, type CaseResult } from './score.js';

loadDotenv({ path: '.env.local' });

function chosen(): EssayCase[] {
  const only = process.env.ESSAY_ONLY;
  const limit = Number(process.env.ESSAY_LIMIT ?? Infinity);
  const seen = new Map<string, number>();
  return ESSAY_CASES.filter((c) => {
    if (only && c.type !== only) return false;
    const n = (seen.get(c.type) ?? 0) + 1;
    seen.set(c.type, n);
    return n <= limit;
  });
}

async function main(): Promise<void> {
  const problems = setProblems(ESSAY_CASES);
  if (problems.length) throw new Error(`the set is not sound:\n${problems.join('\n')}`);
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused/unused',
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
  });
  if (config.LLM_BACKEND === 'disabled')
    throw new Error('a model backend is required (LLM_BACKEND)');
  if (!(await testDatabaseAvailable())) throw new Error('a local Postgres is required');
  // The production model, whichever provider it is (`llmGateway`): the call the app makes.
  const gateway = llmGateway(config);

  const cases = chosen();
  // A run of no case would report 0/0 as if it had measured something.
  if (cases.length === 0) throw new Error('no case chosen (ESSAY_ONLY / ESSAY_LIMIT)');
  const results: CaseResult[] = [];
  let costMicros = 0;
  for (const c of cases) {
    // One learner per case: an essay's three versions and the daily allowance stay apart.
    const env = await createTestEnv({ start: '2026-10-15T15:00:00Z', gateway });
    try {
      const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-03-10' });
      const r = await runCase(env, l, c);
      results.push(r);
      const cost = await env.db.one<{ micros: string | null }>(
        `select sum(cost_micros)::text as micros from llm_calls where learner_id = $1`,
        [l.learnerId],
      );
      costMicros += Number(cost.micros ?? 0);
      const off = summarize([r]).all;
      console.log(
        `${off.agree === off.total ? '✓' : '✗'} ${c.id}: ${off.agree}/${off.total}${r.feedback ? '' : ` (${r.error ?? 'help answer'})`}`,
      );
    } finally {
      await env.close();
    }
  }

  const s = summarize(results);
  const title = `Aufsatz-Eval (live, ${ESSAY_PROMPT_VERSION}, ${new Date().toISOString().slice(0, 16)})`;
  if (process.env.ESSAY_OUT) writeFileSync(process.env.ESSAY_OUT, report(results, { title }));
  console.log(
    `\nKernpunkte übereinstimmend: ${s.all.agree}/${s.all.total} · fälschlich erfüllt ${s.all.falseMet} · fälschlich offen ${s.all.missedMet} · ohne Rückmeldung ${s.noFeedback} · Hilfe-Antwort ${s.safeguarded}`,
  );
  console.log(`Kosten: ${(costMicros / 1e6).toFixed(4)} USD für ${results.length} Texte`);
  process.exitCode = s.all.agree === s.all.total && s.noFeedback === 0 ? 0 : 1;
}

void main();
