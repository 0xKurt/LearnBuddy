// The cloze item end to end (issue #232): the model writes a text with "___" gaps and the
// keys; code checks it before anything is stored (Regel 0), cuts it into segments, names the
// gaps and keeps the keys in `items.task` — and judges her answer gap by gap with the rules
// every written answer meets. Only a gap no rule decides goes to the model, alone.
// docs/architecture.md §Practice ("Structured items").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  MaterialView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { CLOZE_JUDGE_PROMPT_VERSION } from '../modules/practice/cloze.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Five gaps she types: the Perfekt in a short story. */
const PERFEKT_TEXT =
  'Gestern ___ wir in den Zoo gegangen. Zuerst ___ wir die Affen angeschaut. Dann hat mein Bruder ein Eis ___. Am Abend ___ wir müde nach Hause gefahren. Es war ein ___ Tag.';
const PERFEKT = ['sind', 'haben', 'gegessen', 'sind', 'schöner'];
const PERFEKT_SOLUTION =
  'Gestern sind wir in den Zoo gegangen. Zuerst haben wir die Affen angeschaut. Dann hat mein Bruder ein Eis gegessen. Am Abend sind wir müde nach Hause gefahren. Es war ein schöner Tag.';

/** Three gaps from a word bank with one distractor. */
const FOTO_TEXT =
  'Pflanzen nehmen mit den Wurzeln ___ auf. In den Blättern entsteht mit Hilfe von Sonnenlicht ___. Dabei geben sie ___ an die Luft ab.';
const FOTO = ['Wasser', 'Traubenzucker', 'Sauerstoff'];
const FOTO_BANK = ['Wasser', 'Traubenzucker', 'Sauerstoff', 'Stickstoff'];

const cloze = (text: string, keys: string[], over: Record<string, unknown> = {}) => ({
  type: 'cloze',
  prompt: 'Setze die passenden Wörter ein.',
  text,
  gaps: keys.map((answer) => ({ answer, accepted_answers: [] })),
  word_bank: null,
  spelling: null,
  topic: 'Lückentext',
  difficulty: 2,
  prompt_lang: 'de',
  ...over,
});

const perfekt = (over: Record<string, unknown> = {}) =>
  cloze(PERFEKT_TEXT, PERFEKT, { topic: 'Perfekt', ...over });
const foto = (over: Record<string, unknown> = {}) =>
  cloze(FOTO_TEXT, FOTO, { word_bank: FOTO_BANK, topic: 'Fotosynthese', ...over });

