// Diktat end to end (issue #242): Buddy reads a word aloud, she types it, code checks it.
//
// What must hold:
//   · Regel 0: the API never sends the word while the question is open — not in the question,
//     not in a hint, not in a reply to a wrong answer, not on the home screen. It arrives with the
//     solution, once the question is closed;
//   · the voice is given the KEY, character for character — never a text a model wrote;
//   · the check is exact and strict (case, ß/ss), decided by code, and a miss names the place
//     without a model call;
//   · the words of a list are hers: an entry the model changed is not a question;
//   · another learner's session, recording and sheet are a 404; a repeated request is one.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import type {
  AnswerResponse,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { randomUUID as uuid } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type ErrorBody = { error: { code: string; details?: { reason?: string } } };

const WORDS = ['Schwimmen', 'Biene', 'Straße'];
const TYPED = 'Meine Lernwörter: Schwimmen, Biene, Straße';

function script(env: TestEnv, entries: string[] = WORDS, from: 'list' | 'topic' = 'list'): void {
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Lernwörter',
      subject: { name: 'Deutsch', kind: 'german' },
      items: [],
      dictation: { from, lang: 'de', topic: 'Lernwörter', entries },
    },
  });
}

/** Every word of the run, in any field of `body` — the leak check of Regel 0. */
function leaked(body: unknown, words: readonly string[] = WORDS): string[] {
  const text = JSON.stringify(body);
  return words.filter((w) => text.includes(w));
}

