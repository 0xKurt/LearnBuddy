// Lernkarten (issue #147, Stufe 2): a pass where the card turns over and SHE says whether she
// knew it — and the one thing that must not go wrong about it.
//
// The answer in a card pass is not checked by anything. So the whole risk of the feature is
// that the app starts treating her own report as if someone had verified it: the repetition
// plan would carry a certainty nobody measured, the result screen would call a topic settled,
// Buddy's picture of her would say a word sits. That is CLAUDE.md rule 5, and it is what the
// assertions below are for — far more than the happy path.
//
// What a self-assessment is worth to the SCHEDULE, in days, is held one layer down
// (`modules/practice/__tests__/cards.test.ts`), where the intervals can be compared without a
// database. This file holds what the HTTP surface and the real tables do.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Why the API refused, out of the error envelope ({"error": {code, message, details}}). */
const why = (body: unknown): string | undefined =>
  (body as { error?: { details?: { reason?: string } } }).error?.details?.reason;

/** Five French words, so a session has enough of her own words for everything (#147 Stufe 1). */
const PAIRS = [
  ['le vélo', 'das Fahrrad'],
  ['la gare', 'der Bahnhof'],
  ["l'école", 'die Schule'],
  ['le livre', 'das Buch'],
  ['le chien', 'der Hund'],
] as const;

const item = (over: Record<string, unknown>) => ({
  kind: 'vocab',
  prompt: 'Frage',
  answer: 'Antwort',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Unité 3',
  difficulty: 2,
  prompt_lang: 'fr',
  lang: 'de',
  figure: null,
  source_excerpt: null,
  ...over,
});

