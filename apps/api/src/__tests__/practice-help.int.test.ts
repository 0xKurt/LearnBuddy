// Help around a question (issue #388; report „Hilfe und Fragen beim Üben" §3, §5, §8;
// docs/architecture.md §Practice), checked against the database, not only the reply:
//   - "Tipp" stands out once after two misses, never in a test, and no more once she took one;
//   - a shown solution is followed by a similar task: brought forward, or one of hers joins;
//   - Buddy offers a Probetest only once practice goes well — or when she asked, in her words;
//   - the test's review explains each question once it is handed in, never while it runs;
//   - „Warum stimmt das?": three reasons written with the hints and checked by code, her tap
//     judged by code (no model), once per question, never on an open one or someone else's;
//   - the practice test's fixed line fits the form: "schreib" only where she writes her answer;
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { t } from '../i18n/index.js';
import { LlmError, type LlmRequest } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  finishRun,
  onboard,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Was ist 3 · 4?',
  answer: '12',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Einmaleins',
  difficulty: 1,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const ORDER = {
  type: 'order',
  prompt: 'Bring die Keimung in die richtige Reihenfolge.',
  elements: ['Der Samen nimmt Wasser auf', 'Die Keimwurzel wächst', 'Die Blätter entfalten sich'],
  numeric: null,
  topic: 'Keimung',
  difficulty: 2,
  prompt_lang: 'de',
};

/** What the tutor says, as structured output. */
const tutor = (over: Record<string, unknown>) => ({
  json: {
    intent: 'question',
    verdict: 'not_an_attempt',
    reply: 'Mal heißt: so viele Gruppen, und in jeder gleich viele.',
    gave_hint: true,
    revealed_answer: false,
    concern: false,
    ...over,
  },
});

