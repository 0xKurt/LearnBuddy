// Safeguarding for children (audit I-9: H-31 p2-T2, H-32 p2-blocked-disclosure-poisons-thread,
// M-9 p2-disclosures-become-memories, M-17 p2-T8). docs/architecture.md §Turns, D-10.
// requires live verification in Claude Code session (needs a running Postgres; the model is
// scripted — whether Vertex really blocks such messages needs a live run, see evals/buddy)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { t } from '../i18n/index.js';
import { LlmError, type LlmRequest } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-a000-${(++seq).toString(16).padStart(12, '0')}`;

async function send(l: Learner, text: string, id = uuid()) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: id,
    text,
  });
  return { ...res, id };
}

const DISCLOSURE = 'die in meiner klasse sagen ich soll mich umbringen';

describe.skipIf(!dbReady)('safeguarding', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
  });
  afterEach(() => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    env.llm.reset();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('a safety block gets the fixed caring reply, costs no budget, and never mutes Buddy', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.llm.script('buddy_turn', {
      error: new LlmError('blocked', 'finish reason SAFETY', null, 'SAFETY'),
    });
    const blocked = await send(l, DISCLOSURE);
    // Not a glitch to resend: answered, by code, with the helpline for her language.
    expect(blocked.body.status).toBe('done');
    expect(blocked.body.error_code).toBeNull();
    const thread = blocked.body.home.thread;
    const mine = thread.find((m) => m.role === 'learner');
    expect(mine).toMatchObject({ status: 'done', failure_code: 'blocked' });
    const reply = thread[thread.length - 1]!;
    expect(reply.role).toBe('buddy');
    expect(reply.text).toContain('116 111');
    // The block is on record with its finish reason, and her allowance is untouched.
    const calls = await env.db.query<{ error_code: string }>(
      `select error_code from llm_calls where learner_id = $1`,
      [l.learnerId],
    );
    expect(calls.map((c) => c.error_code)).toEqual(['blocked:SAFETY']);
    const usage = await env.db.maybeOne<{ calls: number }>(
      `select calls from usage_daily where learner_id = $1 and kind = 'buddy_turn'`,
      [l.learnerId],
    );
    expect(usage?.calls ?? 0).toBe(0);

    // The next message is answered normally: her blocked words are not sent again.
    let seen = '';
    env.llm.script('buddy_turn', (req: LlmRequest) => {
      seen = ScriptedGateway.textOf(req);
      return { concern: false, reply: 'Klar, lass uns Mathe üben.', options: null, actions: [] };
    });
    const next = await send(l, 'Wollen wir Mathe üben?');
    expect(next.body.status).toBe('done');
    expect(seen).not.toContain('umbringen');
    expect(seen).toContain('Schutzfilter');
    expect(seen).toContain('Wollen wir Mathe üben?');
  });

  it('a distress message gets the code-owned reply and is never remembered', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    const text = 'Mein Papa hat mich wieder geschlagen';
    env.llm.script(
      'buddy_turn',
      // The model flags the concern but also tries to remember it: refused by code …
      {
        json: {
          concern: true,
          reply: 'Oh nein.',
          options: null,
          actions: [
            {
              tool: 'remember',
              args: {
                about: 'harm',
                kind: 'fact',
                statement: 'Wird zu Hause geschlagen',
                quote: 'geschlagen',
                until: null,
              },
            },
          ],
        },
      },
      // … so it answers again without it.
      {
        json: { concern: true, reply: 'Das tut mir leid.', options: ['Ok', 'Danke'], actions: [] },
      },
    );
    const res = await send(l, text);
    expect(res.body.status).toBe('done');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    expect(reply.text).toContain('116 111');
    expect(reply.text).not.toContain('Das tut mir leid');
    expect(reply.options).toBeNull();
    const memories = await env.db.query(`select 1 from buddy_memories where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(memories).toHaveLength(0);
    const rejected = await env.db.query<{ errors: string[] }>(
      `select errors from buddy_decisions where learner_id = $1 and disposition = 'rejected'`,
      [l.learnerId],
    );
    expect(JSON.stringify(rejected)).toContain('concern');

    // And nothing may be DERIVED from it and kept either (issue #149). The memory tools
    // were already refused above; the session summariser read the same table with no such
    // rule, so a summary of this could come back as STATE while buddy_memories stays
    // empty. The disposition sits on the message itself now.
    const marked = await env.db.one<{ recall_block: string | null }>(
      `select recall_block from buddy_messages
        where learner_id = $1 and role = 'learner' order by seq desc limit 1`,
      [l.learnerId],
    );
    expect(marked.recall_block).toBe('concern');
  });

  // A child rarely says only one thing (issue #110, corpus life-088 and life-090): the
  // disclosure and the learning question stand in the same sentence, and the fixed text
  // replaced both. Now a second fixed sentence says the question is not forgotten — while
  // the request itself is neither carried out nor remembered.
  it('a disclosure that also asks for help keeps her question in sight — and still remembers nothing', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.llm.script(
      'buddy_turn',
      // The model flags the concern, marks the learning request — and still tries to
      // remember the disclosure: refused by code, exactly as without a request.
      {
        json: {
          concern: true,
          also_asked: true,
          reply: '',
          options: null,
          actions: [
            {
              tool: 'remember',
              args: {
                kind: 'fact',
                statement: 'Wird zu Hause geschlagen',
                quote: 'schlägt mein vater mich',
                until: null,
              },
            },
          ],
        },
      },
      { json: { concern: true, also_asked: true, reply: '', options: null, actions: [] } },
    );
    const res = await send(
      l,
      'wenn ich schlechte noten hab schlägt mein vater mich, deswegen muss ich die arbeit schaffen',
    );
    expect(res.body.status).toBe('done');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    // Both sentences, word for word from the language files: the helpline first, unchanged.
    expect(reply.text).toBe(
      `${t('de', 'safeguarding.concern')} ${t('de', 'safeguarding.also_asked')}`,
    );
    expect(reply.text).toContain('116 111');
    expect(reply.options).toBeNull();
    // Nothing of it was remembered, and no tool ran at all.
    const memories = await env.db.query(`select 1 from buddy_memories where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(memories).toHaveLength(0);
    const actions = await env.db.query(`select tool from buddy_actions where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(actions).toHaveLength(0);
    const goals = await env.db.query(`select 1 from buddy_goals where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(goals).toHaveLength(0);
  });

  it('a disclosure without a question gets the fixed text and nothing else', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.llm.script('buddy_turn', {
      json: { concern: true, also_asked: false, reply: '', options: null, actions: [] },
    });
    const res = await send(l, 'ich wär manchmal lieber einfach nicht mehr da');
    expect(res.body.status).toBe('done');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    expect(reply.text).toBe(t('de', 'safeguarding.concern'));
    expect(reply.text).not.toContain(t('de', 'safeguarding.also_asked'));
  });

  // The model has no reason to write a reply it knows is thrown away — and for a child
  // in distress an empty text must never end as "model_invalid" (found live in evals/buddy:
  // en/es/it answered concern with an empty reply and the turn failed).
  it('a concern answer without any text still reaches the child', async () => {
    const l = await onboard(env, { relation: 'child', birthDate: '2014-02-10' });
    env.llm.script('buddy_turn', {
      json: { concern: true, reply: '', options: null, actions: [] },
    });
    const res = await send(l, 'die in meiner klasse hauen mich jeden tag und ich hab angst');
    expect(res.body.status).toBe('done');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    expect(reply.text).toContain('116 111');
  });

  it('an empty reply without a concern is repaired, never shown', async () => {
    const l = await onboard(env);
    env.llm.script(
      'buddy_turn',
      { json: { concern: false, reply: '', options: null, actions: [] } },
      { json: { concern: false, reply: 'Klar, worum geht es?', options: null, actions: [] } },
    );
    const res = await send(l, 'Hallo Buddy');
    expect(res.body.status).toBe('done');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    expect(reply.text).toBe('Klar, worum geht es?');
    const rejected = await env.db.query<{ errors: string[] }>(
      `select errors from buddy_decisions where learner_id = $1 and disposition = 'rejected'`,
      [l.learnerId],
    );
    expect(JSON.stringify(rejected)).toContain('reply');
  });

  // Issue #108: until now the ban on keeping health, trouble at home, being hurt and who a
  // child is lived only in the prompt, and the only code-side guard needed `concern = true`.
  // The live run of 29.09. (issue #109) stored "Isst seit drei Tagen fast nichts und möchte
  // dünner werden" and a death in the family in turns the model had NOT flagged. The model
  // now labels every memory with "about"; code refuses these four labels on their own.
  const FORBIDDEN = [
    {
      about: 'health',
      says: 'ich esse seit drei tagen fast nichts und will dünner werden',
      statement: 'Isst fast nichts und möchte dünner werden',
      quote: 'esse seit drei tagen fast nichts und will dünner werden',
    },
    {
      about: 'family',
      says: 'meine eltern streiten jeden abend, ich kann zuhause nicht lernen',
      statement: 'Eltern streiten zuhause',
      quote: 'meine eltern streiten',
    },
    {
      about: 'harm',
      says: 'einer aus der parallelklasse droht mir dass er mich abpasst',
      statement: 'Wird von einem Mitschüler bedroht',
      quote: 'droht mir dass er mich abpasst',
    },
    {
      about: 'identity',
      says: 'ich bete immer vor dem lernen, das gehört zu meinem glauben',
      statement: 'Betet vor dem Lernen',
      quote: 'ich bete immer vor dem lernen',
    },
  ] as const;

  for (const c of FORBIDDEN) {
    it(`never keeps ${c.about}, even when the turn is not a concern (issue #108)`, async () => {
      const l = await onboard(env, { relation: 'child', pin: '4711' });
      let refusal: string | null = null;
      env.llm.script(
        'buddy_turn',
        {
          json: {
            concern: false,
            reply: 'Das merke ich mir.',
            options: null,
            actions: [
              {
                tool: 'remember',
                args: {
                  about: c.about,
                  kind: 'fact',
                  statement: c.statement,
                  quote: c.quote,
                  until: null,
                },
              },
            ],
          },
        },
        (req: LlmRequest) => {
          const text = ScriptedGateway.textOf(req);
          refusal = /action 1 \(remember\): ([^\n]+)/.exec(text)?.[1] ?? null;
          return {
            concern: false,
            reply: 'Das klingt anstrengend. Magst du mir sagen, was gerade ansteht?',
            options: null,
            actions: [],
          };
        },
      );
      const res = await send(l, c.says);
      // The turn itself succeeds: she still gets a warm answer, only the keeping is refused.
      expect(res.body.status).toBe('done');
      expect(res.body.home.thread[res.body.home.thread.length - 1]!.text).toContain('anstrengend');
      expect(refusal).toContain(`about "${c.about}"`);
      // Nothing about it anywhere: no memory row, and no words of hers in a stored statement.
      const memories = await env.db.query(`select 1 from buddy_memories where learner_id = $1`, [
        l.learnerId,
      ]);
      expect(memories).toHaveLength(0);
      const actions = await env.db.query(`select 1 from buddy_actions where learner_id = $1`, [
        l.learnerId,
      ]);
      expect(actions).toHaveLength(0);
    });
  }

  it('correcting something you know is refused on the same categories (issue #108)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    await env.db.query(
      `insert into buddy_memories (learner_id, kind, statement, source, created_at)
       values ($1, 'fact', 'Übt am liebsten nachmittags', 'learner_edited', $2)`,
      [l.learnerId, env.clock.now()],
    );
    let refusal: string | null = null;
    env.llm.script(
      'buddy_turn',
      {
        json: {
          concern: false,
          reply: 'Ich schreibe das um.',
          options: null,
          actions: [
            {
              tool: 'correct_memory',
              args: {
                about: 'health',
                memory: 'm1',
                statement: 'Übt nicht mehr, weil die Migräne kommt',
                quote: 'die migräne kommt immer nachmittags',
              },
            },
          ],
        },
      },
      (req: LlmRequest) => {
        const text = ScriptedGateway.textOf(req);
        refusal = /action 1 \(correct_memory\): ([^\n]+)/.exec(text)?.[1] ?? null;
        return {
          concern: false,
          reply: 'Alles klar, ich lasse es so.',
          options: null,
          actions: [],
        };
      },
    );
    expect((await send(l, 'die migräne kommt immer nachmittags')).status).toBe(200);
    expect(refusal).toContain('about "health"');
    const kept = await env.db.one<{ statement: string }>(
      `select statement from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    expect(kept.statement).toBe('Übt am liebsten nachmittags');
  });

  it('what a situation means for learning is still kept — availability without its cause (issue #108)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.llm.script('buddy_turn', {
      json: {
        concern: false,
        reply: 'Alles klar, diese Woche machen wir Pause.',
        options: null,
        actions: [
          {
            tool: 'remember',
            args: {
              about: 'availability',
              kind: 'constraint',
              statement: 'Kann diese Woche nicht üben',
              quote: 'diese woche kann ich nicht üben',
              until: { kind: 'end_of_week', weeks_ahead: 0 },
            },
          },
        ],
      },
    });
    expect((await send(l, 'ich hab magen darm, diese woche kann ich nicht üben')).status).toBe(200);
    const kept = await env.db.one<{ kind: string; statement: string; valid_until: Date }>(
      `select kind, statement, valid_until from buddy_memories where learner_id = $1 and status = 'active'`,
      [l.learnerId],
    );
    expect(kept).toMatchObject({ kind: 'constraint', statement: 'Kann diese Woche nicht üben' });
    expect(kept.valid_until).not.toBeNull();
    // The cause she named is nowhere in what Buddy keeps — not in the statement, not in the quote.
    const stored = await env.db.query<{ statement: string; quote: string | null }>(
      `select statement, quote from buddy_memories where learner_id = $1`,
      [l.learnerId],
    );
    expect(JSON.stringify(stored)).not.toContain('magen darm');
  });

  it('adults get the variant without the children’s helpline', async () => {
    const l = await onboard(env);
    env.llm.script('buddy_turn', {
      json: { concern: true, reply: 'x', options: null, actions: [] },
    });
    const res = await send(l, 'Mir geht es richtig schlecht, ich will nicht mehr');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    expect(reply.text).toContain('112');
    expect(reply.text).not.toContain('116 111');
  });

  it('a failed message says why, and resending clears it', async () => {
    const l = await onboard(env);
    env.llm.script('buddy_turn', { error: new LlmError('unavailable', 'down') });
    const failed = await send(l, 'Hallo Buddy');
    expect(failed.body).toMatchObject({ status: 'failed', error_code: 'model_unavailable' });
    expect(failed.body.home.thread[0]).toMatchObject({
      status: 'failed',
      failure_code: 'model_unavailable',
    });
    env.llm.script('buddy_turn', {
      json: { concern: false, reply: 'Hallo!', options: null, actions: [] },
    });
    const again = await send(l, 'Hallo Buddy', failed.id);
    expect(again.body.status).toBe('done');
    const home = await l.api.get<BuddyHome>('/buddy');
    expect(home.body.thread[0]).toMatchObject({ status: 'done', failure_code: null });
  });

  it('a sheet the safety filter refuses to read fails for good, with no retry offered', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.llm.script('extraction', {
      error: new LlmError('blocked', 'finish reason SAFETY', null, 'SAFETY'),
    });
    const created = await l.api.post<{
      material: { id: string };
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: uuid(), photo_mimes: ['image/jpeg'] });
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    // Buddy's reaction to the finished reading finds nothing to work with (no model call).
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();
    const id = created.body.material.id;
    const m = await l.api.get<{ status: string; failure_reason: string }>(`/materials/${id}`);
    expect(m.body).toMatchObject({ status: 'failed', failure_reason: 'blocked' });
    expect((await l.api.post(`/materials/${id}/retry`)).status).toBe(409);
    const home = await l.api.get<BuddyHome>('/buddy');
    expect(home.body.now).toMatchObject({ type: 'material_failed', retryable: false });
    const res = await env.app.request('/v1/internal/tick', {
      method: 'POST',
      headers: { 'x-tick-secret': TEST_TICK_SECRET },
    });
    expect(res.status).toBe(200);
    expect(env.llm.callsFor('extraction')).toHaveLength(1);
  });

  it('never gives away an open homework solution in the chat (S-6, enforced in code)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    await env.db.tx(async (tx) => {
      const item = await tx.one<{ id: string }>(
        `insert into items (learner_id, origin, kind, prompt, answer) values ($1, 'typed', 'short', 'Was ist 3/4 + 1/8?', '7/8')
         returning id`,
        [l.learnerId],
      );
      const session = await tx.one<{ id: string }>(
        `insert into practice_sessions (learner_id, mode, status, started_at, last_activity_at)
         values ($1, 'help', 'active', $2, $2) returning id`,
        [l.learnerId, env.clock.now()],
      );
      await tx.query(
        `insert into session_items (session_id, item_id, position) values ($1, $2, 0)`,
        [session.id, item.id],
      );
    });
    env.llm.script(
      'buddy_turn',
      { json: { concern: false, reply: 'Das ist 7/8.', options: null, actions: [] } },
      {
        json: {
          concern: false,
          reply: 'Mach erst beide Nenner gleich: Wie viele Achtel sind 3/4?',
          options: null,
          actions: [],
        },
      },
    );
    const res = await send(l, 'Sag mir einfach was 3/4 + 1/8 ist');
    expect(res.body.status).toBe('done');
    const reply = res.body.home.thread[res.body.home.thread.length - 1]!;
    expect(reply.text).not.toContain('7/8');
    // Once she has it herself, Buddy may say so.
    env.llm.script('buddy_turn', {
      json: { concern: false, reply: 'Genau, 7/8!', options: null, actions: [] },
    });
    const mine = await send(l, 'ist es 7/8?');
    expect(mine.body.home.thread[mine.body.home.thread.length - 1]!.text).toBe('Genau, 7/8!');
  });
});
