// requires live verification in Claude Code session (paid fixed regressions; isolated database)
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../../src/config.js';
import { OpenAIGateway } from '../../src/llm/openai.js';
import { registerLearning } from '../../src/modules/learning/register.js';
import { buddyPrompt } from '../../src/modules/buddy/prompts.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { OWNER } from './cases.js';
import { home, say, tap, tick, history, visibleOffers, type Tap, type Turn } from './driver.js';
import { inspect, goalProblems, type Finding } from './checks.js';
import { Budget } from './budget.js';
import { appendBudgetLedger } from './ledger.js';

registerLearning();
if (process.env.LB_TEST_LOCK_HELD !== '1') throw new Error('Source scripts/test-lock.sh first');
if (process.env.LB_TEST_DATABASE_URL !== 'postgres://postgres@127.0.0.1:54316/postgres')
  throw new Error('Only the shared local test Postgres is allowed');
const budget = new Budget(Number(process.env.EXPLORE_MAX_USD ?? 3));
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => budget.stop(`interrupted: ${signal}`));
const config = loadConfig({
  ...process.env,
  LLM_BACKEND: 'openai',
  OPENAI_MODEL_SMART: 'gpt-5.4-mini',
  OPENAI_MODEL_FAST: 'gpt-5.4-mini',
  OPENAI_ROUTES: '{}',
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const gateway = budget.wrap(new OpenAIGateway(config));
const results: unknown[] = [];
let failed = false;
const report = process.env.EXPLORE_REPORT ?? '../../docs/measurements/explore/owner-main.json';
mkdirSync(report.slice(0, report.lastIndexOf('/')), { recursive: true });
budget.onChange = () =>
  writeFileSync(
    `${report}.budget.json`,
    JSON.stringify(
      {
        spentUsd: budget.spent,
        reservedUsd: budget.reservedUsd,
        receipts: budget.receipts,
      },
      null,
      2,
    ),
  );
try {
  for (const goal of OWNER.filter(
    (g) => !process.argv.slice(2).length || process.argv.slice(2).includes(g.id),
  )) {
    const env = await createTestEnv({ gateway, start: '2026-10-24T10:00:00Z' });
    try {
      const l = await onboard(env, {
        relation: 'child',
        birthDate: '2014-03-10',
        pin: '4826',
        contact: goal.expect === 'reminder' ? 'yes' : 'no',
      });
      const turns: Turn[] = [];
      const taps: Tap[] = [];
      const problems: Finding[] = [];
      for (const text of goal.messages) {
        turns.push(await say(env, l, text));
        problems.push(...(await inspect(env, l, turns.slice(-1), buddyPrompt().turnSystem)));
      }
      if (goal.expect === 'reminder') await tick(env);
      for (const action of visibleOffers((await home(l)).thread)) taps.push(await tap(l, action));
      const messages = await history(env, l);
      const items = await env.db.query<{
        kind: string;
        prompt: string;
        answer: string;
        prompt_lang: string | null;
        lang: string | null;
      }>('select kind, prompt, answer, prompt_lang, lang from items where learner_id = $1', [
        l.learnerId,
      ]);
      problems.push(...goalProblems(goal, messages, taps, items));
      if (turns.some((t) => t.status !== 'done'))
        problems.push({
          invariant: 'goal.turn-completed',
          evidence: JSON.stringify(turns.map((t) => [t.status, t.code])),
          kind: goal.expect,
          route: '/buddy/messages',
          category: 'app',
        });
      results.push({ goal, turns, messages, taps, items, problems });
      failed ||= problems.length > 0;
      console.info(
        `${problems.length ? 'RED' : 'GREEN'} ${goal.id}: ${problems.map((p) => p.invariant).join(', ') || 'all predicates pass'}`,
      );
    } finally {
      await env.close();
    }
  }
} finally {
  writeFileSync(
    report,
    JSON.stringify(
      {
        build: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        results,
        costUpperUsd: budget.spent,
        receipts: budget.receipts,
      },
      null,
      2,
    ),
  );
  appendBudgetLedger(
    `\n2026-10-24 | child-explorer | #944 | ${budget.receipts.length} | ${budget.spent.toFixed(6)} USD upper | owner regressions\n`,
  );
  console.info(`Report: ${report}; cost ceiling $${budget.spent.toFixed(4)}`);
}
process.exitCode = failed ? 1 : 0;
