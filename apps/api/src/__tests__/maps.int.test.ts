// Karten end to end (issue #251): the model names a feature, code resolves it against the
// Natural Earth data before anything is stored, keeps the key in `items.task`, sends a view
// without it, and judges her tap, her typed name and her reading of the graticule — never a
// model. docs/architecture.md §Practice ("Maps").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  SessionView,
  StructuredAnswer,
  TapValue,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const META = { topic: 'Topographie', difficulty: 2, prompt_lang: 'de' } as const;

/** A map task as the model writes it: area, layer, what she does, the feature by NAME. */
const mapDraft = (
  prompt: string,
  map: {
    area?: string;
    layer?: string;
    ask?: string;
    feature: string;
    graticule?: boolean;
  },
) => ({
  type: 'figure_tap',
  prompt,
  plane: null,
  number_line: null,
  bars: null,
  clock: null,
  map: { area: 'germany', layer: 'areas', ask: 'tap', graticule: false, ...map },
  ...META,
});

const tapBayern = () => mapDraft('Tippe auf Bayern.', { feature: 'Bayern' });
const nameMarked = () =>
  mapDraft('Wie heißt das markierte Bundesland?', { ask: 'name', feature: 'Bayern' });
const readBerlin = () =>
  mapDraft('Welche Koordinaten hat die markierte Hauptstadt?', {
    layer: 'cities',
    ask: 'coords',
    feature: 'Berlin',
  });

const parts = (value: TapValue): StructuredAnswer => ({ type: 'figure_tap', value });

