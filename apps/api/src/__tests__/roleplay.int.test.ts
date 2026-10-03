// A roleplay in a foreign language (issue #244): Buddy plays a role, the frame is code.
//
// What is pinned here, against the real schema and the real endpoints:
//   * it starts from the chat, on her words, never in her own app language;
//   * an in-role turn sees the stored frame and the scene's lines — not STATE, not her name;
//   * a line in another language gets the app's hint and is not counted;
//   * after twelve turns it ends, in the same transaction, with feedback whose invented quote
//     is discarded (the issue's acceptance criterion);
//   * leaving by saying so, ending with the card's button, a second tap, another learner's id;
//   * a stale context, and an interrupted turn taken over by the scheduler, count a turn once.
// requires live verification in Claude Code session (needs a running Postgres; the model is scripted)

import { randomUUID } from 'node:crypto';

import type {
  ActionSummary,
  BuddyHome,
  EndRoleplayResponse,
  SendMessageResponse,
} from '@learnbuddy/shared-types/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { LlmRequest } from '../llm/gateway.js';
import { ROLEPLAY_FEEDBACK_SYSTEM, ROLEPLAY_SYSTEM } from '../modules/buddy/roleplay.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';
import { bumpContext } from '../modules/buddy/plan.js';

const dbReady = await testDatabaseAvailable();

const turn = (over: Record<string, unknown>) => ({
  lookups: [],
  concern: false,
  also_asked: false,
  actions: [],
  reply: 'Alles klar.',
  options: null,
  asks_permission: false,
  ...over,
});

const START = {
  tool: 'start_roleplay',
  args: {
    language: 'en',
    scene: 'Im Café in London',
    role: 'Kellner',
    points: ['Begrüßen', 'Etwas bestellen', 'Nach dem Preis fragen'],
    quote: 'lass uns Englisch sprechen',
  },
};

const line = (reply: string, over: Record<string, unknown> = {}) => ({
  concern: false,
  also_asked: false,
  her_language: 'en',
  leave: false,
  reply,
  ...over,
});

async function say(l: Learner, text: string, id: string = randomUUID()) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: id,
    text,
  });
  return res;
}

