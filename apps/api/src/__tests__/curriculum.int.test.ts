// The Bundesland decides what counts as a right answer (issue #214).
//
// `learners.curriculum_region` has been collected as a required field since #199 and read by
// nothing. These tests are what makes the purpose true — and what will fail if it stops being:
//
//   1. the same model output becomes two different sessions in two states (code alone decides);
//   2. the same question with the same answer gets two different judgements in two states;
//   3. no state known (null, `other`, or a state nobody has researched) → the cautious
//      judgement, never a confident "wrong", and the same prompt text in all three cases;
//   4. the state reaches the generator and the sheet reader, not only the judge.
//
// docs/lehrplan-und-uebungsformen.md §3 (Hypothesentest), §6.2 (Satzglieder).
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  CurriculumRegion,
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

const WAIT = { json: { decision: 'wait', reason: 'nothing to say' } };

/** The one German sentence of §6.2, asked the way a sheet asks it. */
const SATZGLIEDER = item({
  prompt: 'Bestimme die Satzglieder des Satzes auf dem Blatt.',
  answer: 'Subjekt, Dativobjekt, Akkusativobjekt, Temporaladverbiale',
  topic: 'Satzglieder',
  curriculum_point: 'satzglieder',
});

describe.skipIf(!dbReady)('the Bundesland decides what counts', () => {
  let env: TestEnv;
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
  });

  /** A learner at a school in `region`, in year `grade`. */
  async function schoolgirl(
    region: CurriculumRegion | null,
    grade: number,
    name = 'Lena',
  ): Promise<Learner> {
    const l = await onboard(env, {
      relation: 'child',
      name,
      birthDate: '2010-02-10',
      pin: '4826',
      ...(region === null ? {} : { region }),
    });
    const set = await l.api.patch<{ version: number }>('/learner', {
      level: 'school',
      grade,
      version: 1,
    });
    expect(set.status).toBe(200);
    // `null` is the state of every profile from before #199, and it is what the field looks
    // like for most rows today: POST /learner requires a value, so it is set here directly.
    if (region === null) {
      await env.db.query(`update learners set curriculum_region = null where id = $1`, [
        l.learnerId,
      ]);
    }
    return l;
  }

  // ───────────────────────── 1. Code alone, no model discretion ─────────────────────────

  it('leaves a question out of a practice test that her state does not teach', async () => {
    // THE SHARPEST CASE IN THE REPORT (§3): the significance test is compulsory in Berlin,
    // Brandenburg and BW and does not appear in the NRW or Bayern plan at all. The model
    // writes the SAME three questions for both learners — the difference is code's.
    const threeQuestions = {
      json: {
        usable: true,
        title: 'Stochastik',
        subject: { name: 'Mathematik', kind: 'math' },
        items: [
          item({
            prompt: 'Was ist ein Erwartungswert?',
            answer: 'Mittelwert',
            topic: 'Stochastik',
          }),
          item({ prompt: 'Was ist eine Binomialverteilung?', answer: 'n, p', topic: 'Stochastik' }),
          item({
            prompt: 'Bestimme den Ablehnungsbereich des Signifikanztests.',
            answer: 'k > 12',
            topic: 'Hypothesentest',
            curriculum_point: 'hypothesentest',
          }),
        ],
      },
    };
    const testFor = async (l: Learner) => {
      env.llm.script('explain', threeQuestions);
      const res = await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'test',
        text: 'Stochastik üben',
      });
      expect(res.status).toBe(201);
      return res.body.items.map((i) => i.item.prompt);
    };

    const inBw = await testFor(await schoolgirl('bw', 12, 'Bea'));
    const inNrw = await testFor(await schoolgirl('nw', 12, 'Nina'));

    expect(inBw).toHaveLength(3);
    expect(inBw.some((p) => p.includes('Signifikanztest'))).toBe(true);
    // Correct in the subject, but not on the test her NRW class writes.
    expect(inNrw).toHaveLength(2);
    expect(inNrw.some((p) => p.includes('Signifikanztest'))).toBe(false);
  });

  it('keeps it in free practice and when it is unknown whether her state teaches it', async () => {
    // Dropping is only right where the mode promises her class's test. She may ask for
    // anything she likes in practice, and ignorance never costs her a question.
    const set = {
      json: {
        usable: true,
        title: 'Stochastik',
        subject: { name: 'Mathematik', kind: 'math' },
        items: [
          item({
            prompt: 'Bestimme den Ablehnungsbereich des Signifikanztests.',
            answer: 'k > 12',
            topic: 'Hypothesentest',
            curriculum_point: 'hypothesentest',
          }),
        ],
      },
    };
    const nrw = await schoolgirl('nw', 12, 'Nina');
    env.llm.script('explain', set);
    env.llm.byDefault('hints', { json: { items: [] } });
    const practice = await nrw.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Signifikanztest üben',
    });
    expect(practice.status).toBe(201);
    expect(practice.body.items).toHaveLength(1);
    await env.flushBackground();

    // A state nobody has researched: the test keeps every question.
    const hessen = await schoolgirl('he', 12, 'Hanna');
    env.llm.script('explain', set);
    const asTest = await hessen.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Signifikanztest üben',
    });
    expect(asTest.status).toBe(201);
    expect(asTest.body.items).toHaveLength(1);

    // And a test that would be left EMPTY by the rule keeps its questions: she asked for it,
    // and "nothing to learn from this" would be the worse answer. A rule shapes a set, it
    // never takes it away.
    const nrwAgain = await schoolgirl('nw', 12, 'Nora');
    env.llm.script('explain', set);
    const onlyOffPlan = await nrwAgain.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Signifikanztest üben',
    });
    expect(onlyOffPlan.status).toBe(201);
    expect(onlyOffPlan.body.items).toHaveLength(1);
  });

  // ───────────────────────── 2. Two states, two judgements ─────────────────────────

  async function satzgliederSession(l: Learner): Promise<SessionView> {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Satzglieder',
        subject: { name: 'Deutsch', kind: 'german' },
        items: [SATZGLIEDER],
      },
    });
    env.llm.byDefault('hints', { json: { items: [] } });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Satzglieder üben',
    });
    expect(res.status).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(l: Learner, session: SessionView, text: string) {
    const res = await l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: session.items[0]!.item.id,
      text,
    });
    expect(res.status).toBe(200);
    return res.body;
  }

  it('judges the same answer differently in Bayern and in Nordrhein-Westfalen', async () => {
    // §6.2: "Subjekt, Objekt, Adverbial" is the whole answer in NRW and not yet the whole
    // answer in Bayern, which names the case. What differs between the two runs is ONLY the
    // ruling code looked up and put in front of the judge — the question, the key and the
    // learner's words are identical, and the scripted judge follows the ruling it is given.
    // (What this proves is that the state reaches the judgement and changes it. How the real
    // model weighs it is a question for the evals, not for a test.)
    const judgeByTheRuling = (req: Parameters<typeof ScriptedGateway.textOf>[0]) => {
      // A phrase only Bayern's RULING carries — not its name, and not the key (which names
      // the cases in both runs): the judge keys on the rule it was handed, nothing else.
      const sawBayern = ScriptedGateway.textOf(req).includes('not yet the whole answer');
      return {
        intent: 'answer',
        verdict: sawBayern ? 'partially_correct' : 'correct',
        reply: sawBayern ? 'Fast — welcher Fall ist das Objekt?' : 'Genau so.',
        gave_hint: sawBayern,
        revealed_answer: false,
      };
    };
    const HER_ANSWER = 'Subjekt, Objekt, Adverbial';

    const bayern = await schoolgirl('by', 6, 'Berta');
    const bavarian = await satzgliederSession(bayern);
    env.llm.script('tutor', judgeByTheRuling);
    const inBayern = await answer(bayern, bavarian, HER_ANSWER);

    const nrw = await schoolgirl('nw', 6, 'Nina');
    const westphalian = await satzgliederSession(nrw);
    env.llm.script('tutor', judgeByTheRuling);
    const inNrw = await answer(nrw, westphalian, HER_ANSWER);

    expect(inBayern.verdict).toBe('partially_correct');
    expect(inNrw.verdict).toBe('correct');
  });

  it('tells the judge her state and its rule, and tells it when there is none', async () => {
    const contextFor = async (region: CurriculumRegion | null): Promise<string> => {
      const l = await schoolgirl(region, 6, `L${region ?? 'null'}`);
      const session = await satzgliederSession(l);
      let seen = '';
      env.llm.script('tutor', (req) => {
        seen = ScriptedGateway.textOf(req);
        return {
          intent: 'answer',
          verdict: 'correct',
          reply: 'Genau.',
          gave_hint: false,
          revealed_answer: false,
        };
      });
      await answer(l, session, 'Subjekt, Objekt, Adverbial');
      return seen;
    };

    const bayern = await contextFor('by');
    expect(bayern).toContain('CURRICULUM (Bundesland: Bayern');
    expect(bayern).toContain('Dativobjekt');

    const abroad = await contextFor('other');
    expect(abroad).toContain('her Bundesland is not known');
    expect(abroad).toContain('partially_correct');
    expect(abroad).not.toContain('Bayern');
  });

  // ───────────────────────── 3. The default path: no state rule ─────────────────────────

  it('never calls an answer wrong when no state rule applies — null, other and an unresearched state alike', async () => {
    // THE PATH EVERY LEARNER IS ON TODAY. The judge says "wrong"; code will not let that
    // stand at a place where her own school may well name it her way.
    const judged: Record<string, string | null> = {};
    const contexts: Record<string, string> = {};
    for (const region of [null, 'other', 'he'] as const) {
      const key = String(region);
      const l = await schoolgirl(region, 6, `L${key}`);
      const session = await satzgliederSession(l);
      env.llm.script('tutor', (req) => {
        contexts[key] = ScriptedGateway.textOf(req);
        return {
          intent: 'answer',
          verdict: 'incorrect',
          reply: 'Das stimmt nicht.',
          gave_hint: false,
          revealed_answer: false,
        };
      });
      judged[key] = (await answer(l, session, 'Subjekt, Objekt, Adverbial')).verdict;
    }
    expect(judged).toEqual({
      null: 'partially_correct',
      other: 'partially_correct',
      he: 'partially_correct',
    });
    // And all three were told exactly the same thing.
    expect(contexts['other']).toBe(contexts['null']);
    expect(contexts['he']).toBe(contexts['null']);
  });

  it('still lets a wrong number be wrong where no state rule applies', async () => {
    // Caution is for what a state could decide, not for arithmetic: a rule-checked wrong
    // answer stays wrong whatever the Bundesland.
    const l = await schoolgirl(null, 6);
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Satzglieder',
        subject: { name: 'Deutsch', kind: 'german' },
        items: [
          item({
            kind: 'numeric',
            prompt: 'Wie viele Satzglieder hat der Satz?',
            answer: '4',
            topic: 'Satzglieder',
            curriculum_point: 'satzglieder',
          }),
        ],
      },
    });
    env.llm.byDefault('hints', { json: { items: [] } });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Satzglieder üben',
    });
    expect(res.status).toBe(201);
    await env.flushBackground();
    const judgement = await answer(l, res.body, '3');
    expect(judgement.verdict).toBe('incorrect');
  });

  // ───────────────────────── 4. The state reaches both writers ─────────────────────────

  it('tells the generator which curriculum writes the key', async () => {
    const promptFor = async (region: CurriculumRegion | null): Promise<string> => {
      const l = await schoolgirl(region, 6, `G${region ?? 'null'}`);
      let seen = '';
      env.llm.script('explain', (req) => {
        seen = ScriptedGateway.textOf(req);
        return {
          usable: true,
          title: 'Satzglieder',
          subject: { name: 'Deutsch', kind: 'german' },
          items: [SATZGLIEDER],
        };
      });
      env.llm.byDefault('hints', { json: { items: [] } });
      const res = await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: 'Satzglieder üben',
      });
      expect(res.status).toBe(201);
      await env.flushBackground();
      return seen;
    };
    expect(await promptFor('bw')).toContain('CURRICULUM (Bundesland: Baden-Württemberg');
    const unknown = await promptFor(null);
    expect(unknown).toContain("CURRICULUM: her Bundesland is not known, so NO state's rule");
    expect(unknown).toContain('[satzglieder]');
  });

  it('tells the sheet reader which curriculum writes the key', async () => {
    const promptFor = async (region: CurriculumRegion | null): Promise<string> => {
      const l = await schoolgirl(region, 6, `M${region ?? 'null'}`);
      let seen = '';
      env.llm.script('extraction', (req) => {
        seen = ScriptedGateway.textOf(req);
        return {
          is_learning_material: true,
          readable: true,
          title: 'Satzglieder',
          subject: { name: 'Deutsch', kind: 'german' },
          extracted_text: 'Bestimme die Satzglieder.',
          items: [SATZGLIEDER],
        };
      });
      env.llm.byDefault('buddy_check', WAIT);
      const created = await l.api.post<{
        material: MaterialView;
        uploads: Array<{ path: string }>;
      }>('/materials', { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] });
      expect(created.status).toBe(201);
      for (const u of created.body.uploads) env.storage.put(u.path);
      expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
      await env.flushBackground();
      return seen;
    };
    expect(await promptFor('by')).toContain('CURRICULUM (Bundesland: Bayern');
    expect(await promptFor('other')).toContain("her Bundesland is not known, so NO state's rule");
  });

  it('stores the place the question is at, so the judgement can find it again', async () => {
    const l = await schoolgirl('by', 6);
    const session = await satzgliederSession(l);
    const row = await env.db.one<{ curriculum_point: string | null }>(
      `select curriculum_point from items where id = $1`,
      [session.items[0]!.item.id],
    );
    expect(row.curriculum_point).toBe('satzglieder');
  });

  it('says nothing about any curriculum to a learner who is not at school', async () => {
    // No school year, no claim: the curricula are written per year (and an adult learner has
    // no Bundesland rule at all).
    const adult = await onboard(env, { relation: 'self', name: 'Alex', birthDate: '1990-01-01' });
    let seen = '';
    env.llm.script('explain', (req) => {
      seen = ScriptedGateway.textOf(req);
      return {
        usable: true,
        title: 'Spanisch',
        subject: { name: 'Spanisch', kind: 'spanish' },
        items: [item({ prompt: 'la casa', answer: 'das Haus', prompt_lang: 'es', lang: 'de' })],
      };
    });
    env.llm.byDefault('hints', { json: { items: [] } });
    const res = await adult.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Spanisch üben',
    });
    expect(res.status).toBe(201);
    await env.flushBackground();
    expect(seen).not.toContain('CURRICULUM');
  });
});
