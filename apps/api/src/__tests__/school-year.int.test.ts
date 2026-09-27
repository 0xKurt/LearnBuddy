// A school year said the way her school system names it is stored as years of schooling by
// code, never converted by the model (audit M-39). docs/architecture.md §Tools.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('school year (M-39)', () => {
  let env: TestEnv;
  let camille: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    camille = await onboard(env, {
      relation: 'child',
      name: 'Camille',
      birthDate: '2013-03-02',
      pin: '4826',
    });
  });
  afterEach(async () => {
    await env.flushBackground();
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('"je suis en 4e" is her 8th school year, shown back as such', async () => {
    env.llm.script('buddy_turn', {
      json: {
        reply: "D'accord, la 4e !",
        options: null,
        actions: [
          {
            tool: 'set_level',
            args: {
              level: 'school',
              school_year: { system: 'fr', classe: '4e' },
              grade: null,
              quote: 'je suis en 4e',
            },
          },
        ],
      },
    });
    const res = await camille.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'je suis en 4e',
    });
    expect(res.status).toBe(200);
    const learner = await env.db.one<{ level: string; grade: number }>(
      `select level, grade from learners where id = $1`,
      [camille.learnerId],
    );
    expect(learner).toEqual({ level: 'school', grade: 8 });
    expect(res.body.home.done.find((a) => a.summary.tool === 'set_level')?.summary).toEqual({
      tool: 'set_level',
      level: 'school',
      grade: 8,
    });
  });
});