function roleplayCard(home: BuddyHome) {
  return home.thread
    .flatMap((m) => m.actions)
    .map((a) => a.summary)
    .find(
      (s): s is Extract<ActionSummary, { tool: 'start_roleplay' }> => s.tool === 'start_roleplay',
    );
}

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
}

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe.skipIf(!dbReady)('roleplay in a foreign language', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-02T14:00:00Z' });
  });
  afterEach(() => {
    const { scriptErrors, unexpected } = env.llm;
    env.llm.reset();
    expect(scriptErrors).toEqual([]);
    expect(unexpected.map((r) => r.purpose)).toEqual([]);
  });
  afterAll(async () => {
    await env?.close();
  });

  /** A learner with a running roleplay, started from the chat. */
  async function started(name = 'Lena'): Promise<{ l: Learner; id: string }> {
    const l = await onboard(env, { relation: 'child', name, birthDate: '2013-05-04' });
    env.llm.script('buddy_turn', {
      json: turn({ actions: [START], reply: 'Los geht’s! — Good afternoon! What can I get you?' }),
    });
    const res = await say(l, 'lass uns Englisch sprechen, ich bin im Café');
    expect(res.body.status).toBe('done');
    const card = roleplayCard(res.body.home);
    expect(card).toMatchObject({
      language: 'en',
      scene: 'Im Café in London',
      role: 'Kellner',
      points: ['Begrüßen', 'Etwas bestellen', 'Nach dem Preis fragen'],
      status: 'active',
    });
    expect(res.body.home.roleplay).toEqual({
      id: card!.roleplay_id,
      language: 'en',
      scene: 'Im Café in London',
    });
    return { l, id: card!.roleplay_id };
  }

  const turnsOf = async (id: string) =>
    await env.db.one<{ turns: number; status: string; ended_reason: string | null }>(
      `select turns, status, ended_reason from buddy_roleplays where id = $1`,
      [id],
    );

  it('starts only on her words and never in her own app language', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-05-04' });
    let repair = '';
    env.llm.script(
      'buddy_turn',
      // German for a German learner is no foreign language: refused, nothing applied.
      { json: turn({ actions: [{ ...START, args: { ...START.args, language: 'de' } }] }) },
      (req: LlmRequest) => {
        repair = ScriptedGateway.textOf(req);
        // And words she never wrote cannot start one either: refused again, the turn fails.
        return turn({ actions: [{ ...START, args: { ...START.args, quote: 'spiel mit mir' } }] });
      },
    );
    const res = await say(l, 'lass uns Englisch sprechen');
    expect(repair).toContain("learner's own app language");
    expect(res.body.status).toBe('failed');
    expect(
      await env.db.query(`select 1 from buddy_roleplays where learner_id = $1`, [l.learnerId]),
    ).toEqual([]);
    expect(res.body.home.roleplay).toBeNull();
  });

  it('plays turns against the stored frame, sees nothing personal, and counts only lines in the language', async () => {
    const { l, id } = await started('Lena');
    let seen: LlmRequest | null = null;
    env.llm.script('buddy_turn', (req: LlmRequest) => {
      seen = req;
      return line('Of course! One hot chocolate. Anything else?');
    });
    const first = await say(l, 'Hello! A hot chocolate, please.');
    expect(first.body.status).toBe('done');
    const req = seen as unknown as LlmRequest;
    expect(req.system).toBe(ROLEPLAY_SYSTEM);
    const sent = ScriptedGateway.textOf(req);
    // The frame comes from the row, with her role card as aliases.
    expect(sent).toContain('Language: English (en)');
    expect(sent).toContain('You play: Kellner');
    expect(sent).toContain('- k3: Nach dem Preis fragen');
    // Nothing of STATE and nothing personal: not her name, not her memories, not the chat before.
    expect(sent).not.toContain('Lena');
    expect(sent).not.toContain('STATE');
    expect(sent).not.toContain('lass uns Englisch sprechen');
    expect(sent).toContain('Hello! A hot chocolate, please.');
    expect((await turnsOf(id)).turns).toBe(1);
    const last = first.body.home.thread.at(-1)!;
    expect(last).toMatchObject({
      role: 'buddy',
      text: 'Of course! One hot chocolate. Anything else?',
    });
    // A scene has no tools: a remember in the answer would not even parse.
    expect(req.schema).not.toHaveProperty('properties.actions');

    // German in an English scene: the app's own hint, the model's words are not shown, no turn.
    env.llm.script('buddy_turn', { json: line('Sure, here you are.', { her_language: 'de' }) });
    const german = await say(l, 'Was kostet das?');
    expect(german.body.home.thread.at(-1)!.text).toBe(
      "Versuch's auf Englisch – ich bleibe in meiner Rolle. Wenn du aufhören willst, sag es einfach.",
    );
    expect((await turnsOf(id)).turns).toBe(1);
  });

  it('ends after twelve turns with feedback per key point — an invented quote is discarded', async () => {
    const { l, id } = await started('Ella');
    for (let i = 1; i <= 11; i++) {
      env.llm.script('buddy_turn', { json: line(`Line ${i}.`) });
      const res = await say(l, i === 2 ? 'How much is it?' : `Hello, I want a tea number ${i}.`);
      expect(res.body.status).toBe('done');
    }
    expect((await turnsOf(id)).turns).toBe(11);
    let feedbackReq: LlmRequest | null = null;
    env.llm.script('buddy_turn', { json: line('Thank you, goodbye!') }, (req: LlmRequest) => {
      feedbackReq = req;
      return {
        points: [
          // Real words of hers: managed.
          { point: 'k1', met: true, quote: 'Hello' },
          // Words she never wrote: not managed, whatever the model says.
          { point: 'k2', met: true, quote: 'Could I have a coffee please' },
          { point: 'k3', met: true, quote: 'How much is it?' },
        ],
        better: [
          { said: 'I want a tea number 3', better: 'Could I have a tea, please?' },
          // Not her line: dropped, never rewritten.
          { said: 'Give me cake', better: 'May I have some cake?' },
        ],
      };
    });
    const twelfth = await say(l, 'Bye!');
    expect(twelfth.body.status).toBe('done');
    expect((feedbackReq as unknown as LlmRequest).system).toBe(ROLEPLAY_FEEDBACK_SYSTEM);
    expect(await turnsOf(id)).toEqual({ turns: 12, status: 'ended', ended_reason: 'turns' });

    const tail = twelfth.body.home.thread.slice(-2);
    expect(tail[0]!.text).toBe('Thank you, goodbye!');
    const fb = tail[1]!.text;
    expect(fb).toContain('Begrüßen: geschafft – „Hello“');
    expect(fb).toContain('Etwas bestellen: noch nicht dabei');
    expect(fb).not.toContain('Could I have a coffee');
    expect(fb).toContain('Nach dem Preis fragen: geschafft – „How much is it?“');
    expect(fb).toContain('„I want a tea number 3“ → „Could I have a tea, please?“');
    expect(fb).not.toContain('cake');
    // No grade, no score, no count.
    expect(fb).not.toMatch(/\d\s*(\/|von|of)\s*\d/);
    expect(twelfth.body.home.roleplay).toBeNull();
    expect(roleplayCard(twelfth.body.home)?.status).toBe('ended');

    // Stored for her export, as checked — not as the model wrote it.
    const stored = await env.db.one<{ feedback: { points: Array<{ met: boolean }> } }>(
      `select feedback from buddy_roleplays where id = $1`,
      [id],
    );
    expect(stored.feedback.points.map((p) => p.met)).toEqual([true, false, true]);

    // After the scene, Buddy is Buddy again: a normal turn with STATE.
    let normal = '';
    env.llm.script('buddy_turn', (req: LlmRequest) => {
      normal = ScriptedGateway.textOf(req);
      return turn({ reply: 'Gern geschehen!' });
    });
    await say(l, 'danke!');
    expect(normal).toContain('STATE');
  });

  it('ends when she says so; without a line played there is no feedback call', async () => {
    const { l, id } = await started('Nora');
    env.llm.script('buddy_turn', { json: line('', { leave: true, her_language: 'de' }) });
    const res = await say(l, 'ich will aufhören');
    expect(res.body.status).toBe('done');
    expect(await turnsOf(id)).toEqual({ turns: 0, status: 'ended', ended_reason: 'her' });
    expect(res.body.home.thread.at(-1)!.text).toBe(
      'Okay, wir hören mit dem Rollenspiel auf. Sag Bescheid, wenn du nochmal willst.',
    );
  });

  it('a concern ends the scene with the fixed caring reply and no feedback', async () => {
    const { l, id } = await started('Ida');
    env.llm.script('buddy_turn', { json: line('', { concern: true, her_language: 'de' }) });
    const res = await say(l, 'zuhause schlägt mich jemand');
    expect(res.body.status).toBe('done');
    expect(await turnsOf(id)).toMatchObject({ status: 'ended', ended_reason: 'concern' });
    expect(res.body.home.thread.at(-1)!.text).toContain('116 111');
  });

  it('ends with her tap: feedback once, a second tap is refused, another learner gets 404', async () => {
    const { l, id } = await started('Ava');
    env.llm.script('buddy_turn', { json: line('Welcome! What would you like?') });
    await say(l, 'Good afternoon!');
    const other = await onboard(env, { relation: 'child', name: 'Zoe', birthDate: '2013-05-04' });
    const foreign = await other.api.post(`/buddy/roleplays/${id}/end`, {});
    expect(foreign.status).toBe(404);
    expect((await turnsOf(id)).status).toBe('active');

    env.llm.script('buddy_turn', {
      json: { points: [{ point: 'k1', met: true, quote: 'Good afternoon!' }], better: [] },
    });
    const ended = await l.api.post<EndRoleplayResponse>(`/buddy/roleplays/${id}/end`, {});
    expect(ended.status).toBe(200);
    expect(ended.body.home.roleplay).toBeNull();
    expect(ended.body.home.thread.at(-1)!.text).toContain(
      'Begrüßen: geschafft – „Good afternoon!“',
    );
    // The two points the model said nothing about are not managed: nothing showed them.
    expect(ended.body.home.thread.at(-1)!.text).toContain('Etwas bestellen: noch nicht dabei');
    expect(await turnsOf(id)).toEqual({ turns: 1, status: 'ended', ended_reason: 'her' });

    const again = await l.api.post(`/buddy/roleplays/${id}/end`, {});
    expect(again.status).toBe(409);
  });

  it('a stale context during an in-role turn applies it once, after a fresh look', async () => {
    const { l, id } = await started('Lia');
    let calls = 0;
    env.llm.script(
      'buddy_turn',
      async () => {
        calls++;
        // Something changed while the model wrote (a setting tapped elsewhere).
        await bumpContext(env.db, l.learnerId);
        return line('First try.');
      },
      () => {
        calls++;
        return line('Second try.');
      },
    );
    const res = await say(l, 'Hello there!');
    expect(res.body.status).toBe('done');
    expect(calls).toBe(2);
    expect((await turnsOf(id)).turns).toBe(1);
    const texts = res.body.home.thread.map((m) => m.text);
    expect(texts).toContain('Second try.');
    expect(texts).not.toContain('First try.');
    const stale = await env.db.query(
      `select 1 from buddy_decisions where learner_id = $1 and disposition = 'stale'`,
      [l.learnerId],
    );
    expect(stale).toHaveLength(1);
  });

  it('an interrupted in-role turn is taken over once; the stalled runner cannot count it again', async () => {
    const { l, id } = await started('Ela');
    // The start turn's call is in the record already; wait for the in-role one.
    const before = env.llm.callsFor('buddy_turn').length;
    let release!: (v: unknown) => void;
    const stuck = new Promise((r) => (release = r));
    env.llm.script('buddy_turn', () => stuck, { json: line('Recovered line.') });
    const first = say(l, 'Hi, a lemonade please.');
    await waitFor(() => env.llm.callsFor('buddy_turn').length > before);
    env.clock.minutes(4);
    await tick(env);
    expect((await turnsOf(id)).turns).toBe(1);
    release(line('Too late.'));
    const late = await first;
    expect(late.body.status).toBe('done');
    expect((await turnsOf(id)).turns).toBe(1);
    const buddy = await env.db.query<{ text: string }>(
      `select text from buddy_messages where learner_id = $1 and role = 'buddy' order by seq`,
      [l.learnerId],
    );
    expect(buddy.map((m) => m.text)).toEqual([
      'Los geht’s! — Good afternoon! What can I get you?',
      'Recovered line.',
    ]);
  });

  it('a scene she left for half an hour no longer takes over her next message', async () => {
    const { l, id } = await started('Romy');
    env.clock.minutes(31);
    const before = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(before.roleplay).toBeNull();
    expect(roleplayCard(before)?.status).toBe('ended');
    let normal = '';
    env.llm.script('buddy_turn', (req: LlmRequest) => {
      normal = ScriptedGateway.textOf(req);
      return turn({ reply: 'Hallo wieder!' });
    });
    await say(l, 'hallo');
    expect(normal).toContain('STATE');
    expect((await turnsOf(id)).turns).toBe(0);
  });
});
