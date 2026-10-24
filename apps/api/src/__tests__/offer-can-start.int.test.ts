// An offer is a promise that one tap starts something — so a turn may not make one it cannot
// keep (issue #196). Measured 01.10. during the product video, reproduced twice live with the
// real model: she asked "Can you quiz me on these French words now?" after photographing her
// vocabulary list, and Buddy answered with `offer_learning { kind: 'vocab', text: 'French
// vocabulary Unité 3' }` — the SHEET'S TITLE. The reply said the quiz was ready, and the tap
// came back 422 not_usable, because the vocabulary generator makes questions out of pairs the
// learner typed and there are none in a title. Three floors, all in code (hard rule 1):
//   1. an offer over content she typed (vocab, help) must carry her own words;
//   2. a turn that already prepared practice does not also offer — one answer, one thing to tap;
//   3. an offer whose preparation was refused stops being a button, in STATE and on screen.
// And the card on top shows the practice she asked for, not an older one (issue #196 point 3).
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  BuddyHome,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { bumpContext } from '../modules/buddy/plan.js';
import { LlmError } from '../llm/gateway.js';

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

const PREPARE = {
  tool: 'prepare_practice',
  args: { goal: null, subject: null, minutes: 10, focus_topics: [], vocabulary_only: true },
};

/** A set of questions the generator could write (the offer's background preparation). */
const generated = (usable = true) => ({
  json: {
    usable,
    title: 'Unité 3',
    subject: { name: 'Französisch', kind: 'french' },
    items: usable
      ? [
          {
            kind: 'vocab',
            prompt: 'la chambre',
            answer: 'das Zimmer',
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
        ]
      : [],
  },
});

async function say(l: Learner, text: string): Promise<SendMessageResponse> {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: randomUUID(),
    text,
  });
  expect(res.status).toBe(200);
  return res.body;
}

/** Her French vocabulary list, read, with its pairs — the state of the live run. */
async function vocabSheet(env: TestEnv, l: Learner): Promise<string> {
  const sheet = await env.db.one<{ id: string }>(
    `insert into materials (learner_id, client_request_id, status, photo_count, title,
                            extracted_text, ready_at, created_at)
     values ($1, gen_random_uuid(), 'ready', 1, 'Vokabeln Unité 3', $2, $3, $3) returning id`,
    [l.learnerId, 'la chambre – das Zimmer\nle lit – das Bett', env.clock.now()],
  );
  const subject = await env.db.one<{ id: string }>(
    `insert into subjects (learner_id, name, kind) values ($1, 'Französisch', 'french') returning id`,
    [l.learnerId],
  );
  for (const [fr, de] of [
    ['la chambre', 'das Zimmer'],
    ['le lit', 'das Bett'],
    ['la fenêtre', 'das Fenster'],
  ]) {
    await env.db.query(
      `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic,
                          prompt_lang, lang, origin)
       values ($1, $2, $3, 'vocab', $4, $5, 'Unité 3', 'fr', 'de', 'material')`,
      [l.learnerId, sheet.id, subject.id, fr, de],
    );
  }
  await bumpContext(env.db, l.learnerId);
  return sheet.id;
}