describe.skipIf(!dbReady)('flashcards', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  /**
   * A vocabulary run she has worked through: `sat` words answered right at once, the rest
   * answered with a slip and then shown. Nothing here calls a model — a near miss and a
   * reveal are both decided by rules — so the pass under test is the only thing being
   * measured.
   */
  /** A vocabulary run, started and left as it is (her answer in her own language). */
  async function startRun(
    pairs: readonly (readonly [string, string])[],
    topic = 'Unité 3',
  ): Promise<SessionView> {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: topic,
        subject: { name: 'Französisch', kind: 'french' },
        items: pairs.map(([fr, de]) => item({ prompt: fr, answer: de, topic })),
      },
    });
    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      // Reading French and saying what it means: her answer is in her own language.
      direction: 'recognise',
      text: pairs.map(([fr, de]) => `${fr} – ${de}`).join(', '),
    });
    expect(started.status).toBe(201);
    return started.body;
  }

  async function workedRun(pairs: readonly (readonly [string, string])[], sat: number) {
    let view = await startRun(pairs);
    expect(view.items).toHaveLength(pairs.length);
    for (const [n, row] of view.items.entries()) {
      const answer = view.items[n]!.item.prompt;
      const german = pairs.find(([fr]) => fr === answer)![1];
      if (n < sat) {
        const right = await l.api.post<AnswerResponse>(`/practice/sessions/${view.id}/answer`, {
          client_turn_id: randomUUID(),
          item_id: row.item.id,
          text: german,
        });
        expect(right.body.verdict).toBe('correct');
        view = right.body.session;
        continue;
      }
      // A slip: a near miss the rules answer themselves, so the question stays open and has
      // one attempt — which is what "Lösung zeigen" needs before it works (feedback #8).
      const slip = await l.api.post<AnswerResponse>(`/practice/sessions/${view.id}/answer`, {
        client_turn_id: randomUUID(),
        item_id: row.item.id,
        text: `${german}x`,
      });
      expect(slip.body.verdict).toBe('partially_correct');
      const shown = await l.api.post<SessionView>(`/practice/sessions/${view.id}/reveal`, {
        item_id: row.item.id,
      });
      expect(shown.status).toBe(200);
      view = shown.body;
    }
    // The last closing answer finished it on the server (audit H-12) — no /finish needed,
    // which would wake Buddy and call the model.
    expect(view.status).toBe('finished');
    return view;
  }

  it('offers the words that did not sit as cards, and only those (#147)', async () => {
    const run = await workedRun(PAIRS, 1);
    expect(run.card_pass_offered).toBe(true);
    const satPrompt = PAIRS[0]![0];

    const started = await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
      client_request_id: randomUUID(),
    });
    expect(started.status).toBe(201);
    const pass = started.body;
    expect(pass.card_pass).toBe(true);
    // The word she produced right at once is not on a card: it would cost that word the
    // interval it just earned, for a report nobody can check.
    expect(pass.items.map((i) => i.item.prompt)).toEqual(PAIRS.slice(1).map(([fr]) => fr));
    expect(pass.items.map((i) => i.item.prompt)).not.toContain(satPrompt);

    for (const row of pass.items) {
      // The back of the card, while the card is still open: showing it IS the pass.
      const german = PAIRS.find(([fr]) => fr === row.item.prompt)![1];
      expect(row.answer).toBe(german);
      expect(row.status).toBe('open');
      // And nothing that belongs to an answered question: no words to tap, no "Tipp",
      // no "Lösung zeigen" — there is nothing to grade and nothing to give away.
      expect(row.item.tap_choices).toBeNull();
      expect(row.hint_available).toBe(false);
      expect(row.reveal_available).toBe(false);
      expect(row.hints_left).toBe(0);
    }
    expect(pass.current_item_id).toBe(pass.items[0]!.item.id);
  });

  it('records "Wusste ich" as her own report, never as a checked answer (#147)', async () => {
    const run = await workedRun(PAIRS, 1);
    const pass = (
      await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
        client_request_id: randomUUID(),
      })
    ).body;
    const first = pass.items[0]!.item.id;

    const after = await l.api.post<SessionView>(`/practice/sessions/${pass.id}/card`, {
      client_turn_id: randomUUID(),
      item_id: first,
      recall: 'knew_it',
    });
    expect(after.status).toBe(200);

    const row = await env.db.one<{
      status: string;
      first_try_correct: boolean | null;
      answered_by: string | null;
    }>(
      `select status, first_try_correct, answered_by from session_items
        where session_id = $1 and item_id = $2`,
      [pass.id, first],
    );
    // `revealed`, because the card turned over and she saw the answer — which is all that was
    // observed. Never `correct`: nothing was right or wrong here.
    expect(row.status).toBe('revealed');
    // The one column every reader outside the practice module keys on for "this sits"
    // (Buddy's recall, the sheet's per-question marker, the selection of what to practise).
    // It stays false, so a word she SAYS she knew keeps coming back.
    expect(row.first_try_correct).toBe(false);
    expect(row.answered_by).toBe('self_rated');

    // The mark on the review itself, so a later reader can still see what the interval was
    // built on (the owner asked for exactly this).
    const state = await env.db.one<{ last_outcome: string; reps: number; due: Date }>(
      `select last_outcome, reps, due from item_states where item_id = $1`,
      [first],
    );
    expect(state.last_outcome).toBe('self_known');
    // The SECOND review of this word: the run before the pass already reviewed it as shown.
    // That is the order the offer is built on — every word on a card was measured as one
    // that did not sit first, so the pass adds a repetition instead of a verdict out of
    // nowhere (`cards.ts` offersCardPass).
    expect(state.reps).toBe(2);
    expect(state.due.getTime()).toBeGreaterThan(env.clock.now().getTime());

    // Her tap stands in the session's conversation, in her own words, judged by nobody.
    const turn = await env.db.one<{ text: string; verdict: string; evaluated_by: string | null }>(
      `select text, verdict, evaluated_by from practice_turns
        where session_id = $1 and item_id = $2`,
      [pass.id, first],
    );
    expect(turn.text).toBe('Wusste ich');
    expect(turn.verdict).toBe('not_an_attempt');
    expect(turn.evaluated_by).toBeNull();
  });

  it('marks "Noch nicht" like a solution she had shown to her (#147)', async () => {
    const run = await workedRun(PAIRS, 1);
    const pass = (
      await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
        client_request_id: randomUUID(),
      })
    ).body;
    const card = pass.items[0]!.item.id;
    await l.api.post<SessionView>(`/practice/sessions/${pass.id}/card`, {
      client_turn_id: randomUUID(),
      item_id: card,
      recall: 'not_yet',
    });
    const state = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [card],
    );
    expect(state.last_outcome).toBe('self_unknown');
  });

  it('records one tap once, however often it arrives (#147)', async () => {
    const run = await workedRun(PAIRS, 1);
    const pass = (
      await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
        client_request_id: randomUUID(),
      })
    ).body;
    const card = pass.items[0]!.item.id;
    const turnId = randomUUID();
    const body = { client_turn_id: turnId, item_id: card, recall: 'knew_it' as const };
    const first = await l.api.post<SessionView>(`/practice/sessions/${pass.id}/card`, body);
    // The same tap again — a retry after a lost reply must not review the word twice.
    const again = await l.api.post<SessionView>(`/practice/sessions/${pass.id}/card`, body);
    expect([first.status, again.status]).toEqual([200, 200]);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1 and item_id = $2`,
      [pass.id, card],
    );
    expect(turns.n).toBe(1);
    const state = await env.db.one<{ reps: number }>(
      `select reps from item_states where item_id = $1`,
      [card],
    );
    // The run before the pass reviewed it once; the repeated tap added exactly one more.
    expect(state.reps).toBe(2);
    // A DIFFERENT tap on a card that is already done is a conflict, not a second review.
    const twice = await l.api.post(`/practice/sessions/${pass.id}/card`, {
      client_turn_id: randomUUID(),
      item_id: card,
      recall: 'not_yet',
    });
    expect(twice.status).toBe(409);
  });

  it('never lets a pass she judged herself name a topic (#147)', async () => {
    const run = await workedRun(PAIRS, 1);
    const pass = (
      await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
        client_request_id: randomUUID(),
      })
    ).body;
    let view = pass;
    for (const [n, row] of pass.items.entries()) {
      view = (
        await l.api.post<SessionView>(`/practice/sessions/${pass.id}/card`, {
          client_turn_id: randomUUID(),
          item_id: row.item.id,
          // Three of four "knew it" — if a self-assessment counted, "Unité 3" would come
          // out of this looking like a topic that went well.
          recall: n === 0 ? 'not_yet' : ('knew_it' as const),
        })
      ).body;
    }
    // The last card closes the pass right there.
    expect(view.status).toBe('finished');
    expect(view.summary).not.toBeNull();
    // Her work is counted — she did go through them, and leaving that out would understate
    // it (issue #197's other half).
    expect(view.summary!.answered).toBe(pass.items.length);
    // But not one word about the topic, in either direction: three "wusste ich" is not
    // evidence that "Unité 3" sits, and one "noch nicht" after a run that already said so
    // is not news either. Both lists stay empty.
    expect(view.summary!.secure_topics).toEqual([]);
    expect(view.summary!.shaky_topics).toEqual([]);
    // And cards never lead to cards: it would re-card what she just said she knew.
    expect(view.card_pass_offered).toBe(false);
    expect(
      (
        await l.api.post(`/practice/sessions/${pass.id}/cards`, {
          client_request_id: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });

  it('keeps the two ways of practising apart, on the server (#147)', async () => {
    const run = await workedRun(PAIRS, 1);
    const pass = (
      await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
        client_request_id: randomUUID(),
      })
    ).body;
    const card = pass.items[0]!.item.id;
    const german = PAIRS.find(([fr]) => fr === pass.items[0]!.item.prompt)![1];

    // A card pass takes no answer, no hint, no "Lösung zeigen" and no second explanation:
    // the pass was decided when it started, and two kinds of evidence never meet on one
    // question (CLAUDE.md rule 1 — the code enforces it, not the screen).
    const answered = await l.api.post(`/practice/sessions/${pass.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: card,
      text: german,
    });
    expect([answered.status, why(answered.body)]).toEqual([409, 'use_cards']);
    expect(
      (
        await l.api.post(`/practice/sessions/${pass.id}/hint`, {
          client_turn_id: randomUUID(),
          item_id: card,
        })
      ).status,
    ).toBe(409);
    expect(
      (await l.api.post(`/practice/sessions/${pass.id}/reveal`, { item_id: card })).status,
    ).toBe(409);
    expect(
      (
        await l.api.post(`/practice/sessions/${pass.id}/reexplain`, {
          client_turn_id: randomUUID(),
          item_id: card,
          way: 'simpler',
        })
      ).status,
    ).toBe(409);
    // And a run of questions takes no card: she answers those, and what she says about a
    // card may not stand in for an answer nobody checked.
    const answering = await startRun(PAIRS, 'Unité 5');
    const asCard = await l.api.post(`/practice/sessions/${answering.id}/card`, {
      client_turn_id: randomUUID(),
      item_id: answering.items[0]!.item.id,
      recall: 'knew_it',
    });
    expect([asCard.status, why(asCard.body)]).toEqual([409, 'not_a_card_pass']);
    expect(
      (
        await env.db.one<{ n: number }>(
          `select count(*)::int as n from item_states where item_id = $1`,
          [answering.items[0]!.item.id],
        )
      ).n,
    ).toBe(0);
    // Nothing of that touched her learning state: the card still carries exactly the one
    // review the run before it wrote, and no self-assessment has been recorded for it.
    const state = await env.db.one<{ reps: number; last_outcome: string }>(
      `select reps, last_outcome from item_states where item_id = $1`,
      [card],
    );
    expect([state.reps, state.last_outcome]).toEqual([1, 'revealed']);
  });

  it('starts one pass per tap, and refuses a run that is still going (#147)', async () => {
    const run = await workedRun(PAIRS, 1);
    const requestId = randomUUID();
    const first = await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
      client_request_id: requestId,
    });
    const again = await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
      client_request_id: requestId,
    });
    expect(again.body.id).toBe(first.body.id);
    const passes = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_sessions where learner_id = $1 and pass = 'cards'`,
      [l.learnerId],
    );
    expect(passes.n).toBe(1);

    // A run she is still working on has no settled list of words that did not sit.
    const running = await startRun(PAIRS, 'Unité 4');
    const refused = await l.api.post(`/practice/sessions/${running.id}/cards`, {
      client_request_id: randomUUID(),
    });
    expect([refused.status, why(refused.body)]).toEqual([409, 'session_running']);
  });

  it('offers nothing when every word sat (#147)', async () => {
    const run = await workedRun(PAIRS.slice(0, 2), 2);
    expect(run.card_pass_offered).toBe(false);
    const refused = await l.api.post(`/practice/sessions/${run.id}/cards`, {
      client_request_id: randomUUID(),
    });
    expect([refused.status, why(refused.body)]).toEqual([404, 'no_cards']);
  });

  it("never opens another learner's words (#147)", async () => {
    const run = await workedRun(PAIRS, 1);
    const pass = (
      await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
        client_request_id: randomUUID(),
      })
    ).body;
    const other = await onboard(env);
    expect(
      (
        await other.api.post(`/practice/sessions/${run.id}/cards`, {
          client_request_id: randomUUID(),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await other.api.post(`/practice/sessions/${pass.id}/card`, {
          client_turn_id: randomUUID(),
          item_id: pass.items[0]!.item.id,
          recall: 'knew_it',
        })
      ).status,
    ).toBe(404);
    expect((await other.api.get(`/practice/sessions/${pass.id}`)).status).toBe(404);
    // Her pass is untouched by any of it.
    const open = await env.db.one<{ n: number }>(
      `select count(*)::int as n from session_items where session_id = $1 and status = 'open'`,
      [pass.id],
    );
    expect(open.n).toBe(pass.items.length);
  });
});