describe.skipIf(!dbReady)('Diktat', () => {
  let env: TestEnv;
  let lena: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2016-02-10' });
  });
  afterEach(async () => {
    await env?.close();
  });

  const start = (over: Record<string, unknown> = {}) =>
    lena.api.post<SessionView>('/practice/topic', {
      client_request_id: uuid(),
      kind: 'spelling_dictation',
      text: TYPED,
      ...over,
    });
  const answer = (session: SessionView, itemId: string, text: string) =>
    lena.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: uuid(),
      item_id: itemId,
      text,
    });

  it('never sends the word while the question is open (Regel 0)', async () => {
    script(env);
    const res = await start();
    expect(res.status).toBe(201);
    const session = res.body;
    expect(session.items).toHaveLength(3);
    for (const si of session.items) {
      expect(si.item.kind).toBe('spelling_dictation');
      // The recording is named, never its words; each word is its own recording.
      expect(si.item.listen?.ref).toMatch(/^h[1-9]$/);
      expect(si.answer).toBeNull();
      expect(si.listen_transcript).toBeNull();
      expect(si.hint_available).toBe(false);
      expect(si.hints_left).toBe(0);
      expect(si.item.tap_choices).toBeNull();
      expect(si.item.prompt).toBe('Hör zu und schreib das Wort.');
    }
    expect(new Set(session.items.map((si) => si.item.listen?.ref)).size).toBe(3);
    expect(leaked(session)).toEqual([]);
    // The same through every way the app reads it: the session again and the home screen.
    const again = await lena.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(again.status).toBe(200);
    expect(leaked(again.body)).toEqual([]);
    const home = await lena.api.get<unknown>('/buddy');
    expect(home.status).toBe(200);
    expect(leaked(home.body)).toEqual([]);
    // Written in the background for every other run — never for a Diktat: no hint model call.
    await env.flushBackground();
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    const hints = await env.db.query<{ hints: string[] }>(
      `select hints from items where learner_id = $1`,
      [lena.learnerId],
    );
    expect(hints.every((h) => h.hints.length === 0)).toBe(true);
  });

  it('reads the key itself aloud — again and slower — and the database holds the two together', async () => {
    script(env);
    const session = (await start()).body;
    const first = session.items[0]!;
    const hear = (slow?: boolean) =>
      lena.api.post<{ audio_base64: string }>(`/practice/sessions/${session.id}/listen`, {
        item_id: first.item.id,
        ...(slow ? { slow: true } : {}),
      });
    expect((await hear()).status).toBe(200);
    expect(env.speech.calls[0]).toMatchObject({ text: 'Schwimmen', locale: 'de-DE', rate: 1 });
    expect((await hear()).status).toBe(200);
    expect(env.speech.calls).toHaveLength(1);
    expect((await hear(true)).status).toBe(200);
    expect(env.speech.calls[1]).toMatchObject({ text: 'Schwimmen', rate: 0.8 });

    // Migration 0081: a Diktat whose recording is not its key cannot be stored.
    await expect(
      env.db.query(
        `update items set listen_task = jsonb_build_object('text', 'schwimmen', 'lang', 'de')
          where id = $1`,
        [first.item.id],
      ),
    ).rejects.toThrow(/items_dictation_shape/);
    await expect(
      env.db.query(`update items set spelling = 'gentle' where id = $1`, [first.item.id]),
    ).rejects.toThrow(/items_dictation_shape/);
  });

  it('checks strictly, names the place without a model, and gives the word only once it is closed', async () => {
    script(env);
    const session = (await start()).body;
    const id = session.items[0]!.item.id;

    const lower = await answer(session, id, 'schwimmen');
    expect(lower.status).toBe(200);
    expect(lower.body.verdict).toBe('partially_correct');
    expect(lower.body.reply.text).toBe('Fast – „schwimmen“ schreibt man hier groß.');
    expect(lower.body.session.items[0]!.status).toBe('open');
    expect(leaked(lower.body)).toEqual([]);

    const single = await answer(session, id, 'Schwimen');
    expect(single.body.reply.text).toBe('Fast – bei „Schwimen“ fehlt ein Doppel-m.');
    expect(leaked(single.body)).toEqual([]);

    const right = await answer(session, id, 'Schwimmen');
    expect(right.body.verdict).toBe('correct');
    const closed = right.body.session.items.find((si) => si.item.id === id)!;
    expect(closed.answer).toBe('Schwimmen');
    // The recording is the key: it is not repeated as a "what you heard" text.
    expect(closed.listen_transcript).toBeNull();
    // ß/ss is not folded.
    const street = session.items[2]!.item.id;
    const ss = await answer(session, street, 'Strasse');
    expect(ss.body.verdict).toBe('partially_correct');
    expect(ss.body.reply.text).toBe('Fast – bei „Strasse“ schreibt man ß statt s oder ss.');
    // Not one model call for any of it: no tutor, and no hint.
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('shows the word after the third miss, and asks for no hint', async () => {
    script(env);
    const session = (await start()).body;
    const id = session.items[1]!.item.id;
    const hint = await lena.api.post<ErrorBody>(`/practice/sessions/${session.id}/hint`, {
      client_turn_id: uuid(),
      item_id: id,
    });
    expect(hint.status).toBe(409);
    expect(hint.body.error.details?.reason).toBe('no_hints');
    await answer(session, id, 'Bine');
    await answer(session, id, 'Bihne');
    const third = await answer(session, id, 'Bine');
    const closed = third.body.session.items.find((si) => si.item.id === id)!;
    expect(closed.status).toBe('revealed');
    expect(closed.answer).toBe('Biene');
    // The word stands in the solution card; the reply does not say it a second time.
    expect(third.body.reply.text).toBe(
      'Kein Problem – so schreibt man es. Hör es dir dazu noch einmal an.',
    );
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('keeps only the words of her list: an entry the model changed is not a question', async () => {
    script(env, ['Schwimmen', 'Bienen', 'Strasse', 'Fahrrad']);
    const session = (await start()).body;
    expect(session.items).toHaveLength(1);
    const keys = await env.db.query<{ answer: string; origin: string }>(
      `select answer, origin from items where learner_id = $1`,
      [lena.learnerId],
    );
    expect(keys).toEqual([{ answer: 'Schwimmen', origin: 'typed' }]);
  });

  it('a topic gets Buddy’s own words, marked as his', async () => {
    script(env, ['Wiese', 'Spiel'], 'topic');
    const session = (await start({ text: 'ie-Wörter' })).body;
    expect(session.items.map((si) => si.item.origin)).toEqual(['buddy', 'buddy']);
  });

  it('takes the words from her sheet, and only those', async () => {
    const sheet = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, title, extracted_text, created_at)
       values ($1, gen_random_uuid(), 'ready', 1, 'Lernwörter Woche 5', $2, $3) returning id`,
      [
        lena.learnerId,
        'Lernwörter Woche 5\n1. die Biene\n2. schwimmen\n3. die Straße',
        env.clock.now(),
      ],
    );
    script(env, ['Biene', 'schwimmen', 'Straße', 'Hund'], 'list');
    const res = await start({ text: 'die Lernwörter vom Blatt', material_id: sheet.id });
    expect(res.status).toBe(201);
    const keys = await env.db.query<{ answer: string }>(
      `select answer from items where learner_id = $1 order by answer`,
      [lena.learnerId],
    );
    expect(keys.map((k) => k.answer)).toEqual(['Biene', 'Straße', 'schwimmen']);
    // The model was given the sheet's text to copy from.
    const sent = JSON.stringify(env.llm.callsFor('explain')[0]);
    expect(sent).toContain('SHEET TEXT');
    expect(sent).toContain('die Straße');
  });

  it('comes from Buddy’s offer on her sheet, prepared before she taps', async () => {
    await env.db.query(
      `insert into materials (learner_id, client_request_id, status, photo_count, title, extracted_text, created_at)
       values ($1, gen_random_uuid(), 'ready', 1, 'Lernwörter', 'Schwimmen Biene Straße', $2)`,
      [lena.learnerId, env.clock.now()],
    );
    env.llm.script('buddy_turn', {
      json: {
        lookups: [],
        concern: false,
        also_asked: false,
        actions: [
          {
            tool: 'offer_learning',
            args: { kind: 'spelling_dictation', text: 'Lernwörter', sheet: 'sh1' },
          },
        ],
        reply: 'Gern – ich lese dir deine Lernwörter vor.',
        options: null,
        asks_permission: false,
      },
    });
    script(env);
    const said = await lena.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: uuid(),
      text: 'Mach mit mir ein Diktat mit meinen Lernwörtern',
    });
    expect(said.status).toBe(200);
    const offer = said.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(offer?.summary).toMatchObject({ kind: 'spelling_dictation', startable: true });
    const materialId = (offer!.summary as { material_id: string | null }).material_id;
    expect(materialId).not.toBeNull();
    await env.flushBackground();
    // Her tap finds the prepared run under the offer's id: no second model call.
    const tap = await start({
      client_request_id: offer!.id,
      text: 'Lernwörter',
      material_id: materialId,
    });
    expect(tap.status).toBe(201);
    expect(tap.body.items).toHaveLength(3);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    expect(leaked(tap.body)).toEqual([]);
  });

  it('is one run for one request, and one turn for one answer', async () => {
    script(env);
    const requestId = uuid();
    const a = await start({ client_request_id: requestId });
    const b = await start({ client_request_id: requestId });
    expect(b.body.id).toBe(a.body.id);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    const turnId = uuid();
    const body = { client_turn_id: turnId, item_id: a.body.items[0]!.item.id, text: 'Schwimen' };
    const one = await lena.api.post<AnswerResponse>(`/practice/sessions/${a.body.id}/answer`, body);
    const two = await lena.api.post<AnswerResponse>(`/practice/sessions/${a.body.id}/answer`, body);
    expect(two.body.reply).toEqual(one.body.reply);
    const turns = await env.db.query(
      `select 1 from practice_turns where session_id = $1 and role = 'learner'`,
      [a.body.id],
    );
    expect(turns).toHaveLength(1);
  });

  it('answers another learner’s session, recording and sheet with a 404', async () => {
    script(env);
    const session = (await start()).body;
    const sam = await onboard(env, { name: 'Sam' });
    const itemId = session.items[0]!.item.id;
    expect((await sam.api.get(`/practice/sessions/${session.id}`)).status).toBe(404);
    expect(
      (await sam.api.post(`/practice/sessions/${session.id}/listen`, { item_id: itemId })).status,
    ).toBe(404);
    expect(
      (
        await sam.api.post(`/practice/sessions/${session.id}/answer`, {
          client_turn_id: uuid(),
          item_id: itemId,
          text: 'Schwimmen',
        })
      ).status,
    ).toBe(404);
    const sheet = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, extracted_text, created_at)
       values ($1, gen_random_uuid(), 'ready', 1, 'Schwimmen', $2) returning id`,
      [lena.learnerId, env.clock.now()],
    );
    script(env);
    const stolen = await sam.api.post<ErrorBody>('/practice/topic', {
      client_request_id: uuid(),
      kind: 'spelling_dictation',
      text: 'Lernwörter',
      material_id: sheet.id,
    });
    expect(stolen.status).toBe(404);
  });

  it('prepares nothing when there is no voice to read the words', async () => {
    const off = await createTestEnv({ speech: 'disabled', start: '2026-10-02T15:00:00Z' });
    try {
      const mia = await onboard(off, { relation: 'child', name: 'Mia', birthDate: '2016-02-10' });
      script(off);
      const res = await mia.api.post<ErrorBody>('/practice/topic', {
        client_request_id: uuid(),
        kind: 'spelling_dictation',
        text: TYPED,
      });
      expect(res.status).toBe(503);
      expect(res.body.error.details?.reason).toBe('speech_off');
      expect(off.llm.callsFor('explain')).toHaveLength(0);
    } finally {
      await off.close();
    }
  });

  it('keeps a Diktat out of a written run', async () => {
    script(env);
    await start();
    const subject = await env.db.one<{ id: string }>(
      `select id from subjects where learner_id = $1`,
      [lena.learnerId],
    );
    const res = await lena.api.post<ErrorBody>('/practice/sessions', { subject_id: subject.id });
    expect(res.status).toBe(404);
    expect(res.body.error.details?.reason).toBe('no_questions');
  });
});