describe.skipIf(!dbReady)('help around a question (issue #388)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T15:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  /** A topic run whose scripted model wrote these questions. */
  async function start(
    kind: 'practice' | 'test',
    items: unknown[],
    structured: unknown[] = [],
    hints: unknown[] = [],
  ): Promise<SessionView> {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Einmaleins',
        subject: { name: 'Mathe', kind: 'math' },
        items,
        structured,
      },
    });
    if (kind === 'practice' || hints.length > 0)
      env.llm.script('hints', { json: { items: hints } });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Einmaleins üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
  }

  const ask = (s: { id: string }, itemId: string, text: string) =>
    l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/ask`, {
      client_turn_id: randomUUID(),
      item_id: itemId,
      text,
    });

  const answer = (s: { id: string }, itemId: string, text: string, turn = randomUUID()) =>
    l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      text,
    });

  const view = async (s: { id: string }) =>
    (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;

  const HINTS = [{ n: 1, hints: ['Mal heißt: 3 Gruppen mit je 4.', 'Zähl 4 + 4 + 4.'] }];

  describe('"Tipp" after two misses', () => {
    it('is offered quietly once she missed twice, and no more once she took a hint', async () => {
      const s = await start(
        'practice',
        [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42' })],
        [],
        HINTS,
      );
      const id = s.items[0]!.item.id;
      expect(s.items[0]!.hint_offered).toBe(false);
      await answer(s, id, '11');
      expect((await view(s)).items[0]!.hint_offered).toBe(false);
      // The second miss goes to the tutor (#156); the judgement stays the rules'.
      env.llm.script(
        'tutor',
        tutor({
          intent: 'answer',
          verdict: 'incorrect',
          gave_hint: false,
          reply: 'Schau noch mal.',
        }),
      );
      await answer(s, id, '13');
      const after = (await view(s)).items[0]!;
      expect(after).toMatchObject({ status: 'open', attempts: 2, hint_available: true });
      expect(after.hint_offered).toBe(true);
      // Never on another question, never pushed: only the flag on this one.
      expect((await view(s)).items[1]!.hint_offered).toBe(false);
      const tip = await l.api.post(`/practice/sessions/${s.id}/hint`, {
        client_turn_id: randomUUID(),
        item_id: id,
      });
      expect(tip.status).toBe(200);
      expect((await view(s)).items[0]!.hint_offered).toBe(false);
    });

    it('is never offered in a test', async () => {
      const s = await start('test', [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42' })]);
      expect(s.items.every((i) => i.hint_offered === false)).toBe(true);
    });
  });

  describe('a similar task right after a shown solution', () => {
    const reveal = (s: { id: string }, itemId: string, as = l) =>
      as.api.post<SessionView>(`/practice/sessions/${s.id}/reveal`, { item_id: itemId });

    const order = (v: SessionView) => v.items.map((i) => `${i.item.prompt}:${i.status}`);

    it('brings a question on the same topic forward after the third miss', async () => {
      const s = await start('practice', [
        item({}),
        item({ prompt: 'Was ist ½ + ¼?', answer: '3/4', topic: 'Brüche' }),
        item({ prompt: 'Was ist 6 · 7?', answer: '42' }),
      ]);
      const id = s.items[0]!.item.id;
      await answer(s, id, '11');
      env.llm.script('tutor', tutor({ intent: 'answer', verdict: 'incorrect', gave_hint: false }));
      await answer(s, id, '13');
      const third = await answer(s, id, '14');
      expect(third.body.session.items[0]!.status).toBe('revealed');
      const v = third.body.session;
      // The next question is the one on the same topic; the other one waits behind it.
      expect(v.current_item_id).toBe(
        v.items.find((i) => i.item.prompt === 'Was ist 6 · 7?')!.item.id,
      );
      expect(order(v)).toEqual([
        'Was ist 3 · 4?:revealed',
        'Was ist 6 · 7?:open',
        'Was ist ½ + ¼?:open',
      ]);
    });

    it('takes one from her own questions on the topic after "Lösung zeigen", never another learner\'s', async () => {
      // Mia has questions on the same topic; they are never hers to get.
      const mia = await onboard(env, {
        relation: 'child',
        name: 'Mia',
        birthDate: '2014-05-01',
        pin: '1357',
      });
      const lena = l;
      l = mia;
      await start('practice', [item({ prompt: 'Was ist 9 · 9?', answer: '81' })]);
      l = lena;
      const first = await start('practice', [item({ prompt: 'Was ist 7 · 8?', answer: '56' })]);
      const s = await start('practice', [
        item({}),
        item({ prompt: 'Was ist ½ + ¼?', answer: '3/4', topic: 'Brüche' }),
      ]);
      expect(s.items).toHaveLength(2);
      const id = s.items[0]!.item.id;
      await answer(s, id, '11');
      const shown = await reveal(s, id);
      expect(shown.status).toBe(200);
      expect(order(shown.body)).toEqual([
        'Was ist 3 · 4?:skipped',
        'Was ist 7 · 8?:open',
        'Was ist ½ + ¼?:open',
      ]);
      expect(shown.body.current_item_id).toBe(first.items[0]!.item.id);
      // Revealing again changes nothing: still one similar task, not two.
      const again = await reveal(s, id);
      expect(again.body.items).toHaveLength(3);
      // Mia cannot reveal in Lena's run.
      expect((await reveal(s, id, mia)).status).toBe(404);
    });

    it('keeps the run as it is when nothing on the topic is left, and in a test', async () => {
      const s = await start('practice', [
        item({}),
        item({ prompt: 'Was ist ½ + ¼?', answer: '3/4', topic: 'Brüche' }),
      ]);
      const id = s.items[0]!.item.id;
      await answer(s, id, '11');
      const shown = await reveal(s, id);
      expect(order(shown.body)).toEqual(['Was ist 3 · 4?:skipped', 'Was ist ½ + ¼?:open']);

      const test = await start('test', [
        item({ prompt: 'Was ist 4 · 4?', answer: '16' }),
        item({ prompt: 'Was ist ⅓ + ⅓?', answer: '2/3', topic: 'Brüche' }),
      ]);
      const skipped = await reveal(test, test.items[0]!.item.id);
      expect(skipped.body.items).toHaveLength(2);
    });
  });

  describe('a Probetest offered by Buddy', () => {
    /** Buddy's structured turn, as the scripted model writes it. */
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
    const offerTest = (asked?: string) => ({
      tool: 'offer_learning',
      args: { kind: 'test', text: 'Einmaleins', goal: null, ...(asked ? { asked } : {}) },
    });
    const testSet = {
      json: {
        usable: true,
        title: 'Einmaleins',
        subject: { name: 'Mathe', kind: 'math' },
        items: [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42' })],
      },
    };
    const say = async (text: string) => {
      const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
        client_message_id: randomUUID(),
        text,
      });
      expect(res.status).toBe(200);
    };
    const offered = async () =>
      (
        await env.db.query<{ kind: string }>(
          `select result->>'kind' as kind from buddy_actions
            where learner_id = $1 and tool = 'offer_learning' and status = 'applied' order by seq`,
          [l.learnerId],
        )
      ).map((r) => r.kind);
    /** What code told the model when it refused the first answer; then its second answer. */
    const repairs: string[] = [];
    const refusedThen = (next: Record<string, unknown>) => (req: LlmRequest) => {
      const m = /action 1 \(offer_learning\): ([^\n]+)/.exec(ScriptedGateway.textOf(req));
      repairs.push(m ? m[1]! : '');
      return turn(next);
    };
    /** A practice run on the topic, answered: the first `right` of five right, the rest shown. */
    async function practise(right: number) {
      const s = await start(
        'practice',
        [1, 2, 3, 4, 5].map((n) => item({ prompt: `Was ist ${n} · 3?`, answer: String(n * 3) })),
      );
      for (const [n, si] of s.items.entries()) {
        const k = Number(/Was ist (\d)/.exec(si.item.prompt)![1]);
        if (n < right) {
          await answer(s, si.item.id, String(k * 3));
        } else {
          await answer(s, si.item.id, '0');
          await l.api.post(`/practice/sessions/${s.id}/reveal`, { item_id: si.item.id });
        }
      }
    }

    it("is refused as Buddy's own idea while practice does not go well yet", async () => {
      repairs.length = 0;
      await practise(2);
      env.llm.script(
        'buddy_turn',
        { json: turn({ actions: [offerTest()] }) },
        refusedThen({
          actions: [
            { tool: 'offer_learning', args: { kind: 'practice', text: 'Einmaleins', goal: null } },
          ],
          reply: 'Lass uns erst noch üben.',
        }),
      );
      env.llm.script('explain', testSet);
      await say('Ich glaub, ich kann das Einmaleins jetzt.');
      await env.flushBackground();
      expect(repairs[0]).toContain('offered only once her practice on it is going well');
      expect(await offered()).toEqual(['practice']);
    });

    it("is offered as Buddy's idea once practice goes well", async () => {
      await practise(5);
      env.llm.script('buddy_turn', { json: turn({ actions: [offerTest()] }) });
      env.llm.script('explain', testSet);
      await say('Ich glaub, ich kann das Einmaleins jetzt.');
      await env.flushBackground();
      expect(await offered()).toEqual(['test']);
    });

    it('is offered when she asked in her words, practised or not — never on invented words', async () => {
      repairs.length = 0;
      env.llm.script(
        'buddy_turn',
        { json: turn({ actions: [offerTest('Mach mit mir einen Probetest')] }) },
        refusedThen({ reply: 'Magst du lieber erst üben?' }),
      );
      await say('Kannst du mir was zum Einmaleins zeigen?');
      expect(repairs[0]).toContain("is not the learner's exact words");
      expect(await offered()).toEqual([]);

      env.llm.script('buddy_turn', {
        json: turn({ actions: [offerTest('Mach mit mir einen Probetest')] }),
      });
      env.llm.script('explain', testSet);
      await say('Mach mit mir einen Probetest zum Einmaleins');
      await env.flushBackground();
      expect(await offered()).toEqual(['test']);
    });
  });

  describe('„Warum stimmt das?"', () => {
    const REASONS = [
      'Mal heißt: so oft die gleiche Zahl zusammenzählen.',
      'Beim Malnehmen zählt man die beiden Zahlen zusammen.',
      'Die größere Zahl gewinnt immer.',
    ];
    const WHY = { reasons: REASONS, correct: 0 };
    const why = (
      sess: { id: string },
      itemId: string,
      choice: number,
      turn = randomUUID(),
      as = l,
    ) =>
      as.api.post<AnswerResponse>(`/practice/sessions/${sess.id}/why`, {
        client_turn_id: turn,
        item_id: itemId,
        choice,
      });
    const turnsOf = (sessionId: string, itemId: string) =>
      env.db.query<{ role: string; text: string; reexplain: string | null }>(
        `select role, text, reexplain from practice_turns
          where session_id = $1 and item_id = $2 and reexplain = 'why' order by seq`,
        [sessionId, itemId],
      );
    const llmCalls = async () =>
      (await env.db.one<{ n: number }>(`select count(*)::int as n from llm_calls`)).n;
    /** A practice run whose first question got its reasons with its hints, shown at once. */
    async function shownWithReasons(reasons: unknown = WHY) {
      const s = await start(
        'practice',
        [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42', topic: 'Andere' })],
        [],
        [{ n: 1, hints: ['Mal heißt: 3 Gruppen mit je 4.'], worked_solution: null, why: reasons }],
      );
      const id = s.items[0]!.item.id;
      // Open: the reasons are never sent — they would point at the rule before she tried.
      expect(s.items[0]!.why).toBeNull();
      await answer(s, id, '11');
      const shown = (
        await l.api.post<SessionView>(`/practice/sessions/${s.id}/reveal`, { item_id: id })
      ).body;
      return { s, id, shown };
    }

    it('offers the three reasons once the solution is out, and judges her tap by code', async () => {
      const { s, id, shown } = await shownWithReasons();
      expect(shown.items.find((i) => i.item.id === id)!.why).toEqual(REASONS);
      const before = await llmCalls();
      const right = await why(s, id, 0);
      expect(right.status, JSON.stringify(right.body)).toBe(200);
      expect(right.body.reply.text).toBe(t('de', 'practice.why.right', { reason: REASONS[0]! }));
      expect(await llmCalls()).toBe(before);
      expect(await turnsOf(s.id, id)).toEqual([
        { role: 'learner', text: REASONS[0], reexplain: 'why' },
        {
          role: 'tutor',
          text: t('de', 'practice.why.right', { reason: REASONS[0]! }),
          reexplain: 'why',
        },
      ]);
      // Asked once: the reasons are gone, and a second tap is refused.
      expect(right.body.session.items.find((i) => i.item.id === id)!.why).toBeNull();
      const second = await why(s, id, 1);
      expect(second.status).toBe(409);
      // Nothing about her try changed: this is learning, not grading.
      const row = await env.db.one(
        `select status, attempts, hints_used from session_items where session_id = $1 and item_id = $2`,
        [s.id, id],
      );
      expect(row).toEqual({ status: 'skipped', attempts: 1, hints_used: 0 });
    });

    it('names the true reason after a wrong pick, and counts a repeated tap once', async () => {
      const { s, id } = await shownWithReasons();
      const turn = randomUUID();
      const wrong = await why(s, id, 2, turn);
      expect(wrong.status).toBe(200);
      expect(wrong.body.reply.text).toBe(
        t('de', 'practice.why.not_quite', { reason: REASONS[0]! }),
      );
      const again = await why(s, id, 2, turn);
      expect(again.status).toBe(200);
      expect(again.body.reply.id).toBe(wrong.body.reply.id);
      expect(await turnsOf(s.id, id)).toHaveLength(2);
    });

    it("refuses an open question, a choice out of range and someone else's tap", async () => {
      const { s, id, shown } = await shownWithReasons();
      const open = shown.items.find((i) => i.status === 'open')!.item.id;
      expect((await why(s, open, 0)).status).toBe(409);
      expect((await why(s, id, 3)).status).toBe(422);
      const mia = await onboard(env, {
        relation: 'child',
        name: 'Mia',
        birthDate: '2014-05-01',
        pin: '1357',
      });
      expect((await why(s, id, 0, randomUUID(), mia)).status).toBe(404);
      expect(await turnsOf(s.id, id)).toHaveLength(0);
    });

    it('drops reasons that give the key away or are not three different ones', async () => {
      const leaking = { reasons: ['Weil 3 · 4 = 12 ist.', REASONS[1], REASONS[2]], correct: 0 };
      const { s, id, shown } = await shownWithReasons(leaking);
      expect(shown.items.find((i) => i.item.id === id)!.why).toBeNull();
      // The hints written in the same call are kept: only the reasons go.
      const row = await env.db.one<{ hints: string[]; why: unknown }>(
        `select hints, why from items where id = $1`,
        [id],
      );
      expect(row).toEqual({ hints: ['Mal heißt: 3 Gruppen mit je 4.'], why: null });
      expect((await why(s, id, 0)).status).toBe(409);

      const twice = await shownWithReasons({
        reasons: [REASONS[0], REASONS[0], REASONS[2]],
        correct: 1,
      });
      expect(twice.shown.items.find((i) => i.item.id === twice.id)!.why).toBeNull();
    });

    it('has no reasons when the hints call failed, and refuses a tap in a running test', async () => {
      env.llm.script('explain', {
        json: {
          usable: true,
          title: 'Einmaleins',
          subject: { name: 'Mathe', kind: 'math' },
          items: [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42' })],
          structured: [],
        },
      });
      env.llm.script('hints', { error: new LlmError('unavailable', 'down') });
      const res = await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: 'Einmaleins üben',
      });
      await env.flushBackground();
      const id = res.body.items[0]!.item.id;
      await answer(res.body, id, '11');
      const shown = (
        await l.api.post<SessionView>(`/practice/sessions/${res.body.id}/reveal`, { item_id: id })
      ).body;
      expect(shown.items.find((i) => i.item.id === id)!.why).toBeNull();

      const test = await start('test', [
        item({}),
        item({ prompt: 'Was ist 6 · 7?', answer: '42' }),
      ]);
      const tid = test.items[0]!.item.id;
      await answer(test, tid, '11');
      const inTest = await why(test, tid, 0);
      expect(inTest.status).toBe(409);
    });
  });

  describe("the practice test's review", () => {
    it('carries the worked solution per question once handed in, never while it runs', async () => {
      const WORKED = '3 · 4 heißt 3 Gruppen mit je 4: 4 + 4 + 4 = 12.';
      // A test shows no hint, but the hints call writes each question's worked way (#388 §3.2).
      const s = await start(
        'test',
        [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42' })],
        [],
        [{ n: 1, hints: ['Mal heißt: 3 Gruppen mit je 4.'], worked_solution: WORKED }],
      );
      const [a, b] = s.items.map((i) => i.item.id) as [string, string];
      expect(env.llm.callsFor('hints')).toHaveLength(1);
      // Never a hint in the test itself: "Tipp" is not there, and asking gets the fixed line.
      expect(s.items.every((i) => !i.hint_available && i.hints_left === 0)).toBe(true);
      await answer(s, a, '11');
      // Running: nothing explained, not even for the question she already answered.
      expect((await view(s)).items.map((i) => i.explanation)).toEqual([null, null]);
      const done = await finishRun(env, l, s.id);
      expect(done.status).toBe(200);
      const byId = new Map(done.body.items.map((i) => [i.item.id, i]));
      expect(byId.get(a)!.explanation).toBe(WORKED);
      // A question without a prepared way has no explanation to show: nothing is made up.
      expect(byId.get(b)!.explanation).toBeNull();
      // Someone else never sees it.
      const mia = await onboard(env, {
        relation: 'child',
        name: 'Mia',
        birthDate: '2014-05-01',
        pin: '1357',
      });
      expect((await mia.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    });
  });

  describe("the practice test's fixed line", () => {
    it('says "schreib" only where she writes her answer, and "antworte" on a tap or a board', async () => {
      const s = await start(
        'test',
        [
          item({}),
          item({ kind: 'multiple_choice', choices: ['10', '12', '14'], correct_choice: 1 }),
        ],
        [ORDER],
      );
      const byKind = new Map(s.items.map((i) => [i.item.kind, i.item.id]));
      expect([...byKind.keys()]).toEqual(
        expect.arrayContaining(['short', 'multiple_choice', 'order']),
      );
      const lines = new Map<string, string>();
      for (const [kind, id] of byKind) {
        env.llm.script('tutor', tutor({}));
        const res = await ask(s, id, 'Was muss ich hier machen?');
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        lines.set(kind, res.body.reply.text);
      }
      expect(lines.get('short')).toBe(t('de', 'practice.test_no_hints'));
      expect(lines.get('multiple_choice')).toBe(t('de', 'practice.test_no_hints_on_screen'));
      expect(lines.get('order')).toBe(t('de', 'practice.test_no_hints_on_screen'));
      // Nothing to write on a tap form: the line never tells her to.
      expect(lines.get('multiple_choice')).not.toMatch(/schreib/i);
    });
  });
});
