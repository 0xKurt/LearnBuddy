// Shared distress check comparison (#879). Controls are paired fast/smart; original distress
// cases run once on fast through the practice endpoint. Only the safeguard call is live.
// Run under scripts/test-lock.sh, with the shared LB_TEST_DATABASE_URL and .env.local:
//   cd apps/api && pnpm exec tsx evals/tutor/safeguarding.ts
// Every call is logged before/after in the agent budget ledger; total gross ceiling $1.00.
// requires live verification in Claude Code session (scripted task, real model and Postgres)

import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { config as dotenv } from 'dotenv';

import { loadConfig } from '../../src/config.js';
import { safeguardingText } from '../../src/i18n/safeguarding.js';
import { LlmError, type LlmGateway, type LlmUsage } from '../../src/llm/gateway.js';
import { modelFor } from '../../src/llm/vertex.js';
import { llmGateway } from '../../src/production.js';
import { distressCheck, type DistressFinding } from '../../src/modules/buddy/distress.js';
import { ScriptedGateway } from '../../src/testing/fakes.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import '../../src/testing/domain.js';
import { comparisonPlan, summarize, type Measurement, type Trial } from './safeguardingCompare.js';
import { SAFEGUARDING_CASES } from './safeguardingCorpus.js';

dotenv({ path: '.env.local' });
assert.equal(process.env.LB_TEST_LOCK_HELD, '1', 'Take the machine test lock first');
const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
assert.notEqual(config.LLM_BACKEND, 'disabled');
// An explicit deployment route must not silently send this experiment to the smart model.
config.VERTEX_ROUTES = {};
config.OPENAI_ROUTES = {};
const real = llmGateway(config);
const scripted = new ScriptedGateway();
const ledger = join(homedir(), '.local/share/learnbuddy-agents/BUDGET-LEDGER.md');
let call = 0;
let chargedMicros = 0;
const plan = comparisonPlan(SAFEGUARDING_CASES);
let current: Trial = plan[0]!;
const results: Measurement[] = [];
const output = process.env.SAFEGUARDING_OUT ?? '../../.cache/safeguarding';
mkdirSync(output, { recursive: true });
const startedAt = new Date().toISOString();
const traceFile = join(output, `safeguarding-${startedAt.replaceAll(':', '-')}.jsonl`);
const attemptReserveMicros = 20_000;
const reserveMicros = 3 * attemptReserveMicros; // up to three provider attempts
const ceilingMicros = 1_000_000;
const log = (phase: string, usd: string, detail: string) =>
  appendFileSync(
    ledger,
    `| ${new Date().toISOString()} | distress-879 | #879 | ${phase} call ${call} | ${usd} | ${current.c.id}/${current.tier}: ${detail} |\n`,
  );
const gateway: LlmGateway = {
  available: true,
  profile: real.profile,
  generate: async (req) => {
    if (req.purpose !== 'safeguard') return scripted.generate(req);
    assert(chargedMicros + reserveMicros <= ceilingMicros, '$1.00 gross budget exhausted');
    assert.equal(req.maxOutputTokens, 64);
    assert.equal(req.thinking, 'off');
    assert(JSON.stringify(req).length < 4_000, 'Unexpectedly large check');
    call++;
    // Evaluation-only override: the request, prompt, schema and limits stay identical.
    const sent = { ...req, tier: current.tier };
    const model =
      config.LLM_BACKEND === 'openai'
        ? sent.tier === 'fast'
          ? config.OPENAI_MODEL_FAST
          : config.OPENAI_MODEL_SMART
        : modelFor(config, sent);
    log('before', 'reserve gross 0.060000', `evals/tutor safeguarding on ${model}`);
    let usage: LlmUsage | null = null;
    let outcome = 'ok';
    let attempts = 1;
    let json: unknown = null;
    try {
      const result = await real.generate(sent);
      json = result.json;
      usage = result.usage;
      attempts = result.attempts ?? 1;
      return result;
    } catch (err) {
      outcome = err instanceof LlmError ? err.kind : 'error';
      usage = err instanceof LlmError ? err.usage : null;
      attempts = err instanceof LlmError ? err.attempts : 1;
      throw err;
    } finally {
      // 3.6's table uses net promotional prices; charge twice that before any credit.
      // Failed earlier attempts have no usage in the gateway result: reserve them too.
      const cost =
        (usage
          ? usage.costMicros * (config.LLM_BACKEND === 'vertex' && current.tier === 'smart' ? 2 : 1)
          : attemptReserveMicros) +
        (attempts - 1) * attemptReserveMicros;
      chargedMicros += cost;
      log(
        'after',
        (cost / 1e6).toFixed(6),
        `${model}; ${outcome}; attempts=${attempts}; ${usage ? 'metered gross' : 'reserved: no usage'}; total gross ceiling charged $${(chargedMicros / 1e6).toFixed(6)}`,
      );
      appendFileSync(
        traceFile,
        `${JSON.stringify({
          call,
          id: current.c.id,
          tier: current.tier,
          model,
          request: sent,
          json,
          outcome,
          attempts,
          usage,
          grossCeilingMicros: cost,
        })}\n`,
      );
    }
  },
};

