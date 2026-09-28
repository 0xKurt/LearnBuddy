// Pages go up while she is still taking them (issue #56): the reservation is made with the
// first page and grows with every further one, so "Senden" has only the submit left.
// What must stay true: a reservation nobody asked to send is not a sheet — the home says
// nothing about it, Buddy's context counts no material, the library does not list it
// (CLAUDE.md rule 5). Only "Senden" (`sending`) makes it pages on their way.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, LibraryView, MaterialView } from '@learnbuddy/shared-types/contracts';
import { randomUUID as uuid } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Created = { material: MaterialView; uploads: Array<{ position: number; path: string }> };

async function reserve(
  l: Learner,
  requestId: string,
  mimes: string[],
  sending = false,
): Promise<Created> {
  const res = await l.api.post<Created>('/materials', {
    client_request_id: requestId,
    photo_mimes: mimes,
    sending,
  });
  expect(res.status).toBe(201);
  return res.body;
}

describe.skipIf(!dbReady)('pages uploaded while she is still capturing', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-29T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('grows the same sheet page by page and stays silent until she sends', async () => {
    const requestId = uuid();
    // Page 1 is ready: reserved and uploaded while she takes the next one.
    const first = await reserve(l, requestId, ['image/jpeg']);
    expect(first.uploads).toHaveLength(1);
    env.storage.put(first.uploads[0]!.path);

    // Nothing is claimed yet: not on the home, not in the library, not in Buddy's context.
    expect((await l.api.get<BuddyHome>('/buddy')).body.now).toBeNull();
    const quiet = (await l.api.get<LibraryView>('/materials')).body;
    expect([...quiet.unsorted, ...quiet.subjects.flatMap((s) => s.materials)]).toEqual([]);

    // Page 2 and 3 join the same sheet — the same material, one slot each.
    const grown = await reserve(l, requestId, ['image/jpeg', 'image/jpeg', 'application/pdf']);
    expect(grown.material.id).toBe(first.material.id);
    expect(grown.uploads.map((u) => u.position)).toEqual([0, 1, 2]);
    expect(grown.uploads[2]!.path.endsWith('.pdf')).toBe(true);
    for (const u of grown.uploads) env.storage.put(u.path);
    const rows = await env.db.query<{ n: string }>(
      `select count(*)::text as n from material_photos where material_id = $1`,
      [first.material.id],
    );
    expect(rows[0]?.n).toBe('3');

    // "Senden": now the home says the pages are on their way.
    await reserve(l, requestId, ['image/jpeg', 'image/jpeg', 'application/pdf'], true);
    expect((await l.api.get<BuddyHome>('/buddy')).body.now).toMatchObject({
      type: 'material_processing',
      status: 'awaiting_upload',
      stage: 'sending',
    });
  });

  it('never shrinks a sheet: fewer pages than reserved leave the slots alone', async () => {
    const requestId = uuid();
    const three = await reserve(l, requestId, ['image/jpeg', 'image/jpeg', 'image/jpeg']);
    const fewer = await reserve(l, requestId, ['image/jpeg']);
    expect(fewer.material.id).toBe(three.material.id);
    const rows = await env.db.query<{ n: string }>(
      `select count(*)::text as n from material_photos where material_id = $1`,
      [three.material.id],
    );
    // The app gives such a reservation up and starts a new one; the API invents nothing.
    expect(rows[0]?.n).toBe('3');
  });

  it('does not take new pages once the sheet is being read', async () => {
    const requestId = uuid();
    const created = await reserve(l, requestId, ['image/jpeg'], true);
    env.storage.put(created.uploads[0]!.path);
    env.llm.script('extraction', {
      json: {
        usable: true,
        title: 'Blatt',
        subject: { name: 'Mathe', kind: 'math' },
        pages: [],
        items: [],
      },
    });
    await l.api.post(`/materials/${created.material.id}/submit`);
    const after = await reserve(l, requestId, ['image/jpeg', 'image/jpeg']);
    expect(after.material.id).toBe(created.material.id);
    expect(after.material.status).not.toBe('awaiting_upload');
    const rows = await env.db.query<{ n: string }>(
      `select count(*)::text as n from material_photos where material_id = $1`,
      [created.material.id],
    );
    expect(rows[0]?.n).toBe('1');
  });
});
