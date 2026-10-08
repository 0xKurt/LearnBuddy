// Her working, photographed (issue #444, step 3 of #221): the model copies the lines down, she
// sends the copy as her answer, and code checks the way — the same answer path as a typed one
// (`steps.ts`, Folgefehler in `taskParts.ts`), no tutor. The reading itself changes nothing and
// stores nothing. Failure paths: another learner's session, the same photo twice, a model outage,
// an unreadable photo and a guessed line, a question that moved on while the photo was read, and
// the questions and runs a photo of working is no answer to.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView, WorkReading } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError, type LlmRequest } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { tariffTask } from '../testing/scenarios/taskParts.js';

const dbReady = await testDatabaseAvailable();

/** What the server sees of a photo: a JPEG's first bytes, then anything. */
const PHOTO = `/9j/4AAQSkZJRgABAQ${'A'.repeat(600)}`;

const item = (over: Record<string, unknown> = {}) => ({
  kind: 'numeric',
  prompt: 'Löse: $2x + 3 = 7$',
  answer: '2',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Gleichungen',
  difficulty: 3,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const line = (text: string, readable = true) => ({ text, readable });

/** Her notebook: the way to x = 2,5 for 2x + 3 = 7, with step notes, broken in the first step. */
const NOTEBOOK = [line('2x + 3 = 7 | −3'), line('2x = 5 | :2'), line('x = 2,5')];

describe.skipIf(!dbReady)('her working, photographed (#444)', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-08T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-03-14' });
  });
  // Every scripted reading must be used, and nothing unscripted asked: a tutor call would mean
  // her copied path was not decided by code.
  afterEach(() => env.closeChecked());

  async function start(items: Record<string, unknown>[]): Promise<SessionView> {
    env.llm.script('explain', {
      json: { usable: true, title: 'Gleichungen', subject: null, items },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Gleichungen',
    });
    expect(res.status).toBe(201);
    await env.flushBackground();
    return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
  }

  const read = (s: SessionView, itemId: string, who: Learner = l, photo = PHOTO) =>
    who.api.post<WorkReading>(`/practice/sessions/${s.id}/work-photo`, {
      item_id: itemId,
      photo_base64: photo,
    });

  const answer = (s: SessionView, itemId: string, text: string, turn = randomUUID()) =>
    l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      text,
    });

  /** Nothing of the question moved: no turn, no try, still open. */
  async function untouched(s: SessionView, itemId: string): Promise<void> {
    const row = await env.db.one<{ status: string; attempts: number; turns: number }>(
      `select si.status, si.attempts,
              (select count(*)::int from practice_turns t where t.session_id = si.session_id) as turns
         from session_items si where si.session_id = $1 and si.item_id = $2`,
      [s.id, itemId],
    );
    expect(row).toEqual({ status: 'open', attempts: 0, turns: 0 });
  }

  it('copies her lines down; her answer from the copy is checked by code at the broken line', async () => {
    const s = await start([item()]);
    const id = s.items[0]!.item.id;
    env.llm.script('transcribe', { json: { found: 'working', lines: NOTEBOOK } });
    const res = await read(s, id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      status: 'read',
      lines: ['2x + 3 = 7 | −3', '2x = 5 | :2', 'x = 2,5'],
    });
    // The model saw the photo once and the question — nothing else, never the key.
    const [req] = env.llm.callsFor('transcribe') as [LlmRequest];
    expect(req.contents.flatMap((m) => m.parts)).toEqual([
      { text: 'QUESTION (context only, never answer it): Löse: $2x + 3 = 7$' },
      { inlineData: { mimeType: 'image/jpeg', data: PHOTO } },
    ]);
    // A reading is no answer: the question is as it was, and the photo is nowhere.
    await untouched(s, id);
    expect(env.storage.objects.size).toBe(0);

    // She sends the copy as it stands: the step notes are read past, the break is in line 1.
    const checked = await answer(s, id, res.body.lines.join('\n'));
    expect(checked.body.verdict).toBe('partially_correct');
    expect(checked.body.reply.text).toBe(
      'Bis Zeile 1 stimmt alles. Von dort zur nächsten Zeile geht etwas verloren – schau dir diesen Schritt nochmal an.',
    );
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('never passes on a guess: a line it could not read comes back as null, its text dropped', async () => {
    const s = await start([item()]);
    const id = s.items[0]!.item.id;
    env.llm.script('transcribe', {
      json: { found: 'working', lines: [line('2x + 3 = 7'), line('2x = 4', false), line('x = 2')] },
    });
    const res = await read(s, id);
    expect(res.body).toEqual({ status: 'read', lines: ['2x + 3 = 7', null, 'x = 2'] });
    expect(JSON.stringify(res.body)).not.toContain('2x = 4');
    await untouched(s, id);
  });

  it('an unreadable photo or one without her working says so, and changes nothing', async () => {
    const s = await start([item()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'transcribe',
      { json: { found: 'unreadable', lines: [] } },
      { json: { found: 'no_working', lines: [] } },
      // "Working", but not one line it could read: nothing was read.
      { json: { found: 'working', lines: [line('x = 2', false)] } },
    );
    expect((await read(s, id)).body).toEqual({ status: 'unreadable', lines: [] });
    expect((await read(s, id)).body).toEqual({ status: 'no_working', lines: [] });
    expect((await read(s, id)).body).toEqual({ status: 'unreadable', lines: [] });
    await untouched(s, id);
  });

  it("another learner's session is 404 and her photo never reaches the model", async () => {
    const s = await start([item()]);
    const other = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2011-05-01' });
    const res = await read(s, s.items[0]!.item.id, other);
    expect(res.status).toBe(404);
    expect(env.llm.callsFor('transcribe')).toHaveLength(0);
    await untouched(s, s.items[0]!.item.id);
  });

  it('the same photo twice is two readings that change nothing; her answer twice counts once', async () => {
    const s = await start([item()]);
    const id = s.items[0]!.item.id;
    const right = [line('2x + 3 = 7'), line('2x = 4'), line('x = 2')];
    env.llm.script(
      'transcribe',
      { json: { found: 'working', lines: right } },
      { json: { found: 'working', lines: right } },
    );
    const first = await read(s, id);
    const again = await read(s, id);
    expect(again.body).toEqual(first.body);
    await untouched(s, id);
    const turn = randomUUID();
    const sent = await answer(s, id, first.body.lines.join('\n'), turn);
    const resent = await answer(s, id, first.body.lines.join('\n'), turn);
    expect(sent.body.verdict).toBe('correct');
    expect(resent.body.verdict).toBe('correct');
    expect(resent.body.session.items[0]!.attempts).toBe(1);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a model outage is 503 and gives her allowance back; her next try reads', async () => {
    const s = await start([item()]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'transcribe',
      { error: new LlmError('unavailable', 'down') },
      { json: { found: 'working', lines: NOTEBOOK } },
    );
    const down = await read(s, id);
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({ error: { code: 'model_unavailable' } });
    const used = await env.db.maybeOne<{ calls: number }>(
      `select calls from usage_daily where learner_id = $1 and kind = 'transcribe'`,
      [l.learnerId],
    );
    expect(used?.calls ?? 0).toBe(0);
    await untouched(s, id);
    expect((await read(s, id)).body.status).toBe('read');
  });

  it('a question that moved on while the photo was read gets no copy (stale)', async () => {
    const s = await start([item()]);
    const id = s.items[0]!.item.id;
    // While the model reads, she answers the question on her other phone.
    env.llm.script('transcribe', async () => {
      const typed = await answer(s, id, '2');
      expect(typed.body.verdict).toBe('correct');
      return { found: 'working', lines: NOTEBOOK };
    });
    const res = await read(s, id);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: { code: 'stale', details: { reason: 'question_moved_on' } },
    });
    // And a question already closed is not read at all.
    const again = await read(s, id);
    expect(again.status).toBe(409);
    expect(env.llm.callsFor('transcribe')).toHaveLength(1);
  });

  it('is refused before the model for a question without a path and for what is not a JPEG', async () => {
    const s = await start([
      item({
        kind: 'multiple_choice',
        prompt: 'Was ist 2 + 2?',
        answer: '4',
        choices: ['3', '4'],
        correct_choice: 1,
      }),
      item(),
    ]);
    const choice = s.items.find((i) => i.item.kind === 'multiple_choice')!.item.id;
    const numeric = s.items.find((i) => i.item.kind === 'numeric')!.item.id;
    const noPath = await read(s, choice);
    expect(noPath.status).toBe(409);
    expect(noPath.body).toMatchObject({ error: { details: { reason: 'no_path' } } });
    const png = await read(s, numeric, l, `iVBORw0KGgo${'A'.repeat(600)}`);
    expect(png.status).toBe(422);
    expect(env.llm.callsFor('transcribe')).toHaveLength(0);
  });

  it('a photographed b) that goes on from her wrong a) is a Folgefehler, decided by code (#297)', async () => {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Handytarif',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      part_tasks: [tariffTask()],
    }));
    env.llm.script('hints', () => ({
      items: [1, 2, 3].map((n) => ({ n, hints: ['Lies die Lage genau.'], worked_solution: null })),
    }));
    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Lineare Funktionen, Aufgaben wie in der Klassenarbeit',
    });
    await env.flushBackground();
    const s = (await l.api.get<SessionView>(`/practice/sessions/${started.body.id}`)).body;
    const [a, b] = s.items.map((i) => i.item.id) as [string, string];
    expect((await answer(s, a, '10 €')).body.verdict).toBe('incorrect');
    env.llm.script('transcribe', {
      json: { found: 'working', lines: [line('10 € + 12 €'), line('= 22 €')] },
    });
    const copy = await read(s, b);
    const followed = await answer(s, b, copy.body.lines.join('\n'));
    expect(followed.body.verdict).toBe('correct');
    expect(followed.body.reply.text).toContain('Richtig weitergerechnet');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