const env = await createTestEnv({ start: '2026-10-04T15:00:00Z', gateway });
try {
  for (const trial of plan) {
    current = trial;
    const { c, tier } = trial;
    const l = await onboard(env, {
      locale: c.locale,
      relation: 'child',
      birthDate: '2014-02-10',
    });
    if (!c.dictation) {
      const before = call;
      const finding = await distressCheck(env.deps, l.learnerId, c.says, {
        ...(c.question ? { question: c.question } : {}),
        ...(c.surface === 'roleplay' ? { scene: true } : {}),
      });
      assert.equal(call - before, 1, `${c.id}: exactly one live distress check`);
      results.push({ c, tier, finding, pathValid: true });
      console.info(`${c.id}/${tier}: ${finding}`);
      continue;
    }
    scripted.script('explain', {
      json: {
        usable: true,
        title: 'Lernwörter',
        subject: { name: 'Deutsch', kind: 'german' },
        items: [],
        dictation: {
          from: 'topic',
          lang: 'de',
          topic: 'Lernwörter',
          entries: ['Schwimmen', 'Biene', 'Straße'],
        },
      },
    });
    const s = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: crypto.randomUUID(),
      kind: 'spelling_dictation',
      text: 'Lernwörter',
    });
    assert.equal(s.status, 201, `${c.id}: task creation ${JSON.stringify(s.body)}`);
    await env.flushBackground();
    const item = s.body.items[0]!.item;
    const before = call;
    const result = await l.api.post<AnswerResponse>(`/practice/sessions/${s.body.id}/answer`, {
      client_turn_id: crypto.randomUUID(),
      item_id: item.id,
      via: 'typed',
      text: c.says,
    });
    assert.equal(
      call - before,
      1,
      `${c.id}: exactly one live distress check; HTTP ${result.status}`,
    );
    const reply = result.body.reply?.text;
    const concernText = safeguardingText(c.locale, true, 'concern');
    const blockedText = safeguardingText(c.locale, true, 'blocked');
    const help = reply === concernText || reply === blockedText;
    const stored = await env.db.one<{ text: string }>(
      `select text from practice_turns where session_id = $1 and role = 'tutor' order by seq desc limit 1`,
      [s.body.id],
    );
    const finding: DistressFinding =
      reply === blockedText
        ? 'blocked'
        : reply === concernText
          ? 'concern'
          : reply.includes(safeguardingText(c.locale, true, 'unchecked'))
            ? 'unchecked'
            : 'clear';
    const pathValid =
      result.status === 200 &&
      stored.text === reply &&
      result.body.verdict === (help ? 'not_an_attempt' : 'incorrect') &&
      result.body.session.items[0]?.attempts === (help ? 0 : 1) &&
      !reply.includes(safeguardingText(c.locale, true, 'unchecked'));
    results.push({ c, tier, finding, pathValid });
    console.info(`${c.id}/${tier}: ${finding}; practice path ${pathValid ? 'ok' : 'FAILED'}`);
  }
  const summary = summarize(results, plan);
  console.info(
    JSON.stringify({ ...summary, calls: call, grossCeilingUsd: chargedMicros / 1e6 }, null, 2),
  );
  process.exitCode = summary.keepFast ? 0 : 1;
} finally {
  writeFileSync(
    join(output, 'safeguarding-report.json'),
    JSON.stringify(
      {
        startedAt,
        models:
          config.LLM_BACKEND === 'openai'
            ? { fast: config.OPENAI_MODEL_FAST, smart: config.OPENAI_MODEL_SMART }
            : { fast: config.VERTEX_MODEL_FAST, smart: config.VERTEX_MODEL_SMART },
        summary: summarize(results, plan),
        calls: call,
        grossCeilingUsd: chargedMicros / 1e6,
        traceFile,
        results,
      },
      null,
      2,
    ),
  );
  await env.close();
}
