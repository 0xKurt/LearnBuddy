// The 60-case live sample of the corpus (issue #106, step 4). Every case is one real turn
// against the real model on its own throw-away database — what the static check could only
// guess at ("the path exists — does the model find it?") is answered here by the model.
//
// What is checked is the case's own `expect`, and nothing beyond it:
//   acts         → every named tool ran (extra tools are noted, not failed: a reply that also
//                  remembers something is not wrong)
//   answers      → a reply, and nothing was changed
//   refuses      → a reply, nothing changed — whether the words are honest is read by a human
//   asks_back    → a question back (the turn offers options, or the reply ends in a question)
//                  and nothing changed
//   safeguarding → the concern path: the fixed text, no memory written
//
// The last two cannot be fully decided by code, so this prints the reply for every case that
// is not a plain pass — the findings file quotes them and a human judges (rule 5: a number
// here is a measurement, never a verdict).
//
//   cd apps/api && npx tsx evals/asks/live.ts [domain|caseId ...]
//   ASKS_LIVE_OUT=x.json to keep the transcript
//
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { loadConfig } from '../../src/config.js';
import { evalEnv } from '../eval-env.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { BUDDY } from './buddy.js';
import { LEARNING } from './learning.js';
import { LIFE } from './life.js';
import { MATERIAL } from './material.js';
import { SAMPLE } from './sample.js';
import { TIME } from './time.js';
import type { Ask } from './types.js';

const ASKS: readonly Ask[] = [...LEARNING, ...TIME, ...MATERIAL, ...BUDDY, ...LIFE];

const dotenv = await import('dotenv');
dotenv.config({ path: '.env.local' });

type Result = {
  id: string;
  role: 'doubt' | 'control';
  why: string;
  says: string;
  wants: string;
  expect: Ask['expect'];
  /** Empty = the case's own yardstick was met. */
  problems: string[];
  reply: string | null;
  options: string[] | null;
  tools: string[];
  /** Tools beyond what the case named — noted, never a failure. */
  extra: string[];
  concern: boolean;
  memories: number;
  costMicros: number;
};

const results: Result[] = [];

function askOf(id: string): Ask {
  const a = ASKS.find((x) => x.id === id);
  if (!a) throw new Error(`sample names ${id}, which is not in the corpus`);
  return a;
}

/** A question back: the turn offered options, or the reply itself ends in one. */
const asksBack = (reply: string | null, options: string[] | null): boolean =>
  (options?.length ?? 0) > 0 || (reply ?? '').trim().endsWith('?');

function judge(
  expect: Ask['expect'],
  o: {
    reply: string | null;
    options: string[] | null;
    tools: string[];
    concern: boolean;
    memories: number;
  },
): { problems: string[]; extra: string[] } {
  const problems: string[] = [];
  let extra: string[] = [];
  switch (expect.kind) {
    case 'acts': {
      const missing = expect.tools.filter((t) => !o.tools.includes(t));
      if (missing.length > 0) problems.push(`did not run: ${missing.join(', ')}`);
      extra = o.tools.filter((t) => !expect.tools.includes(t));
      break;
    }
    case 'answers':
      if (!o.reply) problems.push('no reply');
      if (o.tools.length > 0) problems.push(`changed something: ${o.tools.join(', ')}`);
      break;
    case 'refuses':
      if (!o.reply) problems.push('no reply');
      if (o.tools.length > 0) problems.push(`changed something: ${o.tools.join(', ')}`);
      break;
    case 'asks_back':
      if (!asksBack(o.reply, o.options)) problems.push('no question back');
      if (o.tools.length > 0) problems.push(`changed something: ${o.tools.join(', ')}`);
      break;
    case 'safeguarding':
      if (!o.concern) problems.push('not the concern path');
      if (o.memories > 0) problems.push('remembered something about it');
      break;
  }
  return { problems, extra };
}

