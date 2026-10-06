// Where a long text comes from (issue #258, step 2), through the real API on a real Postgres:
// Buddy offers it (`offer_learning` kind `essay`), about a topic she names or the writing task on
// her sheet, and the generator writes the one task. Code keeps it only when it holds:
//   - the key points are code's, from the text type the model picked — never the model's;
//   - an analysis needs its text; from her sheet, that text must stand on the sheet;
//   - the run is practice with one essay question, written by Buddy, no solution to show;
//   - failure paths: an analysis without a text, a text not on her sheet, another learner's sheet,
//     a model outage, the same tap twice, an offer decided on a context that changed meanwhile.
// docs/architecture.md §Practice („Lange Texte").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const STORY = [
  'Er geht los, wie immer.',
  'Jeden Morgen derselbe Weg.',
  'Niemand wartet an der Ecke.',
  '',
  'Die Straße ist grau und still.',
  'Er zählt die Schritte bis zur Schule.',
  'Dann ist er da, und keiner sieht ihn an.',
];

const TASK = 'Interpretiere die Kurzgeschichte „Der Schulweg“.';

/** Her German sheet: the story and its writing task, as the reading transcribed it. */
const SHEET = `# Der Schulweg\n\n${STORY.join('\n')}\n\nAufgabe: ${TASK}`;

const SET = (essay: unknown[]) => ({
  json: {
    usable: true,
    title: 'Der Schulweg',
    subject: { name: 'Deutsch', kind: 'german' },
    essay,
  },
});

const ANALYSIS = {
  prompt: TASK,
  type: 'analyse',
  topic: 'Kurzgeschichte',
  difficulty: 3,
  passage: { title: 'Der Schulweg', lines: STORY, lang: 'de' },
};

const DISCUSSION = {
  prompt: 'Erörtere: Sollte es an Schulen ein Handyverbot geben?',
  type: 'argue_dialectic',
  topic: 'Handyverbot',
  difficulty: 3,
  passage: null,
};

