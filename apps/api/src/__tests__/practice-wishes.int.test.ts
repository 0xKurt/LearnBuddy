// Three things a learner asks for and nothing could carry until now (issue #113): only the
// questions that went wrong, easier or harder ones, and one direction of a vocabulary pair.
// The model sets the argument, the code decides what it means — and when nothing fits, it
// says so instead of quietly practising something else (CLAUDE.md rule 5).
// docs/architecture.md §Practice, §Tools.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LlmRequest } from '../llm/gateway.js';
import { findOrCreateSubject } from '../modules/buddy/plan.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const say = (reply: string, actions: unknown[] = []) => ({
  lookups: [],
  concern: false,
  reply,
  options: null,
  actions,
  asks_permission: false,
});

async function send(l: Learner, text: string) {
  return l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: randomUUID(),
    text,
  });
}

/** The model tries `action`; when it is refused, it says so (and the refusal is returned). */
function tryAction(env: TestEnv, action: unknown): { refusal: () => string | null } {
  let refusal: string | null = null;
  env.llm.script('buddy_turn', { json: say('Mache ich.', [action]) }, (req: LlmRequest) => {
    const text = ScriptedGateway.textOf(req);
    const m = /action 1 \([a-z_]+\): ([^\n"]+)/.exec(text);
    refusal = m ? m[1]! : null;
    return say('Das geht so nicht.');
  });
  return { refusal: () => refusal };
}

type Spec = {
  prompt: string;
  difficulty?: number;
  kind?: 'short' | 'vocab';
  promptLang?: string;
  lang?: string;
  /**
   * How the last try went; absent = never asked. `missed` is how a practice test closes a
   * wrong answer — and a test feeds no FSRS state at all, so the filter must not need one.
   */
  last?: 'first_try' | 'with_help' | 'revealed' | 'missed';
};

/** One subject with one worksheet, its questions, and the session she did them in. */
async function seed(
  env: TestEnv,
  l: Learner,
  subjectName: string,
  specs: Spec[],
): Promise<Map<string, string>> {
  const now = env.clock.now();
  const later = new Date(now.getTime() + 24 * 3_600_000);
  return env.db.tx(async (tx) => {
    const subject = await findOrCreateSubject(tx, l.learnerId, subjectName, 'other');
    const m = await tx.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, subject_id, status, photo_count, created_at)
       values ($1, gen_random_uuid(), $2, 'ready', 1, $3) returning id`,
      [l.learnerId, subject.id, now],
    );
    const session = await tx.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, started_at, last_activity_at, finished_at)
       values ($1, 'practice', 'finished', $2, $2, $2) returning id`,
      [l.learnerId, now],
    );
    const ids = new Map<string, string>();
    let position = 0;
    for (const s of specs) {
      const item = await tx.one<{ id: string }>(
        `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic,
                            difficulty, prompt_lang, lang)
         values ($1, $2, $3, $4, $5, 'x', 'Thema', $6, $7, $8) returning id`,
        [
          l.learnerId,
          m.id,
          subject.id,
          s.kind ?? 'short',
          s.prompt,
          s.difficulty ?? 2,
          s.promptLang ?? null,
          s.lang ?? null,
        ],
      );
      ids.set(s.prompt, item.id);
      if (!s.last) continue;
      await tx.query(
        `insert into session_items (session_id, item_id, position, status, first_try_correct, closed_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          session.id,
          item.id,
          position++,
          s.last === 'first_try' || s.last === 'with_help' ? 'correct' : s.last,
          s.last === 'first_try',
          now,
        ],
      );
      // Practice also leaves an FSRS state; a test does not. Neither may decide the filter,
      // so only the ones that went through spaced repetition get one here.
      if (s.last !== 'missed') {
        // Due tomorrow: nothing is overdue, so only the wish decides what is chosen.
        await tx.query(
          `insert into item_states (item_id, learner_id, due, stability, difficulty, elapsed_days,
                                    scheduled_days, reps, lapses, state, last_review, last_outcome)
           values ($1, $2, $3, 1, 5, 0, 1, 1, 0, 2, $4, $5)`,
          [item.id, l.learnerId, later, now, s.last],
        );
      }
    }
    return ids;
  });
}

/** The questions of the practice Buddy prepared, newest step last. */
async function preparedSets(env: TestEnv, l: Learner) {
  return env.db.query<{
    item_ids: string[];
    only_wrong: boolean | null;
    difficulty: string | null;
  }>(
    `select payload -> 'item_ids' as item_ids,
            (payload ->> 'only_wrong')::boolean as only_wrong,
            payload ->> 'difficulty' as difficulty
       from buddy_steps
      where learner_id = $1 and kind = 'practice'
      order by created_at, seq`,
    [l.learnerId],
  );
}

const prepare = (args: Record<string, unknown>) => ({
  tool: 'prepare_practice',
  args: { goal: null, subject: 'f1', minutes: 10, focus_topics: [], ...args },
});

const draft = (over: Record<string, unknown>) => ({
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

describe.skipIf(!dbReady)('what she can ask for beyond the topic (issue #113)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  // ─────────────── only the ones she got wrong ───────────────

  it('takes only the questions that did not sit — fewer than the minutes suggest, never filled up', async () => {
    const ids = await seed(env, l, 'Französisch', [
      { prompt: 'nie gefragt A' },
      { prompt: 'nie gefragt B' },
      { prompt: 'saß A', last: 'first_try' },
      { prompt: 'saß B', last: 'first_try' },
      { prompt: 'mit Hilfe', last: 'with_help' },
      { prompt: 'gar nicht gewusst', last: 'revealed' },
      { prompt: 'im Probetest daneben', last: 'missed' },
    ]);
    env.llm.script('buddy_turn', {
      json: say('Nur die, die schiefgingen.', [prepare({ only_wrong: true })]),
    });
    const res = await send(l, 'nur die die ich falsch hatte nochmal');
    expect(res.status).toBe(200);

    // Ten minutes would be twelve questions; there are three she got wrong, so it is three —
    // including the one from the practice test, which leaves no spaced-repetition state.
    const [set] = await preparedSets(env, l);
    expect(set!.item_ids.sort()).toEqual(
      [
        ids.get('mit Hilfe')!,
        ids.get('gar nicht gewusst')!,
        ids.get('im Probetest daneben')!,
      ].sort(),
    );
    expect(set!.only_wrong).toBe(true);
    const done = res.body.home.done.map((a) => a.summary);
    expect(done).toContainEqual(
      expect.objectContaining({ tool: 'prepare_practice', question_count: 3 }),
    );
  });

  it('says plainly that nothing went wrong instead of preparing something else', async () => {
    await seed(env, l, 'Französisch', [
      { prompt: 'saß A', last: 'first_try' },
      { prompt: 'saß B', last: 'first_try' },
      { prompt: 'nie gefragt' },
    ]);
    const t = tryAction(env, prepare({ only_wrong: true }));
    expect((await send(l, 'nur die falschen nochmal')).status).toBe(200);
    expect(t.refusal()).toMatch(/none of her questions .* went wrong/);
    expect(await preparedSets(env, l)).toHaveLength(0);
  });

  it('never reaches another learner’s questions, however they went', async () => {
    const mine = await seed(env, l, 'Französisch', [{ prompt: 'meine', last: 'with_help' }]);
    const other = await onboard(env, { relation: 'child', name: 'Pia', birthDate: '2013-03-03' });
    await seed(env, other, 'Französisch', [
      { prompt: 'ihre A', last: 'with_help' },
      { prompt: 'ihre B', last: 'revealed' },
    ]);
    env.llm.script('buddy_turn', {
      json: say('Nur die falschen.', [prepare({ only_wrong: true })]),
    });
    expect((await send(l, 'nur die falschen')).status).toBe(200);
    const [set] = await preparedSets(env, l);
    expect(set!.item_ids).toEqual([mine.get('meine')!]);
  });

  it('never prepares from a context that has changed meanwhile', async () => {
    const ids = await seed(env, l, 'Französisch', [
      { prompt: 'falsch', last: 'with_help' },
      { prompt: 'saß', last: 'first_try' },
    ]);
    const settings = await l.api.get<{ version: number }>('/buddy/settings');
    env.llm.script(
      'buddy_turn',
      async () => {
        // While the model thinks, she changes a setting on another screen.
        const r = await l.api.patch('/buddy/settings', {
          quiet_start: '19:30',
          version: settings.body.version,
        });
        expect(r.status).toBe(200);
        return say('Nur die falschen.', [prepare({ only_wrong: true })]);
      },
      // Asked again on the fresh state, Buddy prepares what she asked for now.
      () => say('Dann eben alles.', [prepare({})]),
    );
    expect((await send(l, 'nur die falschen')).status).toBe(200);

    const decisions = await env.db.query<{ disposition: string }>(
      `select disposition from buddy_decisions where learner_id = $1`,
      [l.learnerId],
    );
    expect(decisions.map((d) => d.disposition).sort()).toEqual(['applied', 'stale']);
    // Exactly one preparation, and it is the second decision's: both questions, no filter.
    const sets = await preparedSets(env, l);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.only_wrong).toBe(false);
    expect(sets[0]!.item_ids.sort()).toEqual([ids.get('falsch')!, ids.get('saß')!].sort());
  });

  // ─────────────── easier or harder ───────────────

  it('takes the harder half of her own questions, and the easier half', async () => {
    const ids = await seed(env, l, 'Mathe', [
      { prompt: 'ganz leicht', difficulty: 1 },
      { prompt: 'leicht', difficulty: 2 },
      { prompt: 'mittel', difficulty: 3 },
      { prompt: 'schwer', difficulty: 4 },
      { prompt: 'am schwersten', difficulty: 5 },
    ]);
    env.llm.script(
      'buddy_turn',
      { json: say('Dann etwas schwerer.', [prepare({ difficulty: 'harder' })]) },
      { json: say('Und jetzt leichter.', [prepare({ difficulty: 'easier' })]) },
    );
    expect((await send(l, 'mach die aufgaben schwerer das war babykram')).status).toBe(200);
    expect((await send(l, 'kannst du leichtere machen ich schaff das nicht')).status).toBe(200);

    const [harder, easier] = await preparedSets(env, l);
    expect(harder!.item_ids.sort()).toEqual([ids.get('schwer')!, ids.get('am schwersten')!].sort());
    expect(harder!.difficulty).toBe('harder');
    expect(easier!.item_ids.sort()).toEqual([ids.get('ganz leicht')!, ids.get('leicht')!].sort());
    expect(easier!.difficulty).toBe('easier');
  });

  it('says her material has no harder half instead of handing her the same questions again', async () => {
    await seed(env, l, 'Mathe', [
      { prompt: 'a', difficulty: 2 },
      { prompt: 'b', difficulty: 2 },
      { prompt: 'c', difficulty: 2 },
      { prompt: 'd', difficulty: 2 },
    ]);
    const t = tryAction(env, prepare({ difficulty: 'harder' }));
    expect((await send(l, 'das war babykram mach schwerer')).status).toBe(200);
    expect(t.refusal()).toMatch(/no harder half/);
    expect(await preparedSets(env, l)).toHaveLength(0);
  });

  it('writes new questions at the level she asked for, and keeps them at it', async () => {
    env.llm.script('explain', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('DIFFICULTY: a step above their grade');
      return {
        usable: true,
        title: 'Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          draft({ prompt: 'zu leicht 1', difficulty: 1 }),
          draft({ prompt: 'zu leicht 2', difficulty: 2 }),
          draft({ prompt: 'passt 1', difficulty: 3 }),
          draft({ prompt: 'passt 2', difficulty: 4 }),
          draft({ prompt: 'passt 3', difficulty: 5 }),
        ],
      };
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche',
      difficulty: 'harder',
    });
    expect(res.status).toBe(201);
    expect(res.body.items.map((i) => i.item.prompt)).toEqual(['passt 1', 'passt 2', 'passt 3']);
    await env.flushBackground(); // prepared hints for the new questions

    // The marks are the model's own: a set that would shrink below a session stays whole,
    // rather than costing her the practice she asked for.
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Dreisatz',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          draft({ prompt: 'A', difficulty: 1 }),
          draft({ prompt: 'B', difficulty: 1 }),
          draft({ prompt: 'C', difficulty: 2 }),
          draft({ prompt: 'D', difficulty: 4 }),
        ],
      },
    });
    const thin = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Dreisatz',
      difficulty: 'harder',
    });
    expect(thin.status).toBe(201);
    expect(thin.body.items.map((i) => i.item.prompt)).toEqual(['A', 'B', 'C', 'D']);
    await env.flushBackground();
  });

  // ─────────────── which way round the vocabulary is asked ───────────────

  it('asks her own vocabulary in the direction she wants, and only vocabulary', async () => {
    const ids = await seed(env, l, 'Französisch', [
      { prompt: 'le chien', kind: 'vocab', promptLang: 'fr', lang: 'de' },
      { prompt: 'la souris', kind: 'vocab', promptLang: 'fr', lang: 'de' },
      { prompt: 'der Hund', kind: 'vocab', promptLang: 'de', lang: 'fr' },
      { prompt: 'die Maus', kind: 'vocab', promptLang: 'de', lang: 'fr' },
      { prompt: 'Grammatikfrage' },
    ]);
    env.llm.script(
      'buddy_turn',
      { json: say('Deutsch zuerst.', [prepare({ direction: 'produce' })]) },
      { json: say('Und andersrum.', [prepare({ direction: 'recognise' })]) },
    );
    expect((await send(l, 'frag andersrum also deutsch zuerst')).status).toBe(200);
    expect((await send(l, 'jetzt wieder französisch zuerst')).status).toBe(200);

    const [produce, recognise] = await preparedSets(env, l);
    expect(produce!.item_ids.sort()).toEqual([ids.get('der Hund')!, ids.get('die Maus')!].sort());
    expect(recognise!.item_ids.sort()).toEqual(
      [ids.get('le chien')!, ids.get('la souris')!].sort(),
    );
  });

  it('says she has no vocabulary in that direction instead of asking something else', async () => {
    await seed(env, l, 'Französisch', [{ prompt: 'Grammatikfrage' }, { prompt: 'noch eine' }]);
    const t = tryAction(env, prepare({ direction: 'produce' }));
    expect((await send(l, 'frag mich die vokabeln andersrum ab')).status).toBe(200);
    expect(t.refusal()).toMatch(/no vocabulary for this in that direction/);
    expect(await preparedSets(env, l)).toHaveLength(0);
  });

  it('carries the direction from Buddy’s offer into the session, and stores both ways', async () => {
    env.llm.script('buddy_turn', {
      json: say('Dann so herum.', [
        {
          tool: 'offer_learning',
          args: {
            kind: 'vocab',
            text: 'le chien – der Hund, la souris – die Maus',
            goal: null,
            difficulty: null,
            direction: 'produce',
          },
        },
      ]),
    });
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Unité 3',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          draft({
            kind: 'vocab',
            prompt: 'le chien',
            answer: 'der Hund',
            prompt_lang: 'fr',
            lang: 'de',
          }),
          draft({
            kind: 'vocab',
            prompt: 'la souris',
            answer: 'die Maus',
            prompt_lang: 'fr',
            lang: 'de',
          }),
        ],
      },
    });
    const sent = await send(l, 'frag die vokabeln andersrum ab, deutsch zuerst');
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(action?.summary).toMatchObject({ tool: 'offer_learning', direction: 'produce' });
    // Buddy prepares his own offer in the background — with exactly what she asked for.
    await env.flushBackground();

    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: action!.id,
      kind: 'vocab',
      text: 'le chien – der Hund, la souris – die Maus',
      direction: 'produce',
    });
    expect(tapped.status === 200 || tapped.status === 201).toBe(true);
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    // She writes the French words; the German ones are what she reads.
    expect(tapped.body.items.map((i) => [i.item.prompt, i.item.prompt_lang, i.item.lang])).toEqual([
      ['der Hund', 'de', 'fr'],
      ['die Maus', 'de', 'fr'],
    ]);
    // Both directions are stored all the same, so the other one can be practised later.
    const stored = await env.db.query<{ prompt: string }>(
      `select prompt from items where learner_id = $1 and kind = 'vocab' order by prompt`,
      [l.learnerId],
    );
    expect(stored.map((r) => r.prompt)).toEqual(['der Hund', 'die Maus', 'la souris', 'le chien']);
  });
  // ─────────────── one sheet, or nothing but vocabulary (issue #144) ───────────────

  it('practises the sheet she pointed at, not the other one of the same subject', async () => {
    // Exactly the owner's daughter's situation on 30.09.: two French sheets, one a word
    // list, one about giving directions. Newest sheet first in STATE, so the word list
    // seeded second is sh1.
    const directions = await seed(env, l, 'Französisch', [
      { prompt: 'Wo ist der Bahnhof?' },
      { prompt: 'Wie komme ich zur Post?' },
      { prompt: 'Geh geradeaus' },
    ]);
    const words = await seed(env, l, 'Französisch', [
      { prompt: 'le vélo', kind: 'vocab', promptLang: 'fr', lang: 'de' },
      { prompt: 'la gare', kind: 'vocab', promptLang: 'fr', lang: 'de' },
    ]);
    env.llm.script('buddy_turn', {
      json: say('Die vom Vokabelzettel.', [prepare({ sheet: 'sh1' })]),
    });
    expect((await send(l, 'frag mich die vokabeln von dem zettel ab')).status).toBe(200);

    const [set] = await preparedSets(env, l);
    expect(set!.item_ids.sort()).toEqual([words.get('le vélo')!, words.get('la gare')!].sort());
    for (const p of ['Wo ist der Bahnhof?', 'Wie komme ich zur Post?', 'Geh geradeaus']) {
      expect(set!.item_ids).not.toContain(directions.get(p)!);
    }
  });

  it('takes only the vocabulary when she asks for vocabulary, whatever else the subject holds', async () => {
    const directions = await seed(env, l, 'Französisch', [
      { prompt: 'Wo ist der Bahnhof?' },
      { prompt: 'Geh geradeaus' },
    ]);
    const words = await seed(env, l, 'Französisch', [
      { prompt: 'le vélo', kind: 'vocab', promptLang: 'fr', lang: 'de' },
      { prompt: 'la gare', kind: 'vocab', promptLang: 'fr', lang: 'de' },
    ]);
    env.llm.script('buddy_turn', {
      json: say('Nur Vokabeln.', [prepare({ vocabulary_only: true })]),
    });
    expect((await send(l, 'frag mich vokabeln ab')).status).toBe(200);

    const [set] = await preparedSets(env, l);
    expect(set!.item_ids.sort()).toEqual([words.get('le vélo')!, words.get('la gare')!].sort());
    expect(set!.item_ids).not.toContain(directions.get('Geh geradeaus')!);
  });

  it('says there is no vocabulary here instead of practising the other questions', async () => {
    await seed(env, l, 'Französisch', [
      { prompt: 'Wo ist der Bahnhof?' },
      { prompt: 'Geh geradeaus' },
    ]);
    const attempt = tryAction(env, prepare({ vocabulary_only: true }));
    expect((await send(l, 'frag mich vokabeln ab')).status).toBe(200);
    expect(attempt.refusal()).toContain('no vocabulary');
    expect(await preparedSets(env, l)).toEqual([]);
  });

  it("never reaches another learner's sheet through the alias", async () => {
    const other = await onboard(env, { relation: 'child', name: 'Mara', birthDate: '2013-05-05' });
    await seed(env, other, 'Französisch', [
      { prompt: 'le chat', kind: 'vocab', promptLang: 'fr', lang: 'de' },
    ]);
    await seed(env, l, 'Französisch', [{ prompt: 'Geh geradeaus' }]);
    // sh2 is not hers: her own STATE lists exactly one sheet.
    const attempt = tryAction(env, prepare({ sheet: 'sh2' }));
    expect((await send(l, 'frag mich das andere blatt ab')).status).toBe(200);
    expect(attempt.refusal()).toContain('no sheet sh2');
    expect(await preparedSets(env, l)).toEqual([]);
  });
  // ─────────────── how many, from what she said (issue #145) ───────────────

  it('takes the number she named instead of the minute estimate', async () => {
    await seed(
      env,
      l,
      'Französisch',
      Array.from({ length: 12 }, (_, i) => ({
        prompt: `Vokabel ${i + 1}`,
        kind: 'vocab' as const,
        promptLang: 'fr',
        lang: 'de',
      })),
    );
    env.llm.script('buddy_turn', {
      json: say('Fünf also.', [prepare({ question_count: 5 })]),
    });
    expect((await send(l, 'frag mich fünf vokabeln ab')).status).toBe(200);
    const [set] = await preparedSets(env, l);
    expect(set!.item_ids).toHaveLength(5);
  });

  it('asks the whole list when she asks for all of it, past what ten minutes would give', async () => {
    // Twenty-four words: the minute estimate would have handed her twelve of them, and the
    // old ceiling fifteen — "wieder sinnlos, weil begrenzt auf 10" (owner, 30.09.).
    await seed(
      env,
      l,
      'Französisch',
      Array.from({ length: 24 }, (_, i) => ({
        prompt: `Wort ${i + 1}`,
        kind: 'vocab' as const,
        promptLang: 'fr',
        lang: 'de',
      })),
    );
    env.llm.script('buddy_turn', {
      json: say('Alle.', [prepare({ all_of_them: true, vocabulary_only: true })]),
    });
    expect((await send(l, 'frag mich alle vokabeln ab')).status).toBe(200);
    const [set] = await preparedSets(env, l);
    expect(set!.item_ids).toHaveLength(24);
  });

  it('still uses the minutes when she said nothing about how many', async () => {
    await seed(
      env,
      l,
      'Französisch',
      Array.from({ length: 30 }, (_, i) => ({ prompt: `Frage ${i + 1}` })),
    );
    env.llm.script('buddy_turn', { json: say('Zehn Minuten.', [prepare({})]) });
    expect((await send(l, 'lass uns kurz üben')).status).toBe(200);
    const [set] = await preparedSets(env, l);
    // questionCountFor(10) = 12.
    expect(set!.item_ids).toHaveLength(12);
  });
});