describe.skipIf(!dbReady)('maps', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(structured: unknown[]): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Deutschland',
      subject: { name: 'Erdkunde', kind: 'other' },
      items: [],
      structured,
    }));
    env.llm.script('hints', () => ({
      items: structured.map((_, i) => ({
        n: i + 1,
        hints: ['Schau, wo die Alpen sind.'],
        worked_solution: 'Man sucht zuerst den Süden der Karte …',
      })),
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Bundesländer üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    p: StructuredAnswer,
    as: Learner = l,
  ) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: itemId,
      parts: p,
    });
  }

  async function said(sessionId: string): Promise<string[]> {
    const rows = await env.db.query<{ text: string }>(
      `select text from practice_turns where session_id = $1 and role = 'learner' order by created_at`,
      [sessionId],
    );
    return rows.map((r) => r.text);
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // A tutor call here would mean code could not decide what it must decide.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('"Tippe auf Bayern": the key is the data\'s id, a wrong tap is named, the right one right', async () => {
    const session = await prepare([tapBayern()]);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('figure_tap');
    expect(si.item.task_view).toEqual({
      type: 'figure_tap',
      figure: {
        kind: 'map',
        area: 'germany',
        layer: 'areas',
        ask: 'tap',
        mark: null,
        graticule: false,
      },
    });
    const row = await env.db.one<{ task: { key: unknown }; answer: string }>(
      `select task, answer from items where id = $1`,
      [si.item.id],
    );
    expect(row.task.key).toEqual({ kind: 'map', id: 'DE-BY' });
    expect(row.answer).toBe('Bayern');

    const he = await answer(session, si.item.id, parts({ kind: 'map', id: 'DE-HE' }));
    expect(he.status, JSON.stringify(he.body)).toBe(200);
    expect(he.body.verdict).toBe('incorrect');
    expect(he.body.reply.text).toBe('Knapp daneben – das ist Hessen, ein Nachbar.');

    const ni = await answer(session, si.item.id, parts({ kind: 'map', id: 'DE-NI' }));
    // The second miss says which way: help, and counted as such.
    expect(ni.body.reply.text).toContain('weiter südlich');

    const right = await answer(session, si.item.id, parts({ kind: 'map', id: 'DE-BY' }));
    expect(right.body.verdict).toBe('correct');
    expect(await said(session.id)).toEqual(['Hessen', 'Niedersachsen', 'Bayern']);
    const closed = await env.db.one<{ answered_by: string; hints_used: number }>(
      `select answered_by, hints_used from session_items where session_id = $1`,
      [session.id],
    );
    expect(closed.answered_by).toBe('tapped');
    expect(closed.hints_used).toBe(1);
  });

  it('"Wie heißt das markierte Bundesland?": the outline is shown, never its id or name', async () => {
    const session = await prepare([nameMarked()]);
    const si = session.items[0]!;
    const body = JSON.stringify(session);
    expect(body).not.toContain('DE-BY');
    expect(body).not.toContain('Bayern');
    expect(body).not.toContain('"key"');
    expect(si.item.task_view).toMatchObject({
      figure: { kind: 'map', ask: 'name', mark: { form: 'path' } },
    });

    const other = await answer(session, si.item.id, parts({ kind: 'map_name', text: 'Hessen' }));
    expect(other.body.verdict).toBe('incorrect');
    expect(other.body.reply.text).toBe('Knapp daneben – Hessen liegt direkt daneben.');
    expect(JSON.stringify(other.body)).not.toContain('Bayern');

    const slip = await answer(session, si.item.id, parts({ kind: 'map_name', text: 'Baiern' }));
    expect(slip.body.verdict).toBe('correct');
    expect(slip.body.reply.text).toBe('Richtig! Geschrieben wird es: Bayern.');
    expect(await said(session.id)).toEqual(['Hessen', 'Baiern']);
    const closed = await env.db.one<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(closed.answered_by).toBe('typed');
  });

  it('reading Berlin off the graticule: a wrong hemisphere is named, within a degree is right', async () => {
    const session = await prepare([readBerlin()]);
    const si = session.items[0]!;
    expect(si.item.task_view).toMatchObject({
      figure: {
        kind: 'map',
        layer: 'cities',
        ask: 'coords',
        graticule: true,
        mark: { form: 'point' },
      },
    });
    const south = await answer(
      session,
      si.item.id,
      parts({ kind: 'map_coords', lat: -52, lon: 13 }),
    );
    expect(south.body.verdict).toBe('incorrect');
    expect(south.body.reply.text).toContain('Nord oder Süd');
    const right = await answer(
      session,
      si.item.id,
      parts({ kind: 'map_coords', lat: 53, lon: 13 }),
    );
    expect(right.body.verdict).toBe('correct');
    expect(await said(session.id)).toEqual(['52° S, 13° O', '53° N, 13° O']);
  });

  it('refuses what is no answer to the map — none counted', async () => {
    const session = await prepare([tapBayern(), readBerlin()]);
    const [tapItem, readItem] = session.items;
    for (const [id, p] of [
      [tapItem!.item.id, parts({ kind: 'map', id: 'ITA' })],
      [tapItem!.item.id, parts({ kind: 'map', id: 'c-munich' })],
      [tapItem!.item.id, parts({ kind: 'map_name', text: 'Bayern' })],
      [readItem!.item.id, parts({ kind: 'map_coords', lat: 52.5, lon: 13 })],
      [readItem!.item.id, parts({ kind: 'map', id: 'c-berlin' })],
    ] as const) {
      const res = await answer(session, id, p);
      expect(res.status, JSON.stringify(p)).toBe(422);
      expect(JSON.stringify(res.body)).toContain('parts_mismatch');
    }
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items.map((i) => i.attempts)).toEqual([0, 0]);
  });

  it('drops what the data does not back, and keeps the rest', async () => {
    const session = await prepare([
      mapDraft('Tippe auf Atlantis.', { feature: 'Atlantis' }),
      mapDraft('Tippe auf die Tropen.', { layer: 'zones', feature: 'Tropen' }),
      mapDraft('Ist das Bayern?', { ask: 'name', feature: 'Bayern' }),
      tapBayern(),
    ]);
    expect(session.items).toHaveLength(1);
    expect(session.items[0]!.item.prompt).toBe('Tippe auf Bayern.');
  });

  it("another learner's session or question is 404", async () => {
    const session = await prepare([tapBayern()]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-05-01' });
    const res = await answer(session, si.item.id, parts({ kind: 'map', id: 'DE-BY' }), other);
    expect(res.status).toBe(404);
  });
});
