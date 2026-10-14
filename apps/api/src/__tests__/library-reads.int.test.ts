// "Dein Material" asks the database once in parallel, not four times in a row (#717, #637): its
// four reads (sheets, subjects, exercises, topics) do not depend on one another.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Db, Row } from '../lib/db.js';
import { libraryView } from '../modules/materials/library.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
/** A far database: every round trip takes this long. */
const DISTANCE_MS = 40;

describe.skipIf(!dbReady)('the library’s reads', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-14T13:30:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => env.close());

  it('wait for one round trip, not four', async () => {
    const far = async <T>(run: () => Promise<T>): Promise<T> => {
      await new Promise((r) => setTimeout(r, DISTANCE_MS));
      return run();
    };
    const db: Db = {
      query: <R extends Row = Row>(t: string, p?: readonly unknown[]) =>
        far(() => env.db.query<R>(t, p)),
      one: <R extends Row = Row>(t: string, p?: readonly unknown[]) =>
        far(() => env.db.one<R>(t, p)),
      maybeOne: <R extends Row = Row>(t: string, p?: readonly unknown[]) =>
        far(() => env.db.maybeOne<R>(t, p)),
      tx: (fn) => env.db.tx(fn),
    };
    const near = await libraryView(env.db, l.learnerId);
    const t0 = performance.now();
    const view = await libraryView(db, l.learnerId);
    const ms = performance.now() - t0;
    expect(view).toEqual(near);
    expect(ms).toBeLessThan(DISTANCE_MS * 2.5);
  });
});
