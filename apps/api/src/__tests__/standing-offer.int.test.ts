// What Buddy already put in front of her is state (issue #184): an offer whose button still
// stands, and a practice he prepared, are in the STATE he reads each turn — and an offer
// identical to one still standing is refused by code, not only discouraged by the prompt.
// Measured 01.10.: the same four turns offered the same practice three times while the first
// button sat right there, each answer right on its own (the core of issue #127).
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const turn = (over: Record<string, unknown>) => ({
  json: {
    lookups: [],
    concern: false,
    also_asked: false,
    actions: [],
    reply: 'Alles klar.',
    options: null,
    asks_permission: false,
    ...over,
  },
});

const OFFER = {
  tool: 'offer_learning',
  args: { kind: 'practice', text: 'die Vokabeln von dem Zettel', goal: null },
};

const generated = {
  json: {
    usable: true,
    title: 'Vokabeln Unité 3',
    subject: { name: 'Französisch', kind: 'french' },
    items: [
      {
        kind: 'short',
        prompt: 'le vélo',
        answer: 'das Fahrrad',
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: 'Unité 3',
        difficulty: 2,
        prompt_lang: 'fr',
        lang: 'de',
        figure: null,
        source_excerpt: null,
      },
    ],
  },
};

async function say(l: Learner, text: string): Promise<SendMessageResponse> {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: randomUUID(),
    text,
  });
  expect(res.status).toBe(200);
  return res.body;
}

describe.skipIf(!dbReady)('a standing offer is part of the state', () => {
  let env: TestEnv;
  let l: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-01T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('stands in STATE after it was made, and the same offer again is refused', async () => {
    env.llm.script('buddy_turn', turn({ actions: [OFFER], reply: 'Ich bereite sie dir vor.' }));
    env.llm.script('explain', generated);
    const sent = await say(l, 'frag mich die vokabeln von dem zettel ab');
    const action = sent.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(action).toBeDefined();
    // The preparation runs in the background under the offer's own id (issue #48). That the
    // session exists says nothing about her: the offer still stands.
    await env.flushBackground();

    // The next turn: the model tries exactly the same offer again. Code refuses it, the repair
    // round answers without it — one offer, not two.
    let seen = '';
    let repair = '';
    env.llm.script(
      'buddy_turn',
      (req) => {
        seen = ScriptedGateway.textOf(req);
        return turn({ actions: [OFFER], reply: 'Ich habe sie dir vorbereitet.' }).json;
      },
      (req) => {
        repair = ScriptedGateway.textOf(req);
        return turn({ reply: 'Der Knopf oben startet sie.' }).json;
      },
    );
    const second = await say(l, 'ok weiter');
    expect(second.status).toBe('done');

    // What the model was told: the offer stands, in her own words, and she has not started it.
    expect(seen).toContain('## Already waiting for her');
    expect(seen).toContain('your practice offer "die Vokabeln von dem Zettel"');
    expect(seen).toContain('she has not started it');
    // And why its repeat was thrown away.
    expect(repair).toContain('already offered exactly this');

    const offers = await env.db.query(
      `select id from buddy_actions where learner_id = $1 and tool = 'offer_learning'`,
      [l.learnerId],
    );
    expect(offers).toHaveLength(1);
    const rejected = await env.db.query<{ errors: string[] }>(
      `select errors from buddy_decisions where learner_id = $1 and disposition = 'rejected'`,
      [l.learnerId],
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.errors.join(' ')).toContain('offer_learning');

    // Her last answer is the repaired one; nothing half-applied.
    expect(second.home.thread.at(-1)?.text).toBe('Der Knopf oben startet sie.');
  });

  it('stops standing once she has worked in it, and may then be offered again', async () => {
    const offer = await env.db.one<{ id: string }>(
      `select id from buddy_actions where learner_id = $1 and tool = 'offer_learning'
        order by seq desc limit 1`,
      [l.learnerId],
    );
    // Her tap: the offer's action id is the request id, so it opens what was prepared.
    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: offer.id,
      kind: 'practice',
      text: 'die Vokabeln von dem Zettel',
    });
    expect(tapped.status === 200 || tapped.status === 201).toBe(true);

    // Still untouched: opening it changes nothing about whether she worked in it.
    let seen = '';
    env.llm.script('buddy_turn', (req) => {
      seen = ScriptedGateway.textOf(req);
      return turn({ reply: 'Sie wartet noch.' }).json;
    });
    await say(l, 'und sonst?');
    expect(seen).toContain('## Already waiting for her');

    // She finishes the session: from here it is taken up, and the offer no longer stands.
    const finished = await l.api.post(`/practice/sessions/${tapped.body.id}/finish`, {});
    expect(finished.status).toBe(200);
    let after = '';
    env.llm.script('buddy_turn', (req) => {
      after = ScriptedGateway.textOf(req);
      return turn({ reply: 'Fertig.' }).json;
    });
    await say(l, 'fertig');
    expect(after).not.toContain('## Already waiting for her');

    // And now the same offer is allowed again — nothing stands.
    env.llm.script('buddy_turn', turn({ actions: [OFFER], reply: 'Noch eine Runde?' }));
    env.llm.script('explain', generated);
    const again = await say(l, 'nochmal die vokabeln');
    expect(again.status).toBe('done');
    await env.flushBackground();
    const offers = await env.db.query(
      `select id from buddy_actions where learner_id = $1 and tool = 'offer_learning'`,
      [l.learnerId],
    );
    expect(offers).toHaveLength(2);
  });

  it('a practice Buddy prepared is in the same section, with its alias', async () => {
    const other = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2013-07-04',
      pin: '2468',
    });
    const sheet = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, title,
                              extracted_text, ready_at, created_at)
       values ($1, gen_random_uuid(), 'ready', 1, 'Arbeitsblatt Brüche', '1. Kürze 6/8.', $2, $2)
       returning id`,
      [other.learnerId, env.clock.now()],
    );
    for (const prompt of ['Kürze 6/8.', 'Erweitere 3/4 mit 5.', 'Kürze 10/15.']) {
      await env.db.query(
        `insert into items (learner_id, material_id, kind, prompt, answer, topic, difficulty, origin)
         values ($1, $2, 'short', $3, '3/4', 'Brüche', 2, 'material')`,
        [other.learnerId, sheet.id, prompt],
      );
    }
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          {
            tool: 'prepare_practice',
            args: { goal: null, subject: null, minutes: 10, focus_topics: ['Brüche'] },
          },
        ],
        reply: 'Ich habe dir Brüche vorbereitet.',
      }),
    );
    await say(other, 'üben wir brüche');

    let seen = '';
    env.llm.script('buddy_turn', (req) => {
      seen = ScriptedGateway.textOf(req);
      return turn({ reply: 'Sie steht bereit.' }).json;
    });
    await say(other, 'ok weiter');
    expect(seen).toContain('## Already waiting for her');
    expect(seen).toMatch(/practice you prepared st\d "/);
    expect(seen).toContain('ready to start, she has not started it');
  });
});