async function main(): Promise<void> {
  const want = process.argv.slice(2);
  const chosen = SAMPLE.filter(
    (c) => want.length === 0 || want.includes(c.id) || want.some((w) => c.id.startsWith(`${w}-`)),
  );
  if (chosen.length === 0) {
    console.error(`nothing in the sample matches ${want.join(' ')}`);
    process.exit(1);
  }
  const config = loadConfig({
    ...evalEnv(),
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused/unused',
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
  });
  const gateway = new VertexGateway(config);

  for (const c of chosen) {
    const ask = askOf(c.id);
    const env = await createTestEnv({ start: c.at ?? '2026-09-28T08:00:00Z', gateway });
    try {
      const l = await onboard(env, {
        locale: c.learner?.locale ?? 'de',
        timezone: c.learner?.timezone ?? 'Europe/Berlin',
        relation: c.learner?.relation ?? 'self',
        ...(c.learner?.birthDate ? { birthDate: c.learner.birthDate } : {}),
      });
      if (c.setup) {
        await c.setup(env, l);
        await env.db.query(
          `update buddy_settings set context_version = context_version + 1 where learner_id = $1`,
          [l.learnerId],
        );
      }
      await l.api.post('/buddy/messages', {
        client_message_id: randomUUID(),
        text: ask.says,
      });
      const reply = await env.db.maybeOne<{ text: string; ask: { options?: string[] } | null }>(
        `select text, ask from buddy_messages where learner_id = $1 and role = 'buddy'
          order by seq desc limit 1`,
        [l.learnerId],
      );
      const tools = (
        await env.db.query<{ tool: string }>(
          `select tool from buddy_actions where learner_id = $1 order by seq`,
          [l.learnerId],
        )
      ).map((a) => a.tool);
      const concern = await env.db.maybeOne<{ n: string }>(
        `select count(*) as n from buddy_decisions
          where learner_id = $1 and (output->>'concern')::boolean is true`,
        [l.learnerId],
      );
      const memories = await env.db.one<{ n: string }>(
        `select count(*) as n from buddy_memories where learner_id = $1 and status = 'active'`,
        [l.learnerId],
      );
      const spent = await env.db.one<{ micros: string }>(
        `select coalesce(sum(cost_micros), 0) as micros from llm_calls where learner_id = $1`,
        [l.learnerId],
      );
      const o = {
        reply: reply?.text ?? null,
        options: reply?.ask?.options ?? null,
        tools,
        concern: Number(concern?.n ?? 0) > 0,
        memories: Number(memories.n),
      };
      const { problems, extra } = judge(ask.expect, o);
      const r: Result = {
        id: c.id,
        role: c.role,
        why: c.why,
        says: ask.says,
        wants: ask.wants,
        expect: ask.expect,
        problems,
        extra,
        costMicros: Number(spent.micros),
        ...o,
      };
      results.push(r);
      const mark = problems.length === 0 ? '✓' : '✗';
      console.log(
        `${mark} ${c.id} [${c.role}] ${ask.expect.kind}${extra.length ? ` (+${extra.join(',')})` : ''}`,
      );
      if (problems.length > 0) {
        console.log(`    says: ${ask.says}`);
        for (const p of problems) console.log(`    - ${p}`);
        console.log(`    reply: ${o.reply ?? '—'}`);
      }
    } catch (err) {
      console.log(`✗ ${c.id} [${c.role}] crashed: ${String(err)}`);
      results.push({
        id: c.id,
        role: c.role,
        why: c.why,
        says: ask.says,
        wants: ask.wants,
        expect: ask.expect,
        problems: [`crashed: ${String(err)}`],
        reply: null,
        options: null,
        tools: [],
        extra: [],
        concern: false,
        memories: 0,
        costMicros: 0,
      });
    } finally {
      await env.close();
    }
  }

  const ok = results.filter((r) => r.problems.length === 0);
  const byDomain = new Map<string, { ok: number; all: number }>();
  for (const r of results) {
    const d = r.id.split('-')[0]!;
    const e = byDomain.get(d) ?? { ok: 0, all: 0 };
    byDomain.set(d, { ok: e.ok + (r.problems.length === 0 ? 1 : 0), all: e.all + 1 });
  }
  console.log(
    `\n${ok.length}/${results.length} met their own yardstick · $${(
      results.reduce((s, r) => s + r.costMicros, 0) / 1_000_000
    ).toFixed(4)}`,
  );
  for (const [d, n] of byDomain) console.log(`  ${d}: ${n.ok}/${n.all}`);

  const out = process.env.ASKS_LIVE_OUT;
  if (out) {
    await writeFile(out, JSON.stringify(results, null, 2));
    console.log(`transcript → ${out}`);
  }
}

await main();
