// The same keys meet the same grading and disclosure rules in every surface (#918).
// requires live verification in Claude Code session
import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  ClozeTask,
  StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { homeworkLeak } from '../modules/learning/turn.js';
import { ruleCheck } from '../modules/practice/evaluate.js';
import { namesTheSolution } from '../modules/practice/answerReply.js';
import type { ItemRow } from '../modules/practice/service.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const cloze: ClozeTask = {
  type: 'cloze',
  segments: ['In Deutschland liegt ', ', in Frankreich ', '.'],
  gaps: [
    { id: 'g1', key: 'Berlin', accepted: [] },
    { id: 'g2', key: 'Paris', accepted: [] },
  ],
  bank: null,
};

describe.skipIf(!dbReady)('one answer policy across surfaces', () => {
  let env: TestEnv;
  let learner: Learner;
  beforeEach(async () => {
    env = await createTestEnv();
    learner = await onboard(env, { relation: 'self', birthDate: '2000-01-01' });
  });
  afterEach(() => env.closeChecked());

  async function seed(kind: string, task: unknown = null, accepted: string[] = []) {
    const item = await env.db.one<ItemRow>(
      `insert into items (learner_id, origin, kind, prompt, answer, accepted_answers, task, spelling, created_at)
       values ($1, 'homework', $2, 'Nenne die Städte.', $3, $4, $5, 'gentle', $6) returning *`,
      [
        learner.learnerId,
        kind,
        kind === 'cloze' ? 'In Deutschland liegt Berlin, in Frankreich Paris.' : 'Berlin',
        accepted,
        task ? JSON.stringify(task) : null,
        env.clock.now(),
      ],
    );
    const session = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, started_at, last_activity_at)
       values ($1, 'test', 'active', $2, $2) returning id`,
      [learner.learnerId, env.clock.now()],
    );
    await env.db.query(
      'insert into session_items (session_id, item_id, position) values ($1, $2, 0)',
      [session.id, item.id],
    );
    return { item, session };
  }

  it.each(['short', 'cloze', 'table_fill'])(
    'accepts folded answers in %s by code alone',
    async (kind) => {
      const table = {
        type: 'table_fill',
        header: ['Land', 'Stadt'],
        rows: [[{ text: 'Deutschland' }, { id: 'r0c1', key: 'Berlin', also: [], input: 'text' }]],
        family: null,
        fn: null,
        x_in: null,
      };
      const { item, session } = await seed(
        kind,
        kind === 'cloze' ? cloze : kind === 'table_fill' ? table : null,
      );
      const parts: StructuredAnswer | undefined =
        kind === 'cloze'
          ? {
              type: 'cloze',
              gaps: [
                { id: 'g1', text: 'berlin!' },
                { id: 'g2', text: 'Paris' },
              ],
            }
          : kind === 'table_fill'
            ? { type: 'table_fill', cells: [{ id: 'r0c1', text: 'berlin!' }] }
            : undefined;
      const response = await learner.api.post<AnswerResponse>(
        `/practice/sessions/${session.id}/answer`,
        {
          client_turn_id: randomUUID(),
          item_id: item.id,
          ...(parts ? { parts } : { text: 'berlin!' }),
        },
      );
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.verdict).toBe('correct');
      const stored = await env.db.one<{ evaluated_by: string }>(
        `select evaluated_by from practice_turns where session_id = $1 and role = 'learner'`,
        [session.id],
      );
      expect(stored.evaluated_by).toBe('rule');
      expect(env.llm.callsFor('tutor')).toHaveLength(0);
    },
  );

  it('needs answer transcription to normalize spoken number words (#918)', async () => {
    const { item } = await seed('numeric');
    const fraction = { ...item, answer: '3/4', form_free: true, subject_kind: null };
    expect(ruleCheck(fraction, { text: '3/4', choice: null })).toBe('correct');
    expect(ruleCheck(fraction, { text: 'drei Viertel', choice: null })).toBe('unknown');
  });

  it('protects each cloze key in chat just as in practice, and permits visible context', async () => {
    const { item } = await seed('cloze', cloze);
    const reply = 'Die erste Stadt heißt Berlin.';
    expect(namesTheSolution({ item }, reply)).toBe(true);
    expect(await homeworkLeak(env.deps, learner.learnerId, reply, ['Hilf mir bitte'])).not.toEqual(
      [],
    );
    expect(await homeworkLeak(env.deps, learner.learnerId, 'Schau auf Deutschland.', [])).toEqual(
      [],
    );
  });

  it('protects accepted answers in practice just as in chat', async () => {
    const { item } = await seed('short', null, ['Bundeshauptstadt']);
    const reply = 'Die Antwort ist Bundeshauptstadt.';
    expect(await homeworkLeak(env.deps, learner.learnerId, reply, [])).not.toEqual([]);
    expect(namesTheSolution({ item }, reply)).toBe(true);
  });
});