describe.skipIf(!dbReady)('an offer has to be able to start', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-01T15:00:00Z' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('refuses a vocabulary offer that names the words instead of carrying them', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Lienne', birthDate: '2014-02-10' });
    await vocabSheet(env, l);
    let repair = '';
    env.llm.script(
      'buddy_turn',
      // What the live model did: the sheet's title as the thing to quiz.
      turn({
        actions: [
          { tool: 'offer_learning', args: { kind: 'vocab', text: 'Vokabeln Unité 3', goal: null } },
        ],
        reply: 'Ich habe dir die Vokabeln vorbereitet!',
      }),
      (req) => {
        repair = ScriptedGateway.textOf(req);
        return turn({ actions: [PREPARE], reply: 'Ich habe die Vokabeln vorbereitet.' }).json;
      },
    );
    const sent = await say(l, 'frag mich jetzt die französischen wörter ab');
    expect(sent.status).toBe('done');

    // Why it was thrown away, and what to do instead.
    expect(repair).toContain('names a vocabulary list instead of being one');
    expect(repair).toContain('prepare_practice');

    // One thing to tap, and it is the prepared practice — no offer at all.
    const tools = await env.db.query<{ tool: string }>(
      `select tool from buddy_actions where learner_id = $1 order by seq`,
      [l.learnerId],
    );
    expect(tools.map((t) => t.tool)).toEqual(['prepare_practice']);
    const steps = await env.db.query<{ state: string }>(
      `select state from buddy_steps where learner_id = $1 and kind = 'practice'`,
      [l.learnerId],
    );
    expect(steps).toEqual([{ state: 'prepared' }]);
  });

  it('allows a vocabulary offer that carries the pairs, typed or copied off her sheet', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-07-04' });
    const typed = 'la chambre das zimmer, le lit das bett';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [{ tool: 'offer_learning', args: { kind: 'vocab', text: typed, goal: null } }],
        reply: 'Los geht es!',
      }),
    );
    env.llm.script('explain', generated());
    const sent = await say(l, `frag mich meine vokabeln ab: ${typed}`);
    expect(sent.status).toBe('done');
    await env.flushBackground();
    const offers = await env.db.query<{ result: { text: string; startable?: boolean } }>(
      `select result from buddy_actions where learner_id = $1 and tool = 'offer_learning'`,
      [l.learnerId],
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]!.result.text).toBe(typed);
    expect(offers[0]!.result.startable).toBe(true);
  });

  it('a vocabulary offer may carry pairs read off her sheet, in one direction (#113)', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Suri', birthDate: '2013-04-02' });
    await vocabSheet(env, l);
    // Where the pairs come from is not the question — only whether the text holds any. Buddy
    // copies them off her sheet to ask them the other way round; she never typed them.
    const pairs = 'la chambre – das Zimmer\nle lit – das Bett';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          {
            tool: 'offer_learning',
            args: { kind: 'vocab', text: pairs, goal: null, wish: 'produce' },
          },
        ],
        reply: 'Dann so herum.',
      }),
    );
    env.llm.script('explain', generated());
    const sent = await say(l, 'frag die vokabeln andersrum ab, deutsch zuerst');
    expect(sent.status).toBe('done');
    const offers = await env.db.query<{ result: { direction: string | null } }>(
      `select result from buddy_actions where learner_id = $1 and tool = 'offer_learning'`,
      [l.learnerId],
    );
    await env.flushBackground();
    expect(offers).toHaveLength(1);
    expect(offers[0]!.result.direction).toBe('produce');
  });

  it('a reminder for later is not the answer\u2019s button, so an offer may stand beside it', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Pia', birthDate: '2014-08-09' });
    const typed = 'la porte das tor, le mur die mauer';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          {
            tool: 'plan_step',
            args: {
              goal: null,
              kind: 'practice',
              title: 'Vokabeln',
              day: { kind: 'unknown' },
              time: null,
              in_minutes: 90,
              repeat: null,
              repeat_until: null,
              agreed: true,
              quote: 'erinner mich in anderthalb stunden',
            },
          },
          { tool: 'offer_learning', args: { kind: 'vocab', text: typed, goal: null } },
        ],
        reply: 'Mache ich \u2014 und hier sind sie schon.',
      }),
    );
    env.llm.script('explain', generated());
    const sent = await say(
      l,
      `erinner mich in anderthalb stunden, und frag mich meine vokabeln ab: ${typed}`,
    );
    expect(sent.status).toBe('done');
    const tools = await env.db.query<{ tool: string }>(
      `select tool from buddy_actions where learner_id = $1 order by seq`,
      [l.learnerId],
    );
    expect(tools.map((t) => t.tool)).toEqual(['plan_step', 'offer_learning']);
    await env.flushBackground();
  });

  it('refuses an offer beside practice it prepared in the same answer', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Noa', birthDate: '2014-05-01' });
    await vocabSheet(env, l);
    let repair = '';
    env.llm.script(
      'buddy_turn',
      // The two actions the owner saw: a successful preparation and an offer beside it, the
      // two cards saying opposite things.
      turn({
        actions: [
          PREPARE,
          { tool: 'offer_learning', args: { kind: 'practice', text: 'Unité 3', goal: null } },
        ],
        reply: 'Ich habe dir die Vokabeln vorbereitet!',
      }),
      (req) => {
        repair = ScriptedGateway.textOf(req);
        return turn({ actions: [PREPARE], reply: 'Die Übung steht oben bereit.' }).json;
      },
    );
    const sent = await say(l, 'frag mich die vokabeln von dem zettel ab');
    expect(sent.status).toBe('done');
    expect(repair).toContain('already prepared practice in this same answer');
    const tools = await env.db.query<{ tool: string }>(
      `select tool from buddy_actions where learner_id = $1 order by seq`,
      [l.learnerId],
    );
    expect(tools.map((t) => t.tool)).toEqual(['prepare_practice']);
    // Nothing half-applied: the whole decision rolled back, so there is one prepared step.
    const steps = await env.db.query(
      `select state from buddy_steps where learner_id = $1 and kind = 'practice'`,
      [l.learnerId],
    );
    expect(steps).toHaveLength(1);
  });

  it('a refused preparation takes the button away, in STATE and in the thread', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Ada', birthDate: '2013-11-20' });
    const typed = 'la porte das tor, le mur die mauer';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [{ tool: 'offer_learning', args: { kind: 'vocab', text: typed, goal: null } }],
        reply: 'Ich habe deine Übungen vorbereitet.',
      }),
    );
    // The generator refuses: nothing it can make questions from (practice/generate.ts).
    env.llm.script('explain', generated(false));
    // The preparation waits until the flush below: the state in between is what is asserted.
    env.holdBackground();
    const sent = await say(l, `frag mich meine vokabeln ab: ${typed}`);
    expect(sent.status).toBe('done');
    // While the preparation is still running nothing is claimed either way: the card is a
    // button until the refusal is in (issue #48, rule 5).
    const beforeFlush = sent.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(beforeFlush?.summary).toMatchObject({ tool: 'offer_learning', startable: true });
    await env.flushBackground();

    const action = await env.db.one<{ id: string; cannot_start_at: Date | null }>(
      `select id, cannot_start_at from buddy_actions
        where learner_id = $1 and tool = 'offer_learning'`,
      [l.learnerId],
    );
    expect(action.cannot_start_at).not.toBeNull();

    // The thread hands the app a card that is not a button any more.
    const home = await l.api.get<BuddyHome>('/buddy');
    const reply = home.body.thread.find((m) =>
      m.actions.some((a) => a.summary.tool === 'offer_learning'),
    );
    expect(reply?.text).toBe('Die Übung konnte ich leider nicht vorbereiten.');
    expect(home.body.context_version).toBeGreaterThan(sent.home.context_version);
    // Persisted too: history and the next model turn must not repeat the failed promise.
    const stored = await env.db.one<{ text: string }>(
      `select text from buddy_messages where id = $1 and learner_id = $2`,
      [reply?.id, l.learnerId],
    );
    expect(stored.text).toBe(reply?.text);
    const offer = home.body.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(offer?.summary).toMatchObject({ tool: 'offer_learning', startable: false });

    // And STATE stops calling it something waiting for her, so Buddy cannot point at it.
    let seen = '';
    env.llm.script('buddy_turn', (req) => {
      seen = ScriptedGateway.textOf(req);
      return turn({ reply: 'Erzähl mal.' }).json;
    });
    await say(l, 'und sonst?');
    expect(seen).not.toContain('## Already waiting for her');
  });

  it('an outage corrects the claim but keeps the same offer retryable', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Ina', birthDate: '2013-11-20' });
    const text = 'la chambre – das Zimmer';
    env.holdBackground();
    env.llm.script(
      'buddy_turn',
      turn({
        reply: 'Die Übung ist vorbereitet.',
        actions: [{ tool: 'offer_learning', args: { kind: 'vocab', text } }],
      }),
    );
    const sent = await say(l, `Frag mich diese Wörter ab: ${text}`);
    const action = sent.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning')!;
    env.llm.byDefault('explain', { error: new LlmError('unavailable', 'offline') });
    await env.flushBackground();
    const failed = (await l.api.get<BuddyHome>('/buddy')).body.thread.find((m) =>
      m.actions.some((a) => a.id === action.id),
    );
    expect(failed?.text).toBe(
      'Die Vorbereitung hat gerade nicht geklappt. Du kannst es noch einmal versuchen.',
    );
    expect(failed?.actions[0]?.summary).toMatchObject({ startable: true });
    env.llm.byDefault('explain', generated());
    const retried = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: action.id,
      kind: 'vocab',
      text,
    });
    expect(retried.status).toBe(201);
    expect(retried.body.items).toHaveLength(2); // The same word, in both directions.
  });

  it('a failed request with another learner’s offer id cannot change their reply or card', async () => {
    const owner = await onboard(env, { relation: 'child', name: 'Eva', birthDate: '2013-11-20' });
    const stranger = await onboard(env, {
      relation: 'child',
      name: 'Eli',
      birthDate: '2013-11-20',
    });
    env.holdBackground();
    env.llm.script(
      'buddy_turn',
      turn({
        reply: 'Wir üben Größen.',
        actions: [{ tool: 'offer_learning', args: { kind: 'practice', text: 'Größen' } }],
      }),
    );
    const sent = await say(owner, 'Ich will Größen üben');
    const reply = sent.home.thread.find((m) =>
      m.actions.some((a) => a.summary.tool === 'offer_learning'),
    )!;
    const id = reply.actions[0]!.id;
    env.llm.script('explain', generated(false));
    const failed = await stranger.api.post('/practice/topic', {
      client_request_id: id,
      kind: 'practice',
      text: 'Größen',
    });
    expect(failed.status).toBe(422);
    const unchanged = (await owner.api.get<BuddyHome>('/buddy')).body;
    expect(unchanged.thread.find((m) => m.id === reply.id)).toEqual(reply);
    expect(unchanged.context_version).toBe(sent.home.context_version);
    env.llm.script('explain', generated(false));
    await env.flushBackground();
    expect(
      (await owner.api.get<BuddyHome>('/buddy')).body.thread.find((m) => m.id === reply.id)?.text,
    ).toBe('Die Übung konnte ich leider nicht vorbereiten.');
  });

  it('the card on top is the practice she asked for, not the older one', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Ida', birthDate: '2014-02-10' });
    // Maths, with a test tomorrow, prepared by a background check: the card the owner kept
    // seeing on top.
    const goal = await env.db.one<{ id: string }>(
      `with s as (insert into subjects (learner_id, name, kind) values ($1, 'Mathe', 'math') returning id)
       insert into buddy_goals (learner_id, kind, title, subject_id, due_date)
       select $1, 'exam', 'Mathearbeit Brüche', s.id, '2026-10-02' from s returning id`,
      [l.learnerId],
    );
    const mathItems: string[] = [];
    for (const prompt of ['Kürze 6/8.', 'Erweitere 3/4 mit 5.']) {
      const row = await env.db.one<{ id: string }>(
        `insert into items (learner_id, kind, prompt, answer, topic, difficulty, origin)
         values ($1, 'short', $2, '3/4', 'Brüche', 2, 'buddy') returning id`,
        [l.learnerId, prompt],
      );
      mathItems.push(row.id);
    }
    await env.db.query(
      `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload, prepared_at)
       values ($1, $2, 'practice', 'Mathearbeit Brüche', 'prepared', '2026-10-01', $3, $4)`,
      [
        l.learnerId,
        goal.id,
        { item_ids: mathItems, est_minutes: 10, focus_topics: ['Brüche'], subject_id: null },
        env.clock.now(),
      ],
    );
    await vocabSheet(env, l);
    // Before she says anything the exam practice is rightly on top: it is the only one.
    const first = await l.api.get<BuddyHome>('/buddy');
    expect(first.body.now).toMatchObject({ type: 'practice_ready', title: 'Mathearbeit Brüche' });

    // Now she asks for the French words, and Buddy prepares them (no test, so no due date).
    env.llm.script(
      'buddy_turn',
      turn({ actions: [PREPARE], reply: 'Ich habe die Vokabeln vorbereitet.' }),
    );
    await say(l, 'frag mich die französischen vokabeln von dem zettel ab');

    // The step that preparation made, read off its own action — never guessed from a title.
    const hers = await env.db.one<{ step_id: string }>(
      `select result ->> 'step_id' as step_id from buddy_actions
        where learner_id = $1 and tool = 'prepare_practice'`,
      [l.learnerId],
    );
    const home = await l.api.get<BuddyHome>('/buddy');
    expect(home.body.now).toMatchObject({ type: 'practice_ready', step_id: hers.step_id });
    // The maths practice is untouched — it was not hers to cancel, only no longer on top.
    const steps = await env.db.query<{ title: string; state: string }>(
      `select title, state from buddy_steps where learner_id = $1 order by seq`,
      [l.learnerId],
    );
    expect(steps).toEqual([
      { title: 'Mathearbeit Brüche', state: 'prepared' },
      { title: 'Übung', state: 'prepared' },
    ]);
  });

  it('offers practice for the test it planned in the same answer, under that test (#636)', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Ella', birthDate: '2012-03-20' });
    const quote = 'Ich muss die Befruchtung für die Arbeit am Freitag können.';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          {
            tool: 'plan_exam',
            args: {
              title: 'Bio-Arbeit Befruchtung',
              subject: 'Biologie',
              subject_kind: 'biology',
              day: { kind: 'weekday', weekday: 5, weeks_ahead: 0 },
              topics: ['Befruchtung'],
              quote,
            },
          },
          {
            tool: 'offer_learning',
            args: { kind: 'practice', text: 'Befruchtung', goal: 'new' },
          },
        ],
        reply: 'Ich habe die Arbeit notiert, hier ist eine Übung dazu.',
      }),
    );
    env.llm.script('explain', generated());
    const sent = await say(l, 'Wir machen in Bio gerade Sexualkunde. ' + quote);
    expect(sent.status).toBe('done');
    const [goal] = await env.db.query<{ id: string }>(
      `select id from buddy_goals where learner_id = $1`,
      [l.learnerId],
    );
    const offer = await env.db.one<{ goal_id: string | null }>(
      `select result ->> 'goal_id' as goal_id from buddy_actions
        where learner_id = $1 and tool = 'offer_learning'`,
      [l.learnerId],
    );
    expect(offer.goal_id).toBe(goal!.id);
    await env.flushBackground();
  });
});