describe.skipIf(!dbReady)('cloze items', () => {
  let env: TestEnv;
  let l: Learner;

  /** A topic's practice (or test) whose scripted model wrote these structured tasks. */
  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
    subject: { name: string; kind: string } = { name: 'Deutsch', kind: 'german' },
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Lückentext',
      subject,
      items: [],
      structured,
    }));
    if (kind === 'practice') {
      env.llm.script('hints', (req) => {
        // The hint writer sees the text with its gaps, not only the instruction.
        const text = ScriptedGateway.textOf(req);
        if (!text.includes('___')) throw new Error('hints: the text with its gaps is missing');
        return {
          items: structured.map((_, i) => ({
            n: i + 1,
            hints: ['Schau, wann das passiert ist.', `In die erste Lücke gehört ${PERFEKT[1]}.`],
            worked_solution: 'Im Perfekt steht ein Hilfsverb und das Partizip …',
          })),
        };
      });
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Lückentext üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  /** Her words into the gaps of the shown task, in reading order. */
  function fill(si: SessionItemView, words: string[]) {
    const view = si.item.task_view;
    expect(view?.type).toBe('cloze');
    const ids = view?.type === 'cloze' ? view.gaps : [];
    return { type: 'cloze' as const, gaps: words.map((text, i) => ({ id: ids[i] ?? 'zz', text })) };
  }

  async function answer(
    session: SessionView,
    si: SessionItemView,
    words: string[],
    opts: { turn?: string; as?: Learner; via?: 'typed' | 'tapped' } = {},
  ) {
    return (opts.as ?? l).api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: opts.turn ?? randomUUID(),
      item_id: si.item.id,
      parts: fill(si, words),
      ...(opts.via ? { via: opts.via } : {}),
    });
  }

  const answeredBy = async (sessionId: string) =>
    (
      await env.db.one<{ answered_by: string | null }>(
        `select answered_by from session_items where session_id = $1`,
        [sessionId],
      )
    ).answered_by;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  // A tutor call here would mean code sent a gap to the model that a rule decides.
  afterEach(() => env.closeChecked());

  it('stores the checked text, shows it without its keys, and judges it right by rules', async () => {
    const session = await prepare([perfekt()]);
    expect(session.items).toHaveLength(1);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('cloze');
    expect(si.item.prompt).toBe('Setze die passenden Wörter ein.');
    const view = si.item.task_view;
    expect(view).toEqual({
      type: 'cloze',
      segments: PERFEKT_TEXT.split('___'),
      gaps: ['g1', 'g2', 'g3', 'g4', 'g5'],
      bank: null,
    });
    expect(si.answer).toBeNull();

    const row = await env.db.one<{
      task: { gaps: Array<{ key: string }> };
      answer: string;
      hints: string[];
    }>(`select task, answer, hints from items where id = $1`, [si.item.id]);
    expect(row.task.gaps.map((g) => g.key)).toEqual(PERFEKT);
    expect(row.answer).toBe(PERFEKT_SOLUTION);
    // The prepared hint that named a key was dropped; the other one stays.
    expect(row.hints).toEqual(['Schau, wann das passiert ist.']);

    const res = await answer(session, si, PERFEKT);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
    expect(res.body.reply.text).toBe('Stimmt – gut gemacht!');
    const mine = res.body.session.turns.find((t) => t.role === 'learner');
    expect(mine?.text).toBe(PERFEKT.join(' · '));
    const verdict = await env.db.one<{ evaluated_by: string }>(
      `select evaluated_by from practice_turns where session_id = $1 and role = 'learner'`,
      [session.id],
    );
    expect(verdict.evaluated_by).toBe('rule');
    const closed = res.body.session.items[0];
    expect(closed?.status).toBe('correct');
    expect(closed?.item.task_view).toBeNull();
    expect(closed?.answer).toBe(PERFEKT_SOLUTION);

    // FSRS heard it: a first-try review. Typed, because there was no bank to tap from.
    const state = await env.db.one<{ last_outcome: string; reps: number }>(
      `select last_outcome, reps from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state).toEqual({ last_outcome: 'first_try', reps: 1 });
    expect(await answeredBy(session.id)).toBe('typed');
  });

  it('names the wrong gap by her word, without a model; a near miss is named as one', async () => {
    const session = await prepare([foto()], 'practice', { name: 'Biologie', kind: 'biology' });
    const si = session.items[0]!;
    const view = si.item.task_view;
    expect(view?.type === 'cloze' && [...(view.bank ?? [])].sort()).toEqual([...FOTO_BANK].sort());

    // The distractor in the first gap: wrong for sure, because the bank says so.
    const first = await answer(session, si, ['Stickstoff', 'Traubenzucker', 'Sauerstoff']);
    expect(first.status).toBe(200);
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe(
      '2 von 3 Lücken stimmen schon. Bei „Stickstoff“ passt es noch nicht.',
    );
    expect(first.body.session.items[0]?.status).toBe('open');
    expect(first.body.session.items[0]?.item.task_view?.type).toBe('cloze');

    const right = await answer(session, si, FOTO, { via: 'tapped' });
    expect(right.body.verdict).toBe('correct');
    expect(right.body.session.items[0]?.status).toBe('correct');
    expect(await answeredBy(session.id)).toBe('tapped');
  });

  it('a typo stays a near miss, open for her to fix', async () => {
    const session = await prepare([perfekt()]);
    const si = session.items[0]!;
    const res = await answer(session, si, ['sind', 'haben', 'gegesen', 'sind', 'schöner']);
    expect(res.body.verdict).toBe('partially_correct');
    expect(res.body.reply.text).toBe(
      '4 von 5 Lücken stimmen schon. Bei „gegesen“ fehlt nur noch eine Kleinigkeit in der Schreibweise.',
    );
    expect(res.body.session.items[0]?.status).toBe('open');
  });

  it('sends only the gap no rule decides to the model, and the reply stays code’s', async () => {
    const session = await prepare([perfekt()]);
    const si = session.items[0]!;
    env.llm.script('tutor', (req) => {
      expect(req.promptVersion).toBe(CLOZE_JUDGE_PROMPT_VERSION);
      const text = ScriptedGateway.textOf(req);
      // Only gap 1 is open ("waren" — no rule knows); the four right ones are not sent.
      if (!text.includes('[1] SOLUTION: sind') || !text.includes('HER WORDS: waren')) {
        throw new Error(`gap 1 missing: ${text}`);
      }
      if (text.includes('HER WORDS: haben')) throw new Error('a decided gap was sent');
      return { gaps: [{ n: 1, verdict: 'incorrect' }] };
    });
    const res = await answer(session, si, ['waren', 'haben', 'gegessen', 'sind', 'schöner']);
    expect(res.body.verdict).toBe('incorrect');
    expect(res.body.reply.text).toBe(
      '4 von 5 Lücken stimmen schon. Bei „waren“ passt es noch nicht.',
    );
    const turn = await env.db.one<{ evaluated_by: string }>(
      `select evaluated_by from practice_turns where session_id = $1 and role = 'learner'`,
      [session.id],
    );
    expect(turn.evaluated_by).toBe('model');

    // No model: the open gap stays open, no verdict is claimed and no try counted.
    env.llm.script('tutor', { error: new LlmError('unavailable', 'outage') });
    const down = await answer(session, si, ['waren', 'haben', 'gegessen', 'sind', 'schöner']);
    expect(down.status).toBe(200);
    expect(down.body.verdict).toBeNull();
    expect(down.body.reply.text).toBe(
      'Das kann ich gerade nicht prüfen. Du kannst dir die Lösung ansehen und selbst vergleichen.',
    );
    expect(down.body.session.items[0]?.attempts).toBe(1);
    expect(env.llm.callsFor('tutor')).toHaveLength(2);
  });

  it('asks no model for an open gap when another gap is wrong for sure', async () => {
    const session = await prepare([
      cloze('Ein Jahr hat ___ Monate, und ein ___ hat sieben Tage.', ['12', 'Woche']),
    ]);
    const si = session.items[0]!;
    // "11" is wrong for sure (another number); "Wochenende" is open — and stays unjudged.
    const res = await answer(session, si, ['11', 'Wochenende']);
    expect(res.body.verdict).toBe('incorrect');
    expect(res.body.reply.text).toBe('Bei „11“ passt es noch nicht.');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('shows the solution after the third miss', async () => {
    const session = await prepare([foto()], 'practice', { name: 'Biologie', kind: 'biology' });
    const si = session.items[0]!;
    const wrong = ['Sauerstoff', 'Traubenzucker', 'Wasser'];
    expect((await answer(session, si, wrong)).body.verdict).toBe('incorrect');
    expect((await answer(session, si, wrong)).body.verdict).toBe('incorrect');
    const third = await answer(session, si, wrong);
    expect(third.body.verdict).toBe('incorrect');
    expect(third.body.reply.text).toContain('Im Perfekt steht ein Hilfsverb');
    const closed = third.body.session.items[0];
    expect(closed?.status).toBe('revealed');
    expect(closed?.answer).toBe(
      'Pflanzen nehmen mit den Wurzeln Wasser auf. In den Blättern entsteht mit Hilfe von Sonnenlicht Traubenzucker. Dabei geben sie Sauerstoff an die Luft ab.',
    );
    const state = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state.last_outcome).toBe('revealed');
  });

  it('records one answer per client_turn_id', async () => {
    const session = await prepare([foto()], 'practice', { name: 'Biologie', kind: 'biology' });
    const si = session.items[0]!;
    const turn = randomUUID();
    const wrong = ['Stickstoff', 'Traubenzucker', 'Sauerstoff'];
    const a = await answer(session, si, wrong, { turn });
    const b = await answer(session, si, wrong, { turn });
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1 and role = 'learner'`,
      [session.id],
    );
    expect(turns.n).toBe(1);
    expect(b.body.session.items[0]?.attempts).toBe(1);
  });

  it('refuses text, a gap missing or twice, an unknown gap and another kind’s parts (422)', async () => {
    const session = await prepare([perfekt()]);
    const si = session.items[0]!;
    const post = (body: Record<string, unknown>) =>
      l.api.post(`/practice/sessions/${session.id}/answer`, {
        client_turn_id: randomUUID(),
        item_id: si.item.id,
        ...body,
      });
    const asText = await post({ text: PERFEKT.join(' ') });
    expect(asText.status).toBe(422);
    expect(JSON.stringify(asText.body)).toContain('use_parts');
    const full = fill(si, PERFEKT);
    const bad = [
      { type: 'cloze', gaps: full.gaps.slice(0, 4) },
      { type: 'cloze', gaps: [...full.gaps.slice(0, 4), { id: 'g1', text: 'sind' }] },
      { type: 'cloze', gaps: [...full.gaps.slice(0, 4), { id: 'g9', text: 'schöner' }] },
      { type: 'cloze', gaps: [...full.gaps.slice(0, 4), { id: 'g5', text: '   ' }] },
      { type: 'order', order: ['a', 'b', 'c'] },
    ];
    for (const parts of bad) {
      const res = await post({ parts });
      expect(res.status, JSON.stringify(parts)).toBe(422);
    }
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items[0]?.attempts).toBe(0);
  });

  it("never lets another learner see or answer the question; another's id is 404", async () => {
    const session = await prepare([perfekt()]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-05-01' });
    expect((await answer(session, si, PERFEKT, { as: other })).status).toBe(404);
    expect((await other.api.get(`/practice/sessions/${session.id}`)).status).toBe(404);
    const own = await prepare([foto()]);
    const foreign = await l.api.post(`/practice/sessions/${own.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      parts: fill(si, PERFEKT),
    });
    expect(foreign.status).toBe(404);
  });

  it('never sends a key while the question is open', async () => {
    const session = await prepare([perfekt()]);
    const si = session.items[0]!;
    const bodies = [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
    ];
    for (const path of ['/materials', '/buddy']) {
      const res = await l.api.get(path);
      expect(res.status, path).toBe(200);
      bodies.push(JSON.stringify(res.body));
    }
    const wrong = await answer(session, si, ['sind', 'haben', 'gegesen', 'sind', 'schöne']);
    bodies.push(JSON.stringify(wrong.body));
    for (const body of bodies) {
      expect(body).not.toContain('"key"');
      expect(body).not.toContain(PERFEKT_SOLUTION);
      // The keys she has not written herself.
      for (const key of ['gegessen', 'schöner']) expect(body).not.toContain(key);
    }
  });

  it('works in a practice test: one try, no verdict until the end, then the solution', async () => {
    const session = await prepare([perfekt(), foto()], 'test');
    expect(session.mode).toBe('test');
    const [first, second] = session.items;
    const wrong = await answer(session, first!, ['sind', 'haben', 'gegesen', 'sind', 'schöner']);
    expect(wrong.status).toBe(200);
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(wrong.body.session.items[0]?.status).toBe('missed');
    expect(wrong.body.session.items[0]?.answer).toBeNull();
    const right = await answer(session, second!, FOTO);
    expect(right.body.session.status).toBe('finished');
    expect(right.body.session.items.map((i) => i.status)).toEqual(['missed', 'correct']);
    expect(right.body.session.items[0]?.answer).toBe(PERFEKT_SOLUTION);
    const states = await env.db.one<{ n: number }>(
      `select count(*)::int as n from item_states where learner_id = $1`,
      [l.learnerId],
    );
    expect(states.n).toBe(0);
  });

  it('drops a text Regel 0 rejects and keeps the rest of the set', async () => {
    const session = await prepare([
      perfekt({ gaps: PERFEKT.slice(0, 4).map((answer) => ({ answer, accepted_answers: [] })) }),
      foto({ word_bank: ['Wasser', 'Traubenzucker', 'Stickstoff'] }),
      perfekt({ text: PERFEKT_TEXT.replace('Zuerst', 'Zuerst haben wir gesehen:') }),
      foto({ prompt: 'Fülle die Lücken.' }),
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual(['Fülle die Lücken.']);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1 and kind = 'cloze'`,
      [l.learnerId],
    );
    expect(stored.n).toBe(1);
  });

  it('reads a cloze from a photographed sheet, with its printed word box', async () => {
    env.llm.script('extraction', {
      json: {
        is_learning_material: true,
        readable: true,
        title: 'Fotosynthese',
        subject: { name: 'Biologie', kind: 'biology' },
        extracted_text: FOTO_TEXT,
        items: [],
        structured: [
          foto({ hints: ['Was braucht jede Pflanze?'], worked_solution: null }),
          foto({ word_bank: ['Wasser'] }),
        ],
      },
    });
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
    );
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const items = await env.db.query<{ kind: string; hints: string[] }>(
      `select kind, hints from items where material_id = $1`,
      [created.body.material.id],
    );
    expect(items).toEqual([{ kind: 'cloze', hints: ['Was braucht jede Pflanze?'] }]);
    const started = await l.api.post<SessionView>('/practice/sessions', {
      material_id: created.body.material.id,
    });
    expect(started.status).toBe(201);
    const si = started.body.items[0]!;
    expect(si.item.task_view?.type).toBe('cloze');
    const res = await answer(started.body, si, FOTO);
    expect(res.body.verdict).toBe('correct');
    expect(await answeredBy(started.body.id)).toBe('tapped');
  });
});