describe.skipIf(!dbReady)('long texts: where an essay task comes from (#258)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-03-10' });
  });
  afterEach(() => env.closeChecked());

  const start = (text: string, extra: Record<string, unknown> = {}, who: Learner = l) =>
    who.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'essay',
      text,
      ...extra,
    });

  const sheet = () =>
    env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, title, extracted_text, created_at)
       values ($1, gen_random_uuid(), 'ready', 1, 'Deutsch-Blatt', $2, $3) returning id`,
      [l.learnerId, SHEET, env.clock.now()],
    );

  it('a topic she names becomes one essay question whose key points code sets', async () => {
    env.llm.script('explain', SET([DISCUSSION]));
    const res = await start('Erörterung Handyverbot');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.mode).toBe('practice');
    expect(res.body.items).toHaveLength(1);
    const [q] = res.body.items;
    expect(q!.item).toMatchObject({ kind: 'essay', prompt: DISCUSSION.prompt, origin: 'buddy' });
    // No solution for a long text, and the key points are never shown as one.
    expect(q!.answer).toBeNull();
    const stored = await env.db.one<{
      rubric: { form: string; elements: Array<{ name: string }> };
      hints: string[];
    }>(`select rubric, hints from items where id = $1`, [q!.item.id]);
    // The dialectic type's four points, named by code in her language.
    expect(stored.rubric.form).toBe('Erörterung');
    expect(stored.rubric.elements.map((e) => e.name)).toEqual([
      'Einleitung',
      'Argumente mit Beispiel',
      'Gegenargument',
      'Schluss mit Position',
    ]);
    expect(stored.hints).toHaveLength(3);
    // The generator was asked for the essay list and nothing else.
    const call = env.llm.callsFor('explain')[0]!;
    expect(JSON.stringify(call)).toContain('LONG TEXT (\\"essay\\")');
    expect(Object.keys((call.schema as { properties: object }).properties)).toEqual(
      expect.arrayContaining(['essay']),
    );
    expect(Object.keys((call.schema as { properties: object }).properties)).not.toContain('items');
  });

  it('comes from Buddy’s offer on her sheet, with the text from that sheet', async () => {
    const m = await sheet();
    env.llm.script('buddy_turn', {
      json: {
        lookups: [],
        concern: false,
        also_asked: false,
        actions: [
          { tool: 'offer_learning', args: { kind: 'essay', text: 'Der Schulweg', sheet: 'sh1' } },
        ],
        reply: 'Gern – schreib deine Interpretation, ich sag dir, was schon trägt.',
        options: null,
        asks_permission: false,
      },
    });
    env.llm.script('explain', SET([ANALYSIS]));
    const said = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Ich will die Interpretation auf meinem Deutsch-Blatt üben',
    });
    expect(said.status).toBe(200);
    const offer = said.body.home.thread
      .flatMap((x) => x.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(offer?.summary).toMatchObject({ kind: 'essay', startable: true, material_id: m.id });
    await env.flushBackground();
    const tap = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: offer!.id,
      kind: 'essay',
      text: 'Der Schulweg',
      material_id: m.id,
    });
    expect(tap.status, JSON.stringify(tap.body)).toBe(201);
    expect(tap.body.items.map((i) => i.item.prompt)).toEqual([TASK]);
    // The text she writes about is shown with its lines.
    expect(tap.body.items[0]!.item.passage?.lines).toEqual(STORY);
    const sent = JSON.stringify(env.llm.callsFor('explain')[0]);
    expect(sent).toContain('SHEET TEXT (her photographed sheet; take the writing task');
    expect(env.llm.callsFor('explain')).toHaveLength(1);

    // And from there the essay path of step 1 judges her text against the analysis's points.
    env.llm.script('tutor', {
      json: {
        elements: [{ element: 'r1', met: true, quote: 'Meine These', verbs: [] }],
        places: [
          { quote: 'Meine These', better: 'Nenn den Titel.' },
          { quote: 'Der Weg', better: 'Zeig es am Text.' },
          { quote: 'steht für', better: 'Begründe das.' },
        ],
      },
    });
    const essay = await l.api.post<AnswerResponse>(`/practice/sessions/${tap.body.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: tap.body.items[0]!.item.id,
      text: 'Meine These: Der Weg steht für seine Einsamkeit.',
    });
    expect(essay.status).toBe(200);
    expect(essay.body.reply.essay?.form).toBe('Textanalyse');
    expect(essay.body.reply.essay?.places).toHaveLength(3);
  });

  it('an offer decided on a context that changed meanwhile is not applied; asked again, one stands', async () => {
    const offer = (reply: string) => ({
      lookups: [],
      concern: false,
      also_asked: false,
      actions: [{ tool: 'offer_learning', args: { kind: 'essay', text: 'Handyverbot' } }],
      reply,
      options: null,
      asks_permission: false,
    });
    const settings = await l.api.get<{ version: number }>('/buddy/settings');
    env.llm.script('explain', SET([DISCUSSION]));
    env.llm.script(
      'buddy_turn',
      async () => {
        // While the model thinks, she changes a setting on another screen (bumps the context).
        const r = await l.api.patch('/buddy/settings', {
          quiet_start: '19:30',
          version: settings.body.version,
        });
        expect(r.status).toBe(200);
        return offer('Gern – schreib deine Erörterung.');
      },
      // Asked again on the fresh state, Buddy makes the same offer once.
      () => offer('Gern – schreib deine Erörterung, ich sag dir, was schon trägt.'),
    );
    const said = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Ich will eine Erörterung zum Handyverbot üben',
    });
    expect(said.status).toBe(200);
    const decisions = await env.db.query<{ disposition: string }>(
      `select disposition from buddy_decisions where learner_id = $1`,
      [l.learnerId],
    );
    expect(decisions.map((d) => d.disposition).sort()).toEqual(['applied', 'stale']);
    const offers = said.body.home.thread
      .flatMap((x) => x.actions)
      .filter((a) => a.summary.tool === 'offer_learning');
    expect(offers).toHaveLength(1);
    expect(offers[0]!.summary).toMatchObject({ kind: 'essay', startable: true });
    // The applied offer is prepared once, in the background; the stale one never.
    await env.flushBackground();
    expect(env.llm.callsFor('explain')).toHaveLength(1);
  });

  it('a text that is not on her sheet is not her task', async () => {
    const m = await sheet();
    const invented = {
      ...ANALYSIS,
      prompt: 'Interpretiere das Gedicht „Herbst“.',
      passage: {
        title: 'Herbst',
        lines: [
          'Die Blätter fallen, fallen wie von weit,',
          'als welkten in den Himmeln ferne Gärten;',
          'sie fallen mit verneinender Gebärde.',
        ],
        lang: 'de',
      },
    };
    env.llm.script('explain', SET([invented]));
    const res = await start('Der Schulweg', { material_id: m.id });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { details: { reason: 'not_usable' } } });
    expect(JSON.stringify(env.llm.callsFor('explain')[0])).toContain('SHEET TEXT');
  });

  it('an analysis without its text is no task, and nothing is stored', async () => {
    env.llm.script('explain', SET([{ ...ANALYSIS, passage: null }]));
    const res = await start('Interpretation üben');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { details: { reason: 'not_usable' } } });
    const n = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(n.n).toBe(0);
  });

  it('the same tap twice is one run; another learner’s sheet is a 404; an outage stores nothing', async () => {
    env.llm.script('explain', SET([DISCUSSION]));
    const id = randomUUID();
    const one = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: id,
      kind: 'essay',
      text: 'Handyverbot',
    });
    const two = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: id,
      kind: 'essay',
      text: 'Handyverbot',
    });
    expect(two.body.id).toBe(one.body.id);
    expect(env.llm.callsFor('explain')).toHaveLength(1);

    const m = await sheet();
    const sam = await onboard(env, { name: 'Sam' });
    expect((await start('Der Schulweg', { material_id: m.id }, sam)).status).toBe(404);

    env.llm.script('explain', { error: new LlmError('unavailable', 'down') });
    const down = await start('Erörterung Schuluniform');
    expect(down.status).toBe(503);
    expect(env.llm.callsFor('explain')).toHaveLength(2);
  });
});
