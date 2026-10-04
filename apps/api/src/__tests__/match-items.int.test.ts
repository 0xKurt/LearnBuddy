// The match item end to end (issue #229): pairs to link and things to sort into groups. The
// model writes only the correct links; code checks them before anything is stored (Regel 0
// of #224 — rejected, never repaired), gives the ids, shuffles the display and keeps the key
// in `items.task`. Her answer is compared with that key link by link — never a model for the
// verdict, and the reply counts ("2 von 4 Paaren stimmen"). docs/architecture.md §Practice
// ("Structured items").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  MaterialView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MATCH_PAIR_JOIN } from '../modules/practice/match.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Four organs and their tasks (MATCH_PAIRS_MAX) — what the model writes: the correct pairs. */
const ORGANE: Record<string, string> = {
  Bundestag: 'beschließt die Gesetze',
  Bundesrat: 'vertritt die Länder',
  Bundeskanzler: 'bestimmt die Richtlinien',
  Bundespräsident: 'unterschreibt die Gesetze',
};

const WORTARTEN: Record<string, string[]> = {
  Nomen: ['Haus', 'Freude', 'Baum'],
  Verb: ['laufen', 'denkt'],
  Adjektiv: ['schnell', 'grün'],
};
const GROUP_OF: Record<string, string> = Object.fromEntries(
  Object.entries(WORTARTEN).flatMap(([g, es]) => es.map((e) => [e, g] as const)),
);

const pairsDraft = (pairs: Record<string, string>, over: Record<string, unknown> = {}) => ({
  type: 'match',
  prompt: 'Welches Verfassungsorgan hat welche Aufgabe?',
  pairs: Object.entries(pairs).map(([left, right]) => ({ left, right })),
  groups: null,
  topic: 'Verfassungsorgane',
  difficulty: 2,
  prompt_lang: 'de',
  ...over,
});

const groupsDraft = (groups: Record<string, string[]>, over: Record<string, unknown> = {}) => ({
  type: 'match',
  prompt: 'Sortiere die Wörter nach ihrer Wortart.',
  pairs: null,
  groups: Object.entries(groups).map(([name, elements]) => ({ name, elements })),
  topic: 'Wortarten',
  difficulty: 2,
  prompt_lang: 'de',
  ...over,
});

/** The view of a match item (`task_view` is the union of every structured kind). */
function viewOf(si: SessionItemView | undefined) {
  const view = si?.item.task_view;
  expect(view?.type).toBe('match');
  return view?.type === 'match' ? view : { left: [], right: [], form: null };
}

/** Her links, by text: left text → right text, turned into the shown ids. */
function linksFor(si: SessionItemView, links: Record<string, string>) {
  const view = viewOf(si);
  const leftId = new Map(view.left.map((e) => [e.text, e.id]));
  const rightId = new Map(view.right.map((e) => [e.text, e.id]));
  return Object.entries(links).map(([l, r]) => ({
    left: leftId.get(l) ?? 'zz',
    right: rightId.get(r) ?? 'zz',
  }));
}

