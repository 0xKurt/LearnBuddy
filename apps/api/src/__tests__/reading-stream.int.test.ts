// Validated questions reach the existing start card before the reading ends (#870).
// requires live verification in Claude Code session (real Postgres, scripted streaming gateway)
import { randomUUID } from 'node:crypto';

import type {
  BuddyHome,
  MaterialItemsView,
  MaterialView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError, TRUNCATED } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { gate } from '../testing/sync.js';

const dbReady = await testDatabaseAvailable();
const question = (n: number) => ({
  kind: 'short',
  prompt: `Hauptstadt ${n}?`,
  answer: `Stadt ${n}`,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Europa',
  difficulty: 2,
  source_excerpt: null,
});
const header = {
  source: 'sheet',
  marked: [],
  other_subject: null,
  is_learning_material: true,
  readable: true,
  pages: [{ page: 1, read: 'all', problem: null }],
  title: 'Europa',
  subject: { name: 'Erdkunde', kind: 'geography' },
  extracted_text: 'Hauptstädte Europas',
};
const sheet = { ...header, items: [question(1), question(2)], more_items: false };
const prefix = (items: unknown[]) =>
  `${JSON.stringify({ ...header, items }).slice(0, -2)}, {"kind":"short","prompt":"still`;

describe.skipIf(!dbReady)('streamed sheet reading (#870)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv();
    lena = await onboard(env, { name: 'Lena' });
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction'] } });
    env.llm.byDefault('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
  });
  afterEach(() => env.closeChecked());

  async function upload() {
    const r = await lena.api.post<{ material: MaterialView; uploads: { path: string }[] }>(
      '/materials',
      {
        client_request_id: randomUUID(),
        photo_mimes: ['image/jpeg'],
        sending: true,
      },
    );
    expect(r.status).toBe(201);
    for (const u of r.body.uploads) env.storage.put(u.path);
    return r.body.material.id;
  }
  const home = async () => (await lena.api.get<BuddyHome>('/buddy')).body;
  const material = async (id: string) =>
    (await lena.api.get<MaterialView>(`/materials/${id}`)).body;

  it('shows only validated questions, grows the waiting card, and never waits for stream end', async () => {
    const first = gate();
    const second = gate();
    const invalid = { ...question(9), kind: 'vocab' }; // languages missing: fails semantic validation
    env.llm.script('extraction', async (req) => {
      req.onPartial?.(prefix([invalid, question(1)]));
      first.markCalled();
      await first.wait;
      req.onPartial?.(prefix([invalid, question(1), question(2)]));
      second.markCalled();
      await second.wait;
      return { ...sheet, items: [invalid, ...sheet.items] };
    });
    const id = await upload();
    await lena.api.post(`/materials/${id}/submit`);
    try {
      await first.called;
      await expect
        .poll(async () => (await home()).now, { timeout: 3000 })
        .toMatchObject({
          type: 'practice_ready',
          question_count: 1,
        });
      expect(await material(id)).toMatchObject({
        status: 'processing',
        items_incomplete: true,
        item_count: 1,
      });
      const tom = await onboard(env, { name: 'Tom' });
      expect((await tom.api.get<BuddyHome>('/buddy')).body.now).toBeNull();
      expect((await tom.api.get(`/materials/${id}/items`)).status).toBe(404);
      first.release();
      await second.called;
      await expect
        .poll(async () => (await home()).now)
        .toMatchObject({ type: 'practice_ready', question_count: 2 });
      const visible = (await lena.api.get<MaterialItemsView>(`/materials/${id}/items`)).body;
      expect(visible.items.map((i) => i.prompt)).toEqual(sheet.items.map((i) => i.prompt));
    } finally {
      first.release();
      second.release();
    }
    await env.flushBackground();
    expect(await material(id)).toMatchObject({
      status: 'ready',
      items_incomplete: true,
      item_count: 2,
    });
    expect((await home()).now).toMatchObject({ type: 'practice_ready', question_count: 2 });
  });

  it('keeps an interrupted sheet incomplete and retries without duplicating validated questions', async () => {
    const g = gate();
    env.llm.script('extraction', async (req) => {
      req.onPartial?.(prefix([question(1)]));
      g.markCalled();
      await g.wait;
      throw new LlmError('cancelled', 'connection closed mid-stream');
    });
    const id = await upload();
    await lena.api.post(`/materials/${id}/submit`);
    try {
      await g.called;
      await expect
        .poll(async () => (await home()).now, { timeout: 3000 })
        .toMatchObject({
          type: 'practice_ready',
          question_count: 1,
        });
    } finally {
      g.release();
    }
    await env.flushBackground();
    expect(await material(id)).toMatchObject({
      status: 'failed',
      items_incomplete: true,
      item_count: 1,
    });
    env.llm.script('extraction', { json: sheet });
    expect((await lena.api.post(`/materials/${id}/retry`)).status).toBe(202);
    await env.flushBackground();
    expect(await material(id)).toMatchObject({
      status: 'ready',
      items_incomplete: false,
      item_count: 2,
    });
    expect((await home()).now).toMatchObject({ type: 'practice_ready', question_count: 2 });
    expect(env.llm.choices).toHaveLength(1);
  });

  it.each(['finish', 'retry'] as const)(
    'keeps same-prompt questions with different figures through increments and %s',
    async (ending) => {
      const first = gate();
      const second = gate();
      const questions = ['circle', 'bar'].map((shape) => ({
        ...question(1),
        kind: 'numeric',
        prompt: 'Welcher Bruch ist gefärbt?',
        answer: '1/2',
        figure: { type: 'fraction', shape, fractions: [{ parts: 4, filled: 2 }] },
      }));
      const result = { ...sheet, items: questions };
      env.llm.script('extraction', async (req) => {
        req.onPartial?.(prefix(questions.slice(0, 1)));
        first.markCalled();
        await first.wait;
        req.onPartial?.(prefix(questions));
        second.markCalled();
        await second.wait;
        if (ending === 'retry') throw new LlmError('cancelled', 'connection closed');
        return result;
      });
      const id = await upload();
      await lena.api.post(`/materials/${id}/submit`);
      try {
        await first.called;
        await expect.poll(async () => (await material(id)).item_count).toBe(1);
        first.release();
        await second.called;
        await expect.poll(async () => (await material(id)).item_count).toBe(2);
        expect((await home()).now).toMatchObject({ type: 'practice_ready', question_count: 2 });
      } finally {
        first.release();
        second.release();
      }
      await env.flushBackground();
      const stored = await env.db.query<{ id: string; figure: unknown }>(
        `select id, figure from items where material_id = $1 order by id`,
        [id],
      );
      expect(stored.map((it) => it.figure)).toEqual(
        expect.arrayContaining(questions.map((it) => it.figure)),
      );
      if (ending === 'retry') {
        expect(await material(id)).toMatchObject({ status: 'failed', items_incomplete: true });
        // Position may change between reads; persisted JSONB also orders object keys differently.
        env.llm.script('extraction', {
          written: prefix([...questions].reverse()),
          json: { ...result, items: [...questions].reverse() },
        });
        expect((await lena.api.post(`/materials/${id}/retry`)).status).toBe(202);
        await env.flushBackground();
      }
      expect(await material(id)).toMatchObject({
        status: 'ready',
        items_incomplete: false,
        item_count: 2,
      });
      expect(
        await env.db.query(`select id, figure from items where material_id = $1 order by id`, [id]),
      ).toEqual(stored);
      expect((await home()).now).toMatchObject({ type: 'practice_ready', question_count: 2 });
    },
  );

  it('preserves identical questions at separate positions without adding them again on retry', async () => {
    const questions = [question(1), question(1)];
    env.llm.script('extraction', {
      written: prefix(questions),
      error: new LlmError('cancelled', 'connection closed'),
    });
    const id = await upload();
    await lena.api.post(`/materials/${id}/submit`);
    await env.flushBackground();
    expect(await material(id)).toMatchObject({ status: 'failed', item_count: 2 });
    env.llm.script('extraction', { json: { ...sheet, items: questions } });
    expect((await lena.api.post(`/materials/${id}/retry`)).status).toBe(202);
    await env.flushBackground();
    expect(await material(id)).toMatchObject({ status: 'ready', item_count: 2 });
  });

  it.each(['answer', 'choices'] as const)(
    'keeps a new %s with the same prompt on retry',
    async (changed) => {
      const questions =
        changed === 'answer'
          ? [question(1), { ...question(1), answer: 'Andere Stadt' }]
          : [2, 3].map((n) => ({
              ...question(1),
              kind: 'multiple_choice',
              choices: ['Stadt 1', `Stadt ${n}`],
              correct_choice: 0,
            }));
      env.llm.script('extraction', {
        written: prefix(questions.slice(0, 1)),
        error: new LlmError('cancelled', 'connection closed'),
      });
      const id = await upload();
      await lena.api.post(`/materials/${id}/submit`);
      await env.flushBackground();
      expect(await material(id)).toMatchObject({ status: 'failed', item_count: 1 });
      env.llm.script('extraction', {
        written: prefix(questions),
        json: { ...sheet, items: questions },
      });
      expect((await lena.api.post(`/materials/${id}/retry`)).status).toBe(202);
      await env.flushBackground();
      expect(await material(id)).toMatchObject({
        status: 'ready',
        items_incomplete: false,
        item_count: 2,
      });
    },
  );

  it('can start immediately and leaves that active run stable as the sheet grows', async () => {
    const g = gate();
    env.llm.script('extraction', async (req) => {
      req.onPartial?.(prefix([question(1)]));
      g.markCalled();
      await g.wait;
      return sheet;
    });
    const id = await upload();
    await lena.api.post(`/materials/${id}/submit`);
    let sessionId = '';
    try {
      await g.called;
      await expect
        .poll(async () => (await home()).now)
        .toMatchObject({ type: 'practice_ready', question_count: 1 });
      const card = (await home()).now;
      if (card?.type !== 'practice_ready') throw new Error('missing start card');
      const start = await lena.api.post<{ session: SessionView }>(
        `/buddy/steps/${card.step_id}/start`,
      );
      expect(start.status).toBe(200);
      expect(start.body.session.items).toHaveLength(1);
      sessionId = start.body.session.id;
    } finally {
      g.release();
    }
    await env.flushBackground();
    expect(await material(id)).toMatchObject({
      status: 'ready',
      item_count: 2,
      items_incomplete: false,
    });
    const active = await lena.api.get<SessionView>(`/practice/sessions/${sessionId}`);
    expect(active.body.items).toHaveLength(1);
    expect(active.body.items[0]?.item.prompt).toBe(question(1).prompt);
  });

  it.each(['deleted', 'lease lost'])('does not append after the sheet is %s', async (reason) => {
    const g = gate();
    env.llm.script('extraction', async (req) => {
      req.onPartial?.(prefix([question(1)]));
      g.markCalled();
      await g.wait;
      return sheet;
    });
    const id = await upload();
    await lena.api.post(`/materials/${id}/submit`);
    try {
      await g.called;
      await expect.poll(async () => (await material(id)).item_count).toBe(1);
      if (reason === 'deleted')
        expect((await lena.api.delete(`/materials/${id}`)).status).toBe(204);
      else
        await env.db.query(
          `update jobs set lease_token = $2 where kind = 'extract_material' and payload ->> 'material_id' = $1`,
          [id, randomUUID()],
        );
    } finally {
      g.release();
    }
    await env.flushBackground();
    const rows = await env.db.query<{ prompt: string }>(
      `select prompt from items where material_id = $1`,
      [id],
    );
    expect(rows.map((r) => r.prompt)).toEqual([question(1).prompt]);
    expect(
      await env.db.maybeOne(
        `select 1 from buddy_events where ref_id = $1 and type = 'material_ready'`,
        [id],
      ),
    ).toBeNull();
  });

  it.each(['timeout', 'invalid_output', 'truncated'] as const)(
    'drains validated writes before reporting %s and offers a retry',
    async (kind) => {
      env.llm.script('extraction', {
        written: prefix([question(1)]),
        error: new LlmError(
          kind === 'truncated' ? 'invalid_output' : kind,
          'stream interrupted',
          null,
          kind === 'truncated' ? TRUNCATED : null,
        ),
      });
      const id = await upload();
      await lena.api.post(`/materials/${id}/submit`);
      await env.flushBackground();
      expect(await material(id)).toMatchObject({
        status: 'failed',
        item_count: 1,
        items_incomplete: true,
      });
      expect((await home()).now).toMatchObject({ type: 'material_failed', retryable: true });
      expect(env.llm.callsFor('extraction')).toHaveLength(1);
    },
  );
});
