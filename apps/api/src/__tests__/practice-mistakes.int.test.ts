// New questions learn from measured outcomes, without another model call or stored profile.
// docs/architecture.md §Practice, issue #871.
// requires live verification in Claude Code session (real Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { SessionView, StartTopicRequest } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findOrCreateSubject } from '../modules/learning/state.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('new practice learns from her mistakes (#871)', () => {
  let env: TestEnv;
  let learner: Learner;
  let generatedTopic: string;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-23T10:00:00Z' });
    learner = await onboard(env);
    generatedTopic = 'Addition';
    env.llm.byDefault('hints', { json: { items: [] } });
    env.llm.byDefault('explain', () => ({
      usable: true,
      title: 'Neue Aufgaben',
      subject: { name: 'Mathe', kind: 'math' },
      items: [1, 2, 3].map((n) => ({
        kind: 'numeric',
        prompt: `${n} + 2`,
        answer: String(n + 2),
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: generatedTopic,
        difficulty: 2,
        prompt_lang: null,
        lang: null,
        figure: null,
        source_excerpt: null,
      })),
    }));
  });
  afterEach(() => env.closeChecked());

  async function seed(
    topic: string,
    opts: {
      owner?: Learner;
      subject?: string;
      status?: string;
      first?: boolean;
      flagged?: boolean;
      archived?: boolean;
      kind?: string;
      selfRated?: boolean;
      said?: string;
      prompt?: string;
    } = {},
  ) {
    const owner = opts.owner ?? learner;
    const subject = await findOrCreateSubject(
      env.db,
      owner.learnerId,
      opts.subject ?? 'Mathe',
      'other',
    );
    const item = await env.db.one<{ id: string }>(
      `insert into items (learner_id, subject_id, origin, kind, prompt, answer, topic, created_at, archived_at)
       values ($1, $2, 'buddy', $3, $4, '4', $5, $6, $7) returning id`,
      [
        owner.learnerId,
        subject.id,
        opts.kind ?? 'numeric',
        opts.prompt ?? 'Kürze 8/2',
        topic,
        env.clock.now(),
        opts.archived ? env.clock.now() : null,
      ],
    );
    const session = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, started_at, last_activity_at, created_at)
       values ($1, 'test', 'active', $2, $2, $2) returning id`,
      [owner.learnerId, env.clock.now()],
    );
    await env.db.query(
      `insert into session_items (session_id, item_id, position, status, first_try_correct, closed_at, flagged_at, answered_by)
       values ($1, $2, 0, $3, $4, $5, $6, $7)`,
      [
        session.id,
        item.id,
        opts.status ?? 'missed',
        opts.status === 'open' ? null : (opts.first ?? false),
        opts.status === 'open' ? null : env.clock.now(),
        opts.flagged ? env.clock.now() : null,
        opts.selfRated ? 'self_rated' : 'typed',
      ],
    );
    if (opts.said)
      await env.db.query(
        `insert into practice_turns (learner_id, session_id, item_id, seq, role, text, verdict, created_at)
       values ($1, $2, $3, 1, 'learner', $4, 'incorrect', $5)`,
        [owner.learnerId, session.id, item.id, opts.said, env.clock.now()],
      );
    return { item: item.id, session: session.id };
  }

  async function generate(over: Partial<StartTopicRequest> = {}) {
    const result = await learner.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Neue Aufgaben bitte',
      subject: 'Mathe',
      ...over,
    });
    expect(result.status).toBe(201);
    await env.flushBackground();
    const request = env.llm.callsFor('explain').at(-1)!;
    return ScriptedGateway.textOf(request);
  }

  it.each(['practice', 'test'] as const)(
    'names the topic and latest wrong answer after a %s miss',
    async (mode) => {
      const old = await seed('Brüche kürzen', { status: 'open' });
      await env.db.query('update practice_sessions set mode = $2 where id = $1', [
        old.session,
        mode,
      ]);
      const answered = await learner.api.post(`/practice/sessions/${old.session}/answer`, {
        client_turn_id: randomUUID(),
        item_id: old.item,
        text: '17',
      });
      expect(answered.status).toBe(200);
      const outcome = await env.db.one<{ status: string }>(
        'select status from session_items where session_id = $1',
        [old.session],
      );
      expect(outcome.status).toBe(mode === 'test' ? 'missed' : 'open');
      const context = await generate();
      expect(context).toContain('LEARNING GAPS');
      expect(context).toContain('Brüche kürzen');
      expect(context).toContain('Kürze 8/2');
      expect(context).toContain('"said":"17"');
    },
  );

  it('excludes other learners, subjects, unmeasured outcomes, archived and disputed items', async () => {
    const other = await onboard(env);
    await seed('Fremdes Thema', { owner: other, said: 'geheime Antwort' });
    await seed('Andere Sprache', { subject: 'Deutsch' });
    await seed('Übersprungen', { status: 'skipped' });
    await seed('Noch offen', { status: 'open' });
    await seed('Saß sofort', { status: 'correct', first: true });
    await seed('Beanstandet', { flagged: true });
    await seed('Archiviert', { archived: true });
    await seed('Selbst bewertet', { selfRated: true });
    await seed('Freier Text', { kind: 'long' });
    await seed('Mit Hilfe', { status: 'correct' });
    const context = await generate();
    expect(context).toContain('Mit Hilfe');
    for (const absent of [
      'Fremdes Thema',
      'geheime Antwort',
      'Andere Sprache',
      'Übersprungen',
      'Noch offen',
      'Saß sofort',
      'Beanstandet',
      'Archiviert',
      'Selbst bewertet',
      'Freier Text',
    ]) {
      expect(context).not.toContain(absent);
    }
  });

  it('forgets an old miss after a later first-try success on that question', async () => {
    const old = await seed('Inzwischen sicher', { said: 'alter Fehler' });
    const later = await seed('Auch sicher', { status: 'correct', first: true });
    await env.db.query(
      `insert into session_items (session_id, item_id, position, status, first_try_correct, closed_at, answered_by)
       values ($1, $2, 1, 'correct', true, $3, 'typed')`,
      [later.session, old.item, env.clock.now()],
    );
    expect(await generate()).not.toContain('LEARNING GAPS');
  });

  it('ranks repeated gaps first and includes only the latest graded wrong answer', async () => {
    await seed('Einmal daneben');
    await seed('Häufig daneben');
    const helped = await seed('Häufig daneben', { status: 'correct', said: 'alter Versuch' });
    await seed('Zuletzt daneben');
    await env.db.query(
      `insert into practice_turns (learner_id, session_id, item_id, seq, role, text, verdict, created_at)
       values ($1, $2, $3, 2, 'learner', 'letzter Fehlversuch', 'incorrect', $4),
              ($1, $2, $3, 3, 'learner', 'keine Antwort', 'not_an_attempt', $4),
              ($1, $2, $3, 4, 'learner', 'richtige Antwort', 'correct', $4),
              ($1, $2, $3, 5, 'tutor', 'Tutorantwort', null, $4)`,
      [learner.learnerId, helped.session, helped.item, env.clock.now()],
    );
    const context = await generate();
    expect(context).toContain('Häufig daneben');
    expect(context).toContain('Zuletzt daneben');
    expect(context.indexOf('Häufig daneben')).toBeLessThan(context.indexOf('Zuletzt daneben'));
    expect(context).toContain('letzter Fehlversuch');
    for (const absent of [
      'Einmal daneben',
      'alter Versuch',
      'keine Antwort',
      'richtige Antwort',
      'Tutorantwort',
    ]) {
      expect(context).not.toContain(absent);
    }
  });

  it('bounds goal-based tests to their ready sheets, including their subject', async () => {
    const source = await seed('Brüche kürzen', { said: '16' });
    await seed('Geometrie');
    await seed('Brüche kürzen', { subject: 'Physik', said: 'falsches Fach' });
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, created_at) values ($1, 'topic', 'Klassenarbeit', $2) returning id`,
      [learner.learnerId, env.clock.now()],
    );
    const material = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, subject_id, goal_id, status, photo_count, created_at)
       select learner_id, gen_random_uuid(), subject_id, $2, 'ready', 1, $3 from items where id = $1 returning id`,
      [source.item, goal.id, env.clock.now()],
    );
    await env.db.query('update items set material_id = $2 where id = $1', [
      source.item,
      material.id,
    ]);
    generatedTopic = 'Brüche kürzen';
    const context = await generate({ kind: 'test', goal_id: goal.id, subject: null });
    expect(context).toContain('LEARNING GAPS');
    expect(context).toContain('"said":"16"');
    expect(context).not.toContain('Geometrie');
    expect(context).not.toContain('falsches Fach');
  });

  it('orders wrong answers by when she gave them, not when she later closed the question', async () => {
    for (const [n, said] of ['neuester Fehler', 'mittlerer Fehler', 'ältester Fehler'].entries()) {
      const row = await seed('Brüche', { said });
      await env.db.query('update practice_turns set created_at = $2 where session_id = $1', [
        row.session,
        new Date(env.clock.now().getTime() - n * 60_000),
      ]);
    }
    const context = await generate();
    expect(context).toContain('neuester Fehler');
    expect(context).toContain('mittlerer Fehler');
    expect(context).not.toContain('ältester Fehler');
  });

  it('restricts a follow-up to its source topics and keeps typed homework unchanged', async () => {
    const source = await seed('Brüche kürzen', { said: '16' });
    await seed('Geometrie', { said: '37' });
    const context = await generate({ from_session_id: source.session });
    expect(context).toContain('LEARNING GAPS');
    expect(context).not.toContain('Geometrie');
    // The model's output is deliberately unchanged; homework filters it to these exact tasks.
    expect(await generate({ kind: 'help', text: '1 + 2; 2 + 2; 3 + 2' })).not.toContain(
      'LEARNING GAPS',
    );
  });

  it('caps history at 480 characters and picks deterministically with a tied app clock', async () => {
    for (let i = 0; i < 8; i++) {
      await seed(`Thema ${i} ${'x'.repeat(65)}`, {
        said: 'y'.repeat(4000),
        prompt: 'z'.repeat(1000),
      });
    }
    const first = await generate();
    const block = first.split('LEARNING GAPS')[1]?.split("LEARNER'S TEXT:")[0]?.trimEnd();
    expect(block).toBeDefined();
    expect(`LEARNING GAPS${block}`.length).toBeLessThanOrEqual(480);
    expect(first).toContain('Thema 7');
    expect(first).not.toContain('Thema 0');
    const second = await generate();
    expect(second.split('LEARNING GAPS')[1]).toBe(first.split('LEARNING GAPS')[1]);
  });
});
