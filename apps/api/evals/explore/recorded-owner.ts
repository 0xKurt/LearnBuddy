// requires live verification in Claude Code session (fault-injected provider replies, real API)
// These are negative controls, not claims that a live model produced these exact strings.
import { writeFileSync } from 'node:fs';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { say, history } from './driver.js';
import { goalProblems, inspect } from './checks.js';
import { OWNER } from './cases.js';

if (process.env.LB_TEST_LOCK_HELD !== '1') throw new Error('Machine lock required');
const controls = [
  { id: 'twenty-in-chat', answers: ['Damit kann ich leider nichts vorbereiten.'] },
  {
    id: 'no-internals',
    answers: ['Ich nutze offer_learning und context_version für deinen Wunsch.'],
  },
  {
    id: 'with-picture',
    answers: ['Das Skelett trägt deinen Körper.', '```\n+-----+\n| Kopf|\n+-----+\n```'],
  },
];
const results = [];
for (const c of controls) {
  const env = await createTestEnv();
  try {
    const l = await onboard(env, { relation: 'child' });
    const goal = OWNER.find((g) => g.id === c.id)!;
    const turns = [];
    for (const [i, text] of c.answers.entries()) {
      env.llm.script('buddy_turn', {
        json: {
          lookups: [],
          concern: false,
          also_asked: false,
          actions: [],
          reply: text,
          options: null,
          asks_permission: false,
        },
      });
      turns.push(await say(env, l, goal.messages[i] ?? goal.messages[0]!));
    }
    const messages = await history(env, l);
    const failures = [...(await inspect(env, l, turns)), ...goalProblems(goal, messages, [], [])];
    results.push({ id: c.id, mode: 'fault-injected negative control', messages, failures });
    console.info(
      `${failures.length ? 'RED' : 'GREEN'} ${c.id}: ${failures.map((f) => f.invariant).join(', ')}`,
    );
  } finally {
    await env.close();
  }
}
writeFileSync(
  '../../docs/measurements/explore/recorded-owner.json',
  JSON.stringify(results, null, 2),
);
process.exitCode = results.some((r) => r.failures.length) ? 1 : 0;
