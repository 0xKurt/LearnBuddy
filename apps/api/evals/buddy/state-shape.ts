// The free half of the STATE measurement (issue #168): what each section of STATE costs in
// every eval case, and which sections actually carry data there — without a single model call.
//
//   cd apps/api && npx tsx evals/buddy/state-shape.ts
//
// Why it exists: the live run (evals/buddy/run.ts with BUDDY_BLOCK_AUDIT) tells how often an
// answer pointed back at a section, and that costs about a dollar. It cannot tell whether a
// section was EMPTY when the answer was written — and a section that says "- no active goals"
// can never be referenced, so counting those cases against it would make a section look
// ignored when it had nothing to offer. This pass builds the same context from the same case
// setups on a throwaway database and reports the honest denominator.
//
// Only the state the MEASURED turn starts from: a case that walks a conversation can gain a
// goal in an earlier turn, so "carries data" is a floor, not a ceiling.
// requires live verification in Claude Code session (needs a running Postgres; no model)

import { config as loadDotenv } from 'dotenv';

import { setStateAudit, type BlockName, type StateSample } from '../../src/modules/buddy/blocks.js';
import { buildContext } from '../../src/modules/buddy/context.js';
import { loadBuddyState } from '../../src/modules/buddy/state.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { CASES } from './cases.js';

loadDotenv({ path: '.env.local' });

type Row = { chars: number[]; withData: number; cases: number };

async function main(): Promise<void> {
  if (!(await testDatabaseAvailable())) throw new Error('No local Postgres (LB_TEST_DATABASE_URL)');
  const rows = new Map<BlockName, Row>();
  const of = (name: BlockName): Row => {
    let r = rows.get(name);
    if (!r) {
      r = { chars: [], withData: 0, cases: 0 };
      rows.set(name, r);
    }
    return r;
  };
  let total = 0;
  for (const c of CASES) {
    const env = await createTestEnv({ start: c.at ?? '2026-09-28T08:00:00Z', model: 'disabled' });
    try {
      const l = await onboard(env, {
        locale: c.learner?.locale ?? 'de',
        timezone: c.learner?.timezone ?? 'Europe/Berlin',
        relation: c.learner?.relation ?? 'self',
        ...(c.learner?.birthDate ? { birthDate: c.learner.birthDate } : {}),
      });
      if (c.setup) await c.setup(env, l);
      const learner = await env.db.one<{
        display_name: string;
        birth_date: string;
        level: 'school' | 'university' | 'adult' | 'unknown';
        grade: number | null;
        is_minor: boolean;
      }>(
        `select display_name, to_char(birth_date,'YYYY-MM-DD') as birth_date, level, grade,
                (birth_date > now() - interval '16 years') as is_minor
           from learners where id = $1`,
        [l.learnerId],
      );
      const now = env.clock.now();
      const state = await loadBuddyState(env.db, l.learnerId, now);
      const samples: StateSample[] = [];
      setStateAudit((s) => samples.push(s));
      buildContext(
        { ...learner, isMinor: learner.is_minor, locale: c.learner?.locale ?? 'de' },
        state,
        now,
        { pushAvailable: false },
      );
      setStateAudit(null);
      const blocks = samples[0]!.blocks;
      total++;
      for (const b of blocks) {
        const r = of(b.name);
        r.cases++;
        r.chars.push(b.chars);
        if (b.data.length > 0) r.withData++;
      }
    } finally {
      await env.close();
    }
  }
  const sum = [...rows.values()].reduce((n, r) => n + r.chars.reduce((a, b) => a + b, 0), 0);
  console.info(`${total} cases · ${sum} characters of STATE in their measured turn\n`);
  console.info('section       cases  carries data   chars (min–max)   chars total   % STATE');
  console.info('-------------------------------------------------------------------------');
  for (const [name, r] of rows) {
    const chars = r.chars.reduce((a, b) => a + b, 0);
    const min = Math.min(...r.chars);
    const max = Math.max(...r.chars);
    console.info(
      `${name.padEnd(12)} ${String(r.cases).padStart(6)} ${`${r.withData}/${r.cases}`.padStart(13)}` +
        ` ${`${min}–${max}`.padStart(17)} ${String(chars).padStart(13)}` +
        ` ${((100 * chars) / Math.max(sum, 1)).toFixed(1).padStart(8)}`,
    );
  }
  console.info(
    '\ncarries data = cases where the section held rows of hers, not just its heading and' +
      ' "- nothing yet". A section with no data cannot be referenced by an answer.',
  );
}

void main();
