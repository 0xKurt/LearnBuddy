// The home is one picture of one moment: its parts are read by separate queries, and a
// job that commits between them must not give a card from before it next to "nothing is
// working" from after it. The app polls closely only while something is working — such a
// mixed answer left "noch 1 Aufgabe" on the home after the page photographed again had
// joined the help session (web walkthrough, tour.spec). docs/architecture.md §Home.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { BuddyHome, MaterialView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Db, Row } from '../lib/db.js';
import { buildHome } from '../modules/buddy/home.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (prompt: string, answer: string) => ({
  kind: 'short',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Wortarten',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const sheet = (pages: unknown, items: unknown[]) => ({
  is_learning_material: true,
  readable: true,
  pages,
  title: 'Hausaufgabe Wortarten',
  subject: { name: 'Deutsch', kind: 'german' },
  extracted_text: 'Nomen und Verben.',
  items,
});

/** The same database, with `before` awaited ahead of every statement (also inside transactions). */
function hooked(db: Db, before: (text: string) => Promise<void>): Db {
  return {
    async query<R extends Row = Row>(text: string, params?: readonly unknown[]): Promise<R[]> {
      await before(text);
      return db.query<R>(text, params);
    },
    async one<R extends Row = Row>(text: string, params?: readonly unknown[]): Promise<R> {
      await before(text);
      return db.one<R>(text, params);
    },
    async maybeOne<R extends Row = Row>(
      text: string,
      params?: readonly unknown[],
    ): Promise<R | null> {
      await before(text);
      return db.maybeOne<R>(text, params);
    },
    tx: <T>(fn: (inner: Db) => Promise<T>) => db.tx((inner) => fn(hooked(inner, before))),
  };
}

describe.skipIf(!dbReady)('home: one snapshot', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
    env.llm.byDefault('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [] });
  });

  async function upload(body: Record<string, unknown>): Promise<string> {
    const created = await lena.api.post<{
      material: MaterialView;
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], ...body });
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    expect((await lena.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    return created.body.material.id;
  }

  it('a page that joins the help session while the home is read: before or after, never both', async () => {
    // Homework with a cut-off second page: a help session with its two tasks.
    env.llm.script('extraction', {
      json: sheet(
        [
          { page: 1, read: 'all', problem: null },
          { page: 2, read: 'part', problem: 'cut_off' },
        ],
        [item('Ist „Hund“ ein Nomen?', 'ja'), item('Ist „laufen“ ein Verb?', 'ja')],
      ),
    });
    const hw = await upload({ purpose: 'homework', photo_mimes: ['image/jpeg', 'image/jpeg'] });
    await env.flushBackground();

    // The page again: its reading waits until the home is half read.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    env.llm.script('extraction', async () => {
      await gate;
      return sheet(
        [{ page: 1, read: 'all', problem: null }],
        [item('Ist „schnell“ ein Adjektiv?', 'ja')],
      );
    });
    await upload({ completes: hw });

    // Right before the home asks "is anything working?", the page is read and joins.
    let joined = false;
    const db = hooked(env.db, async (text) => {
      if (joined || !text.includes("kind = 'extract_material'")) return;
      joined = true;
      release();
      await env.flushBackground();
    });
    const home: BuddyHome = await buildHome(
      { ...env.deps, db },
      { id: lena.learnerId, display_name: 'Lena', isMinor: true },
    );
    expect(joined).toBe(true);

    // Either the moment before (2 tasks, still reading — the app keeps polling closely)
    // or the moment after (3 tasks); never the old card with nothing working.
    expect(home.now).toMatchObject({ type: 'resume_practice', mode: 'help' });
    const remaining = home.now?.type === 'resume_practice' ? home.now.remaining : null;
    expect([
      { remaining: 2, working: 'material' },
      { remaining: 3, working: null },
    ]).toContainEqual({ remaining, working: home.working });

    // And the next look shows the joined page.
    const after = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(after.now).toMatchObject({ type: 'resume_practice', remaining: 3 });
    expect(after.working).toBeNull();
  });
});
