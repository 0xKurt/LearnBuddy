// Learning modes beyond practice from photos: homework help that never gives
// the solution, typed vocabulary in both directions, speaking practice judged
// from the recording, and figures. Explaining is the chat's answer, never a
// mode (issue #70). docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  BuddyHome,
  AnswerResponse,
  MaterialView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Frage',
  answer: 'Antwort',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Thema',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const tutor = (reply: string, over: Record<string, unknown> = {}) => ({
  json: {
    intent: 'answer',
    verdict: 'incorrect',
    reply,
    gave_hint: true,
    revealed_answer: false,
    ...over,
  },
});

async function answer(l: Learner, session: SessionView, itemId: string, text: string) {
  return l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });
}

describe.skipIf(!dbReady)('learning modes', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  it('helps with photographed homework without ever giving the solution', async () => {
    env.llm.script('extraction', async (req) => {
      // The homework prompt, not the "write practice questions" one.
      expect(req.system).toContain('help to solve it THEMSELVES');
      // While it is being read the home says Buddy is working — also for homework, which
      // wakes no background look — so the app keeps following it (found by the tour).
      expect((await l.api.get<BuddyHome>('/buddy')).body.working).toBe('material');
      return {
        is_learning_material: true,
        readable: true,
        title: 'Hausaufgabe Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        extracted_text: '1. Berechne 3/4 + 1/8.',
        items: [
          item({
            kind: 'short',
            prompt: 'Berechne $\\frac{3}{4} + \\frac{1}{8}$.',
            answer: '7/8',
            topic: 'Brüche addieren',
          }),
        ],
      };
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'homework' },
    );
    expect(created.status).toBe(201);
    env.storage.put(created.body.uploads[0]!.path);
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();
    expect((await l.api.get<BuddyHome>('/buddy')).body.working).toBeNull();

    const material = (await l.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
    expect(material).toMatchObject({ status: 'ready', purpose: 'homework' });
    expect(material.session_id).not.toBeNull();
    // Recorded as an event, but it wakes no background look (ADR 0005 stage 4).
    expect(
      await env.db.query(`select type from buddy_events where learner_id = $1`, [l.learnerId]),
    ).toEqual([{ type: 'homework_ready' }]);
    // No "Buddy prepares practice" for homework.
    expect(
      await env.db.query(
        `select 1 from jobs where kind = 'buddy_check' and payload->>'reason' = 'material_ready'`,
      ),
    ).toEqual([]);

    let session = (await l.api.get<SessionView>(`/practice/sessions/${material.session_id}`)).body;
    expect(session).toMatchObject({
      mode: 'help',
      reveal_allowed: false,
      title: 'Hausaufgabe Brüche',
    });
    const task = session.items[0]!.item;
    expect(task.origin).toBe('homework');

    // The tutor gives the solution away twice: repaired once, then replaced by a safe hint.
    env.llm.script(
      'tutor',
      tutor('Das Ergebnis ist 7/8.', { revealed_answer: false }),
      tutor('Also: 7/8!', { revealed_answer: true }),
    );
    const first = await answer(l, session, task.id, 'keine ahnung');
    expect(first.status).toBe(200);
    expect(first.body.reply.text).not.toContain('7/8');
    expect(first.body.reply.text).toContain('Schritt für Schritt');
    // The repair round told the model why.
    expect(ScriptedGateway.textOf(env.llm.callsFor('tutor')[1]!)).toContain(
      'gives the solution away',
    );

    // "Show solution" does not exist for homework.
    const reveal = await l.api.post(`/practice/sessions/${session.id}/reveal`, {
      item_id: task.id,
    });
    expect(reveal.status).toBe(409);
    expect(reveal.body).toMatchObject({ error: { details: { reason: 'reveal_not_allowed' } } });

    // Solved by the learner: confirmed, and the solution still isn't sent.
    const solved = await answer(l, session, task.id, '7/8');
    expect(solved.body.verdict).toBe('correct');
    expect(solved.body.reply.text).toContain('selbst gelöst');
    session = solved.body.session;
    expect(session.items[0]).toMatchObject({ status: 'correct', answer: null });
  });

  it('refuses the removed explain kind: explaining is the chat, never a mode (issue #70)', async () => {
    const res = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'explain',
      text: 'Erklär mir den Dativ',
    });
    expect(res.status).toBe(422);
    // Rejected by the contract, before any model call.
    expect(env.llm.callsFor('explain')).toHaveLength(0);
  });

  it('runs a practice test: one try, no hints, no answers until the end', async () => {
    env.llm.script('explain', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('PRACTICE TEST');
      return {
        usable: true,
        title: 'Brüche – Probetest',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          item({
            kind: 'numeric',
            prompt: 'Wie viel ist $\\frac{1}{2} + \\frac{1}{4}$?',
            answer: '0.75',
            topic: 'Addieren',
          }),
          item({
            prompt: 'Wie heißt die Zahl unter dem Bruchstrich?',
            answer: 'Nenner',
            topic: 'Begriffe',
          }),
          item({ prompt: 'Kürze 4/8', answer: '1/2', topic: 'Kürzen' }),
          item({ prompt: 'Kürze 6/8', answer: '$\\frac{3}{4}$', topic: 'Kürzen' }),
          item({ kind: 'speak', prompt: 'nicht im Test', answer: 'x', lang: 'de' }),
        ],
      };
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'test',
        text: 'Brüche',
      })
    ).body;
    expect(s.mode).toBe('test');
    expect(s.reveal_allowed).toBe(false);
    expect(s.items.map((i) => i.item.kind)).toEqual(['numeric', 'short', 'short', 'short']);
    const [a, b, c, d] = s.items.map((i) => i.item.id) as [string, string, string, string];

    // Wrong by the rules: closed at once, a neutral reply, the answer stays hidden —
    // and no model call: the rules already have the judgement (fast, free).
    const tutorCalls = env.llm.callsFor('tutor').length;
    const wrong = await answer(l, s, a, '0,5');
    expect(env.llm.callsFor('tutor')).toHaveLength(tutorCalls);
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    const closed = wrong.body.session.items.find((i) => i.item.id === a)!;
    expect(closed).toMatchObject({ status: 'missed', answer: null, hints_used: 0 });

    // Asking for help gets no hint — whatever the model wrote — and the question stays open.
    env.llm.script('tutor', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('MODE: TEST');
      return tutor('Tipp: Es ist der untere Teil, fängt mit N an.', {
        intent: 'help_request',
        verdict: 'not_an_attempt',
      }).json;
    });
    const help = await answer(l, s, b, 'Hilfe?');
    expect(help.body.reply.text).toContain('keine Tipps');
    expect(help.body.reply.text).not.toContain('N an');
    expect(help.body.session.items.find((i) => i.item.id === b)).toMatchObject({
      status: 'open',
      hints_used: 0,
    });
    // A model that "reveals" in a test is overruled too.
    env.llm.script(
      'tutor',
      tutor('Richtig wäre Nenner.', { verdict: 'incorrect', revealed_answer: true }),
    );
    const miss = await answer(l, s, b, 'Zähler');
    expect(miss.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(miss.body.session.items.find((i) => i.item.id === b)?.status).toBe('missed');

    // Skipping is possible, but shows nothing while the test runs.
    const skipped = await l.api.post<SessionView>(`/practice/sessions/${s.id}/reveal`, {
      item_id: c,
    });
    expect(skipped.body.items.find((i) => i.item.id === c)).toMatchObject({
      status: 'skipped',
      answer: null,
    });

    // At the end: every answer and what to look at again.
    // Buddy looks at the result afterwards (and plans nothing here).
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    // A plain number with another value is wrong for sure, even as a short answer: no model call.
    // As the last open question, it closes the test on the server (audit H-12).
    const before = env.llm.callsFor('tutor').length;
    const fraction = await answer(l, s, d, '3/8');
    expect(fraction.body.verdict).toBe('incorrect');
    expect(fraction.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(env.llm.callsFor('tutor')).toHaveLength(before);
    expect(fraction.body.session.status).toBe('finished');

    const done = await l.api.post<SessionView>(`/practice/sessions/${s.id}/finish`, {});
    await env.flushBackground();
    expect(done.body.reveal_allowed).toBe(true);
    expect(done.body.items.map((i) => i.answer)).toEqual([
      '0.75',
      'Nenner',
      '1/2',
      '$\\frac{3}{4}$',
    ]);
    expect(done.body.summary?.shaky_topics.sort()).toEqual(['Addieren', 'Begriffe', 'Kürzen']);
    // A test is not practice: no spaced-repetition state was written.
    const fsrs = await env.db.query(`select 1 from item_states where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(fsrs).toHaveLength(0);
  });

  it('grades numbers and math by the key in a test: a right answer is never missed, a wrong one never praised', async () => {
    // docs/architecture.md §Practice (grading); audit C-1–C-6, H-1.
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Zahlen – Probetest',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          item({
            kind: 'numeric',
            prompt: '1/8 als Dezimalzahl?',
            answer: '0.125',
            topic: 'Dezimalzahlen',
          }),
          item({ kind: 'numeric', prompt: '4 h in Minuten?', answer: '240', topic: 'Umrechnen' }),
          item({
            kind: 'numeric',
            prompt: '1/4 in Prozent?',
            answer: '25',
            unit: '%',
            topic: 'Prozent',
          }),
          item({ prompt: 'Kürze 6/8', answer: '$\\frac{3}{4}$', topic: 'Kürzen' }),
          item({
            kind: 'numeric',
            prompt: '7/2 als gemischte Zahl?',
            answer: '3.5',
            topic: 'Gemischte Zahlen',
          }),
          item({
            kind: 'numeric',
            prompt: 'Berechne 17 · 23',
            answer: '391',
            topic: 'Multiplizieren',
          }),
        ],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'test',
        text: 'Zahlen',
      })
    ).body;
    const [dec, minutes, percent, reduce, mixed, product] = s.items.map((i) => i.item.id) as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    // Decided by the rules, no model: 0,125 is 0.125 (C-1), 242 is not 240 (C-2), 25 % is 25 %
    // (C-4), 3,4 is not 3/4 (C-6).
    expect((await answer(l, s, dec, '0,125')).body.verdict).toBe('correct');
    expect((await answer(l, s, minutes, '242')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, percent, '25 %')).body.verdict).toBe('correct');
    expect((await answer(l, s, reduce, '3,4')).body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);

    // The same value in another form (C-3, D-3) and the task typed again (H-1): the tutor judges.
    // What it is TOLD differs, and that is issue #227: for the mixed number the rules know the
    // value is right and say so, instead of "not decidable" — which the tutor was allowed to
    // answer with "wrong". For the typed-back task they really cannot decide.
    env.llm.script('tutor', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('RULE CHECK: the VALUE is right');
      expect(ScriptedGateway.textOf(req)).not.toContain('not decidable by rules');
      return tutor('ok', { verdict: 'correct', gave_hint: false }).json;
    });
    expect((await answer(l, s, mixed, '3 1/2')).body.verdict).toBe('correct');
    env.llm.script('tutor', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('RULE CHECK: not decidable by rules');
      return tutor('ok', { verdict: 'incorrect', gave_hint: false }).json;
    });
    expect((await answer(l, s, product, '17·23')).body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(2);

    const stored = await env.db.query<{
      item_id: string;
      status: string;
      first_try_correct: boolean;
    }>(`select item_id, status, first_try_correct from session_items where session_id = $1`, [
      s.id,
    ]);
    const statusOf = (id: string) => stored.find((r) => r.item_id === id);
    expect(statusOf(dec)).toMatchObject({ status: 'correct', first_try_correct: true });
    expect(statusOf(minutes)).toMatchObject({ status: 'missed', first_try_correct: false });
    expect(statusOf(percent)).toMatchObject({ status: 'correct', first_try_correct: true });
    expect(statusOf(reduce)).toMatchObject({ status: 'missed', first_try_correct: false });
    expect(statusOf(mixed)).toMatchObject({ status: 'correct', first_try_correct: true });
    expect(statusOf(product)).toMatchObject({ status: 'missed', first_try_correct: false });
    const byRule = await env.db.query<{ text: string; verdict: string; evaluated_by: string }>(
      `select text, verdict, evaluated_by from practice_turns
        where session_id = $1 and role = 'learner' order by seq`,
      [s.id],
    );
    expect(byRule.map((r) => [r.text, r.verdict, r.evaluated_by])).toEqual([
      ['0,125', 'correct', 'rule'],
      ['242', 'incorrect', 'rule'],
      ['25 %', 'correct', 'rule'],
      ['3,4', 'incorrect', 'rule'],
      ['3 1/2', 'correct', 'model'],
      ['17·23', 'incorrect', 'model'],
    ]);

    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const done = await l.api.post<SessionView>(`/practice/sessions/${s.id}/finish`, {});
    await env.flushBackground();
    // One question each: right today, and not a claim about the topic (issue #155).
    expect(done.body.summary?.secure_topics.sort()).toEqual([]);
    expect(done.body.summary?.shaky_topics.sort()).toEqual([
      'Kürzen',
      'Multiplizieren',
      'Umrechnen',
    ]);
  });

  it('keeps case, ß and punctuation in German: a spelling difference is almost, never right', async () => {
    // docs/architecture.md §Practice (grading); audit C-7, decision D-2.
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Rechtschreibung',
        subject: { name: 'Deutsch', kind: 'german' },
        items: [
          item({ prompt: 'Setze ein: Stra_e', answer: 'Straße', topic: 's-Laute' }),
          item({
            prompt: 'Setze das Komma: Ich glaube dass er kommt.',
            answer: 'Ich glaube, dass er kommt.',
            topic: 'Kommas',
          }),
        ],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: 'ß und Kommas',
      })
    ).body;
    const [street, comma] = s.items.map((i) => i.item.id) as [string, string];

    const ss = await answer(l, s, street, 'Strasse');
    expect(ss.body.verdict).toBe('partially_correct');
    expect(ss.body.reply.text).toContain('Groß- und Kleinschreibung, ß und Satzzeichen');
    expect(ss.body.session.items.find((i) => i.item.id === street)?.status).toBe('open');
    const noComma = await answer(l, s, comma, 'Ich glaube dass er kommt.');
    expect(noComma.body.verdict).toBe('partially_correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);

    const right = await answer(l, s, street, 'Straße');
    expect(right.body.verdict).toBe('correct');
    const state = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [street],
    );
    expect(state.last_outcome).toBe('with_help');
  });

  it('shows no "done" result for a session left without answering anything', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Brüche',
        subject: null,
        items: [item({ prompt: 'Kürze 2/4', answer: '1/2' })],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: 'Brüche',
      })
    ).body;
    expect((await l.api.post(`/practice/sessions/${s.id}/finish`)).status).toBe(200);
    const home = (await l.api.get<{ now: { type: string } | null }>('/buddy')).body;
    expect(home.now?.type).not.toBe('practice_result');
  });

  it('says honestly when a request is nothing to learn from', async () => {
    env.llm.script('explain', {
      json: { usable: false, title: '—', subject: null, items: [] },
    });
    const res = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Wie hacke ich das WLAN der Schule?',
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { details: { reason: 'not_usable' } } });
  });

  it('asks typed vocabulary in both directions and checks near misses without a model', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Unité 3',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          item({
            kind: 'vocab',
            prompt: "l'élève",
            answer: 'der Schüler',
            prompt_lang: 'fr',
            lang: 'de',
            topic: 'Unité 3',
          }),
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: "l'élève – der Schüler",
    });
    expect(res.status).toBe(201);
    const kinds = res.body.items.map((i) => [i.item.prompt, i.item.prompt_lang, i.item.lang]);
    expect(kinds).toEqual([
      ["l'élève", 'fr', 'de'],
      ['der Schüler', 'de', 'fr'],
    ]);
    const [forth, back] = res.body.items.map((i) => i.item.id) as [string, string];
    const tutorCalls = () => env.llm.callsFor('tutor').length;
    const before = tutorCalls();

    // German → French without accents: almost right, at once, never fully right.
    const accents = await answer(l, res.body, back, "l'eleve");
    expect(accents.body.verdict).toBe('partially_correct');
    expect(accents.body.reply.text).toContain('Akzente');

    // A slip: she hears WHAT slipped, not the word, and the question stays open — the
    // spelling only from the second try on (issue #207: showing it at once turned the next
    // answer into copying, and the "Richtig" after it claimed she had known it).
    const slip = await answer(l, res.body, forth, 'der Schühler');
    expect(slip.body.verdict).toBe('partially_correct');
    expect(slip.body.reply.text).toBe('Fast – ein Buchstabe ist zu viel. Schau nochmal genau hin.');
    expect(slip.body.reply.text).not.toContain('Schüler');
    expect(slip.body.session.items.find((i) => i.item.id === forth)?.status).toBe('open');

    // Second slip on the same question: now the spelling, and it is recorded as help given.
    // ("der Schuler" would be the ACCENT near miss, which has its own reply and no solution.)
    const again = await answer(l, res.body, forth, 'der Schülerr');
    expect(again.body.reply.text).toContain('der Schüler');
    expect(again.body.session.items.find((i) => i.item.id === forth)?.hints_used).toBe(1);
    expect(tutorCalls()).toBe(before); // none of this needed a model

    // An answer the rules don't know goes to the tutor; judged right, the key learns it.
    env.llm.script('tutor', tutor('Richtig!', { verdict: 'correct' }));
    const synonym = await answer(l, res.body, forth, 'der Lernende');
    expect(synonym.body.verdict).toBe('correct');
    const key = await env.db.one<{ accepted_answers: string[] }>(
      `select accepted_answers from items where id = $1`,
      [forth],
    );
    expect(key.accepted_answers).toContain('der Lernende');
  });

  it('offers her own words to tap when she is recognising, not when she must write (#147)', async () => {
    const pairs = [
      ['le vélo', 'das Fahrrad'],
      ['la gare', 'der Bahnhof'],
      ["l'école", 'die Schule'],
      ['le livre', 'das Buch'],
    ] as const;
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Unité 3',
        subject: { name: 'Französisch', kind: 'french' },
        items: pairs.map(([fr, de]) =>
          item({
            kind: 'vocab',
            prompt: fr,
            answer: de,
            prompt_lang: 'fr',
            lang: 'de',
            topic: 'Unité 3',
          }),
        ),
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: pairs.map(([fr, de]) => `${fr} – ${de}`).join(', '),
    });
    expect(res.status).toBe(201);

    const german = res.body.items.filter((i) => i.item.lang === 'de');
    const french = res.body.items.filter((i) => i.item.lang === 'fr');
    expect(german).not.toHaveLength(0);
    expect(french).not.toHaveLength(0);

    // Reading French and picking the German word is recognition: that is what tapping tests.
    for (const i of german) {
      expect(i.item.tap_choices).toHaveLength(4);
      // Only her own words from this very set, never an invented one.
      for (const c of i.item.tap_choices!) {
        expect(pairs.map(([, de]) => de)).toContain(c);
      }
    }
    // Writing the French word is production; four words would hand it over.
    for (const i of french) expect(i.item.tap_choices).toBeNull();

    // Tapping is a way in, not a different question: the word is graded like a typed one,
    // and the rules alone decide it.
    const recognise = german[0]!;
    const right = recognise.item.tap_choices!.find((c) =>
      pairs.some(([fr, de]) => fr === recognise.item.prompt && de === c),
    )!;
    const before = env.llm.callsFor('tutor').length;
    const tapped = await answer(l, res.body, recognise.item.id, right);
    expect(tapped.body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(before);
  });

  it('lets the tutor decide a vocabulary answer that is missing a word (#146)', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Unité 3',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          item({
            kind: 'vocab',
            prompt: 'le vélo',
            answer: 'das Fahrrad',
            prompt_lang: 'fr',
            lang: 'de',
            topic: 'Unité 3',
          }),
          item({
            kind: 'vocab',
            prompt: "aller à l'école",
            answer: 'zur Schule gehen',
            prompt_lang: 'fr',
            lang: 'de',
            topic: 'Unité 3',
          }),
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: "le vélo – das Fahrrad, aller à l'école – zur Schule gehen",
    });
    expect(res.status).toBe(201);
    const idOf = (prompt: string) => res.body.items.find((i) => i.item.prompt === prompt)!.item.id;

    // The rules see THAT the first word is gone, never WHICH — "Fahrrad" forgot the
    // article, "Schule gehen" lost the preposition that tells you where. Telling those
    // apart needs the language, not a list of articles per language (CLAUDE.md rule 3),
    // so the model judges and code holds it to its answer.
    env.llm.script('tutor', tutor('Richtig — mit Artikel: das Fahrrad.', { verdict: 'correct' }));
    const noArticle = await answer(l, res.body, idOf('le vélo'), 'Fahrrad');
    expect(noArticle.body.verdict).toBe('correct');
    expect(noArticle.body.reply.text).toContain('das Fahrrad');
    // The key keeps its article: the shortened form is not learned as an answer, or the
    // gender would quietly disappear from the question for good.
    const key = await env.db.one<{ answer: string; accepted_answers: string[] }>(
      `select answer, accepted_answers from items where id = $1`,
      [idOf('le vélo')],
    );
    expect(key.answer).toBe('das Fahrrad');
    expect(key.accepted_answers).not.toContain('Fahrrad');

    // A missing word that carries meaning stays a near miss, and the reply says which.
    env.llm.script('tutor', tutor('Fast — es fehlt „zur".', { verdict: 'partially_correct' }));
    const dropped = await answer(l, res.body, idOf("aller à l'école"), 'Schule gehen');
    expect(dropped.body.verdict).toBe('partially_correct');
    expect(dropped.body.reply.text).toContain('zur');
    expect(
      dropped.body.session.items.find((i) => i.item.id === idOf("aller à l'école"))?.status,
    ).toBe('open');
  });

  it('listens to a recording: word feedback, retry stays open, a replay is not judged twice', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Aussprache',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          item({
            kind: 'speak',
            prompt: "Je m'appelle Lena.",
            answer: "Je m'appelle Lena.",
            lang: 'fr',
            topic: 'Vorstellen',
          }),
        ],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'speak',
        text: "Je m'appelle Lena.",
      })
    ).body;
    const speakId = s.items[0]!.item.id;
    // Typing is not how a speak question is answered.
    expect((await answer(l, s, speakId, 'je mapel')).status).toBe(409);

    const audio = Buffer.alloc(300_000, 7).toString('base64'); // ~400 KB of base64, like 10 s of speech
    env.llm.script(
      'pronounce',
      (req) => {
        const parts = req.contents[0]!.parts;
        expect(parts.some((p) => 'inlineData' in p && p.inlineData.mimeType === 'audio/mp4')).toBe(
          true,
        );
        expect(ScriptedGateway.textOf(req)).toContain("TARGET (fr): Je m'appelle Lena.");
        return {
          audible: true,
          heard: 'Je mapelle Lena',
          overall: 'retry',
          words: [
            { text: 'Je', ok: true, tip: null },
            { text: "m'appelle", ok: false, tip: 'Das ‹ll› klingt wie ‹l›, Betonung am Ende.' },
            { text: 'Lena', ok: true, tip: 'unnötig' },
          ],
          reply: 'Fast! Achte auf „m’appelle“.',
        };
      },
      {
        json: {
          audible: true,
          heard: "Je m'appelle Lena",
          overall: 'good',
          words: [
            { text: 'Je', ok: true, tip: null },
            { text: "m'appelle", ok: true, tip: null },
            { text: 'Lena', ok: true, tip: null },
          ],
          reply: 'Klingt super!',
        },
      },
    );
    const turnId = randomUUID();
    const first = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/speak`, {
      client_turn_id: turnId,
      item_id: speakId,
      mime: 'audio/m4a',
      audio_base64: audio,
    });
    expect(first.status).toBe(200);
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.pronunciation).toEqual({
      heard: 'Je mapelle Lena',
      overall: 'retry',
      words: [
        { text: 'Je', ok: true, tip: null },
        { text: "m'appelle", ok: false, tip: 'Das ‹ll› klingt wie ‹l›, Betonung am Ende.' },
        { text: 'Lena', ok: true, tip: null },
      ],
    });
    expect(first.body.session.items[0]!.status).toBe('open');
    // The same recording sent again (lost answer) is not judged again.
    const replay = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/speak`, {
      client_turn_id: turnId,
      item_id: speakId,
      mime: 'audio/m4a',
      audio_base64: audio,
    });
    expect(replay.body.reply.id).toBe(first.body.reply.id);
    expect(env.llm.callsFor('pronounce')).toHaveLength(1);

    const second = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/speak`, {
      client_turn_id: randomUUID(),
      item_id: speakId,
      mime: 'audio/webm',
      audio_base64: audio,
    });
    expect(second.body.verdict).toBe('correct');
    expect(second.body.session.items[0]!.status).toBe('correct');
    // Recordings are never stored.
    const stored = await env.db.query<{ text: string }>(
      `select text from practice_turns where role = 'learner'`,
    );
    expect(stored.map((r) => r.text)).toEqual(['🎤 Je mapelle Lena', "🎤 Je m'appelle Lena"]);
  });

  it('refuses a pronunciation judgement that lands after "Beenden" (M-34)', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Aussprache',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          item({
            kind: 'speak',
            prompt: 'Bonjour.',
            answer: 'Bonjour.',
            lang: 'fr',
            topic: 'Grüßen',
          }),
        ],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'speak',
        text: 'Bonjour.',
      })
    ).body;
    const speakId = s.items[0]!.item.id;
    // She taps "Beenden" while the model is still listening.
    env.llm.script('pronounce', async () => {
      const finished = await l.api.post(`/practice/sessions/${s.id}/finish`, {});
      expect(finished.status).toBe(200);
      return {
        audible: true,
        heard: 'Bonjour',
        overall: 'good',
        words: [{ text: 'Bonjour', ok: true, tip: null }],
        reply: 'Klingt super!',
      };
    });
    const late = await l.api.post(`/practice/sessions/${s.id}/speak`, {
      client_turn_id: randomUUID(),
      item_id: speakId,
      mime: 'audio/m4a',
      audio_base64: Buffer.alloc(2_000, 7).toString('base64'),
    });
    expect(late.status).toBe(409);
    const turns = await env.db.query('select 1 from practice_turns where session_id = $1', [s.id]);
    expect(turns).toEqual([]);
    const si = await env.db.one<{ attempts: number; status: string }>(
      'select attempts, status from session_items where session_id = $1',
      [s.id],
    );
    expect(si).toEqual({ attempts: 0, status: 'open' });
  });

  it('keeps figures the app can draw and drops broken ones without losing the question', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Funktionen',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          item({
            prompt: 'Wo schneidet der Graph die x-Achse?',
            answer: '2',
            figure: {
              type: 'function_plot',
              functions: [
                { expr: '0.5*x^2-2', label: 'f' },
                { expr: 'x+*', label: null },
              ],
              x_min: -4,
              x_max: 4,
              y_min: -3,
              y_max: 5,
              points: [],
            },
          }),
          item({
            prompt: 'Welcher Bruch ist dargestellt?',
            answer: '3/4',
            figure: { type: 'fraction', shape: 'circle', fractions: [{ parts: 4, filled: 5 }] },
          }),
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Funktionen und Brüche',
    });
    expect(res.status).toBe(201);
    const [plot, fraction] = res.body.items.map((i) => i.item);
    expect(plot!.figure).toMatchObject({
      type: 'function_plot',
      functions: [{ expr: '0.5*x^2-2', label: 'f' }],
    });
    expect(fraction!.figure).toBeNull();
    expect(fraction!.prompt).toBe('Welcher Bruch ist dargestellt?');
  });
  it('a practice test for a planned test stays within the sheets photographed for it (live finding 6)', async () => {
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date, topics)
       values ($1, 'exam', 'Mathearbeit Brüche', '2026-10-01', '{Brüche}') returning id`,
      [l.learnerId],
    );
    const sheet = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, created_at, goal_id,
                              title, extracted_text)
       values ($1, gen_random_uuid(), 'ready', 1, $2, $3, 'Arbeitsblatt Brüche',
               '1. Kürze 6/8. 2. Erweitere 3/4 mit 5.') returning id`,
      [l.learnerId, env.clock.now(), goal.id],
    );
    for (const [prompt, topic] of [
      ['Kürze 6/8.', 'Brüche kürzen'],
      ['Erweitere 3/4 mit 5.', 'Brüche erweitern'],
    ] as const) {
      await env.db.query(
        `insert into items (learner_id, material_id, kind, prompt, answer, topic, difficulty, origin)
         values ($1, $2, 'short', $3, '3/4', $4, 2, 'material')`,
        [l.learnerId, sheet.id, prompt, topic],
      );
    }
    // Buddy offers the test by its title (the model named no goal): it is that test's. She asked
    // for it in her words (#388: Buddy's own idea needs practice that goes well).
    const args = { kind: 'test', text: 'Mathearbeit Brüche', asked: 'einen Probetest' };
    env.llm.script('buddy_turn', {
      json: {
        reply: 'Hier ist dein Probetest.',
        options: null,
        actions: [{ tool: 'offer_learning', args }],
      },
    });
    // Scripted before the message: Buddy starts preparing the offer at once (issue #48).
    env.llm.script('explain', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('TOPICS: Brüche erweitern | Brüche kürzen');
      expect(text).toContain('Kürze 6/8');
      // The model may only pick one of the sheet's topics.
      expect(JSON.stringify(req.schema)).toContain('"enum":["Brüche erweitern","Brüche kürzen"]');
      return {
        usable: true,
        title: 'Probetest Brüche',
        subject: null,
        items: [
          item({ prompt: 'Kürze 9/12.', answer: '3/4', topic: 'Brüche kürzen' }),
          item({ prompt: 'Erweitere 2/5 mit 3.', answer: '6/15', topic: 'Brüche erweitern' }),
          // Not on the sheet: dropped.
          item({ prompt: 'Berechne 2/3 · 3/5.', answer: '2/5', topic: 'Brüche multiplizieren' }),
          item({ prompt: 'Berechne 3/4 : 2/3.', answer: '9/8', topic: 'Division' }),
        ],
      };
    });
    await l.api.post('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Mach mir einen Probetest für „Mathearbeit Brüche“.',
    });
    const offer = await env.db.one<{ id: string; result: { goal_id: string | null } }>(
      `select id, result from buddy_actions where learner_id = $1 and tool = 'offer_learning'`,
      [l.learnerId],
    );
    expect(offer.result.goal_id).toBe(goal.id);

    // Buddy prepares the offer while she reads his reply (issue #48); her tap sends the
    // offer's action id, so it opens what was prepared instead of asking the model again.
    await env.flushBackground();
    const prepared = await env.db.query(
      `select id, client_request_id from practice_sessions where learner_id = $1`,
      [l.learnerId],
    );
    console.info('PREPARED', JSON.stringify(prepared), 'offer', offer.id);
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: offer.id,
      kind: 'test',
      text: 'Mathearbeit Brüche',
      goal_id: offer.result.goal_id,
    });
    expect(res.status).toBe(201);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    expect(res.body.items.map((i) => i.item.topic)).toEqual(['Brüche kürzen', 'Brüche erweitern']);
    const session = await env.db.one<{ goal_id: string }>(
      `select goal_id from practice_sessions where id = $1`,
      [res.body.id],
    );
    expect(session.goal_id).toBe(goal.id);

    // Another learner's test is not hers to build from.
    const other = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2014-05-01',
      pin: '1357',
    });
    const foreign = await other.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Mathearbeit Brüche',
      goal_id: goal.id,
    });
    expect(foreign.status).toBe(404);
  });
});