describe.skipIf(!dbReady)('match items', () => {
  let env: TestEnv;
  let l: Learner;

  /** A topic's practice (or test) whose scripted model wrote these structured tasks. */
  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Zuordnen',
      subject: { name: 'Politik', kind: 'social_studies' },
      items: [],
      structured,
    }));
    if (kind === 'practice') {
      env.llm.script('hints', () => ({
        items: [
          {
            n: 1,
            hints: ['Wer sitzt im Parlament, wer vertritt die Länder?'],
            worked_solution: 'Das Parlament macht die Gesetze, die Länder sprechen mit …',
          },
        ],
      }));
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Zuordnen üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    links: Array<{ left: string; right: string }>,
    turn: string = randomUUID(),
    as: Learner = l,
  ) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      parts: { type: 'match', links },
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2013-02-10' });
  });
  afterEach(async () => {
    // A tutor call here would mean code could not decide a match it must decide.
    await env.closeChecked();
  });

  it('stores the checked pairs, shows them without the key, and judges them right', async () => {
    const session = await prepare([pairsDraft(ORGANE)]);
    expect(session.items).toHaveLength(1);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('match');
    const view = viewOf(si);
    expect(view.form).toBe('pairs');
    expect(view.left.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(view.right.map((e) => e.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(view.left.map((e) => e.text).sort()).toEqual(Object.keys(ORGANE).sort());
    expect(view.right.map((e) => e.text).sort()).toEqual(Object.values(ORGANE).sort());
    expect(si.answer).toBeNull();

    const row = await env.db.one<{
      task: { key: Array<{ left: string; right: string }> };
      answer: string;
    }>(`select task, answer from items where id = $1`, [si.item.id]);
    expect(row.task.key).toHaveLength(4);
    for (const [left, right] of Object.entries(ORGANE)) {
      expect(row.answer).toContain(`${left}${MATCH_PAIR_JOIN}${right}`);
    }

    const res = await answer(session, si.item.id, linksFor(si, ORGANE));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
    expect(res.body.reply.text).toBe('Stimmt – gut gemacht!');
    const mine = res.body.session.turns.find((t) => t.role === 'learner');
    expect(mine?.text).toBe(row.answer);
    const closed = res.body.session.items[0];
    expect(closed?.status).toBe('correct');
    expect(closed?.item.task_view).toBeNull();
    expect(closed?.answer).toBe(row.answer);

    const state = await env.db.one<{ last_outcome: string; reps: number }>(
      `select last_outcome, reps from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state).toEqual({ last_outcome: 'first_try', reps: 1 });
    expect(res.body.session.summary?.first_try).toBe(1);
    const how = await env.db.one<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(how.answered_by).toBe('tapped');
  });

  it('counts first, names the wrong one on the second miss, reveals on the third', async () => {
    const session = await prepare([groupsDraft(WORTARTEN)]);
    const si = session.items[0]!;
    const view = viewOf(si);
    expect(view.form).toBe('groups');
    // The groups in the model's order; the words shuffled, never sorted by group.
    expect(view.right.map((g) => g.text)).toEqual(['Nomen', 'Verb', 'Adjektiv']);
    const wrong = { ...GROUP_OF, schnell: 'Verb', Freude: 'Adjektiv' };

    const first = await answer(session, si.item.id, linksFor(si, wrong));
    expect(first.status).toBe(200);
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe('5 von 7 sind schon richtig einsortiert.');
    expect(first.body.session.items[0]?.status).toBe('open');
    expect(viewOf(first.body.session.items[0]).left).toHaveLength(7);
    expect(first.body.session.items[0]?.answer).toBeNull();

    // The second miss names the first wrong word as she sees them — a rung of the hint
    // ladder, so it counts as help.
    const firstWrong = view.left.find((e) => e.text === 'schnell' || e.text === 'Freude')!.text;
    const second = await answer(session, si.item.id, linksFor(si, wrong));
    expect(second.body.verdict).toBe('incorrect');
    expect(second.body.reply.text).toBe(
      `5 von 7 sind schon richtig einsortiert. Schau dir „${firstWrong}“ nochmal an.`,
    );
    const help = await env.db.one<{ hints_used: number; attempts: number }>(
      `select hints_used, attempts from session_items where session_id = $1`,
      [session.id],
    );
    expect(help).toEqual({ hints_used: 1, attempts: 2 });

    const third = await answer(session, si.item.id, linksFor(si, wrong));
    expect(third.body.verdict).toBe('incorrect');
    expect(third.body.reply.text).toContain('Das Parlament macht die Gesetze');
    const closed = third.body.session.items[0];
    expect(closed?.status).toBe('revealed');
    expect(closed?.answer).toContain('Nomen: ');
    expect(closed?.item.task_view).toBeNull();
    const state = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state.last_outcome).toBe('revealed');
  });

  it('records one answer per client_turn_id', async () => {
    const session = await prepare([pairsDraft(ORGANE)]);
    const si = session.items[0]!;
    const turn = randomUUID();
    const swapped = {
      ...ORGANE,
      Bundestag: ORGANE.Bundesrat!,
      Bundesrat: ORGANE.Bundestag!,
    };
    const a = await answer(session, si.item.id, linksFor(si, swapped), turn);
    const b = await answer(session, si.item.id, linksFor(si, swapped), turn);
    expect(a.body.reply.text).toBe('2 von 4 Paaren stimmen schon.');
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1 and role = 'learner'`,
      [session.id],
    );
    expect(turns.n).toBe(1);
    expect(b.body.session.items[0]?.attempts).toBe(1);
    const right = await answer(session, si.item.id, linksFor(si, ORGANE));
    expect(right.body.verdict).toBe('correct');
    expect((await answer(session, si.item.id, linksFor(si, ORGANE))).status).toBe(409);
  });

  it('refuses text and links that do not fit, without counting them', async () => {
    const session = await prepare([pairsDraft(ORGANE)]);
    const si = session.items[0]!;
    const asText = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      text: 'Bundestag beschließt die Gesetze',
    });
    expect(asText.status).toBe(422);
    expect(JSON.stringify(asText.body)).toContain('use_parts');
    const ok = linksFor(si, ORGANE);
    const bad = [
      ok.slice(0, 3),
      [...ok.slice(0, 3), ok[0]!],
      [...ok.slice(0, 3), { left: ok[3]!.left, right: 'r9' }],
      [...ok.slice(0, 3), { left: 'x', right: ok[3]!.right }],
      // Two organs to one task: a pairing that is not one.
      ok.map((k) => ({ ...k, right: ok[0]!.right })),
    ];
    for (const links of bad) {
      const res = await answer(session, si.item.id, links);
      expect(res.status, JSON.stringify(links)).toBe(422);
      expect(JSON.stringify(res.body)).toContain('parts_mismatch');
    }
    // An order's shape for a match.
    const shape = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      parts: { type: 'order', order: ['a', 'b', 'c', 'd', 'e'] },
    });
    expect(shape.status).toBe(422);
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items[0]?.attempts).toBe(0);
  });

  it("never lets another learner answer the question; another's id is 404", async () => {
    const session = await prepare([pairsDraft(ORGANE)]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-05-01' });
    const theirs = await answer(session, si.item.id, linksFor(si, ORGANE), undefined, other);
    expect(theirs.status).toBe(404);
    expect((await other.api.get(`/practice/sessions/${session.id}`)).status).toBe(404);
    const own = await prepare([groupsDraft(WORTARTEN)]);
    const foreign = await answer(own, si.item.id, linksFor(si, ORGANE));
    expect(foreign.status).toBe(404);
  });

  it('never sends the key while the question is open', async () => {
    const session = await prepare([pairsDraft(ORGANE), groupsDraft(WORTARTEN)]);
    expect(session.items).toHaveLength(2);
    const rows = await env.db.query<{ task: { key: unknown }; answer: string }>(
      `select task, answer from items where learner_id = $1 and kind = 'match'`,
      [l.learnerId],
    );
    const bodies = [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
    ];
    for (const path of ['/materials', '/buddy']) {
      const res = await l.api.get(path);
      expect(res.status, path).toBe(200);
      bodies.push(JSON.stringify(res.body));
    }
    const si = session.items[0]!;
    const rot = Object.fromEntries(
      Object.keys(ORGANE).map((k, i, ks) => [k, ORGANE[ks[(i + 1) % ks.length]!]!]),
    );
    const wrong = await answer(session, si.item.id, linksFor(si, rot));
    expect(wrong.body.reply.text).toBe(
      'Noch passt keins der Paare – schau sie dir nochmal in Ruhe an.',
    );
    bodies.push(JSON.stringify(wrong.body));
    for (const body of bodies) {
      expect(body).not.toContain('"key"');
      for (const r of rows) {
        expect(body).not.toContain(JSON.stringify(r.task.key));
        expect(body).not.toContain(r.answer);
      }
      // No pair stands together in what she is sent.
      for (const [left, right] of Object.entries(ORGANE)) {
        expect(body).not.toContain(`${left}${MATCH_PAIR_JOIN}${right}`);
      }
    }
  });

  it('stores nothing of a draft Regel 0 rejects, and keeps the rest of the set', async () => {
    const session = await prepare([
      // Two pairs: too few.
      pairsDraft({ A: '1', B: '2' }),
      // A left with two rights.
      {
        ...pairsDraft(ORGANE),
        pairs: [
          ...Object.entries(ORGANE).map(([left, right]) => ({ left, right })),
          { left: 'bundestag', right: 'wählt den Kanzler' },
        ],
      },
      // An empty group.
      groupsDraft({ ...WORTARTEN, Artikel: [] }),
      groupsDraft(WORTARTEN, { prompt: 'Welche Wortart ist das?' }),
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual(['Welche Wortart ist das?']);
    // A set holds at most four structured drafts, so the other rejections in a second one.
    const again = await prepare([
      // A word in two groups.
      groupsDraft({ Nomen: ['Haus', 'Lauf'], Verb: ['laufen', 'lauf'] }),
      // Neither form, and both.
      { ...pairsDraft(ORGANE), pairs: null },
      { ...pairsDraft(ORGANE), groups: [{ name: 'A', elements: ['x', 'y'] }] },
      pairsDraft(ORGANE, { prompt: 'Wer macht was?' }),
    ]);
    expect(again.items.map((i) => i.item.prompt)).toEqual(['Wer macht was?']);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(2);
  });

  it('works in a practice test: one try, no count until the end, then the solution', async () => {
    const session = await prepare([pairsDraft(ORGANE), groupsDraft(WORTARTEN)], 'test');
    expect(session.mode).toBe('test');
    const [first, second] = session.items;
    const swapped = { ...ORGANE, Bundestag: ORGANE.Bundesrat!, Bundesrat: ORGANE.Bundestag! };
    const wrong = await answer(session, first!.item.id, linksFor(first!, swapped));
    expect(wrong.status).toBe(200);
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(wrong.body.session.items[0]?.status).toBe('missed');
    expect(wrong.body.session.items[0]?.answer).toBeNull();
    const right = await answer(session, second!.item.id, linksFor(second!, GROUP_OF));
    expect(right.body.session.status).toBe('finished');
    const review = right.body.session.items;
    expect(review.map((i) => i.status)).toEqual(['missed', 'correct']);
    expect(review[0]?.answer).toContain(`Bundestag${MATCH_PAIR_JOIN}beschließt die Gesetze`);
    const states = await env.db.one<{ n: number }>(
      `select count(*)::int as n from item_states where learner_id = $1`,
      [l.learnerId],
    );
    expect(states.n).toBe(0);
  });

  it('reads a match task from a photographed sheet', async () => {
    env.llm.script('extraction', {
      json: {
        is_learning_material: true,
        readable: true,
        title: 'Wortarten',
        subject: { name: 'Deutsch', kind: 'german' },
        extracted_text: 'Sortiere die Wörter nach ihrer Wortart.',
        items: [],
        structured: [
          groupsDraft(WORTARTEN, {
            hints: ['Kannst du einen Artikel davor setzen?', 'Haus ist ein Nomen.'],
            worked_solution: null,
          }),
          // Rejected: a group with nothing in it.
          groupsDraft({ A: ['x', 'y', 'z', 'w'], B: [] }, { hints: [], worked_solution: null }),
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
    const items = await env.db.query<{ kind: string; prompt: string; hints: string[] }>(
      `select kind, prompt, hints from items where material_id = $1`,
      [created.body.material.id],
    );
    // The hint that gives a whole link away was dropped.
    expect(items).toEqual([
      {
        kind: 'match',
        prompt: 'Sortiere die Wörter nach ihrer Wortart.',
        hints: ['Kannst du einen Artikel davor setzen?'],
      },
    ]);
    const started = await l.api.post<SessionView>('/practice/sessions', {
      material_id: created.body.material.id,
    });
    expect(started.status).toBe(201);
    const si = started.body.items[0]!;
    expect(viewOf(si).left).toHaveLength(7);
    const res = await answer(started.body, si.item.id, linksFor(si, GROUP_OF));
    expect(res.body.verdict).toBe('correct');
  });
});
