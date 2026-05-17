// Learner content CRUD: subjects + folders + materials upload flow.

import { expect, test } from '@playwright/test';

import {
  authedHeaders,
  createLearner,
  createSubject,
  signUpAccount,
  uniqueEmail,
} from './helpers.js';

test('subject CRUD + schedule-summary', async ({ request }) => {
  const acct = await signUpAccount(request, uniqueEmail('content'));
  const learner = await createLearner(request, acct);

  // List empty subjects.
  const empty = await request.get(`/learners/${learner.learnerId}/subjects`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  expect(empty.status()).toBe(200);
  expect(await empty.json()).toEqual([]);

  // Create.
  const subjectId = await createSubject(request, learner, 'Bio');

  // List shows the new subject.
  const list = await request.get(`/learners/${learner.learnerId}/subjects`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  const listBody = (await list.json()) as Array<{ id: string; name: string }>;
  expect(listBody).toHaveLength(1);
  expect(listBody[0]?.name).toBe('Bio');

  // Patch.
  const patch = await request.patch(`/subjects/${subjectId}`, {
    headers: authedHeaders(learner, learner.learnerId),
    data: { name: 'Biologie' },
  });
  expect(patch.status()).toBe(200);

  // Folder under the subject — pick a date inside the 7-day "upcoming" window
  // the route uses (Doc 04 §schedule-summary).
  const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const folder = await request.post(`/subjects/${subjectId}/folders`, {
    headers: authedHeaders(learner, learner.learnerId),
    data: { name: 'Zellen', scheduled_for: inThreeDays },
  });
  expect(folder.status()).toBe(201);
  const folderBody = (await folder.json()) as { id: string };

  // schedule-summary picks up the scheduled test.
  const schedule = await request.get(`/learners/${learner.learnerId}/schedule-summary`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  expect(schedule.status()).toBe(200);
  const schedBody = (await schedule.json()) as {
    upcoming_tests: Array<{ folder_id: string; days_until: number }>;
  };
  expect(schedBody.upcoming_tests.length).toBeGreaterThanOrEqual(1);
  expect(schedBody.upcoming_tests[0]?.folder_id).toBe(folderBody.id);

  // Soft-archive folder.
  const del = await request.delete(`/folders/${folderBody.id}`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  expect(del.status()).toBeLessThan(300);
});

test('cross-account isolation: stranger gets 404 on owner subject', async ({ request }) => {
  const owner = await signUpAccount(request, uniqueEmail('owner'));
  const ownerL = await createLearner(request, owner);
  const subjectId = await createSubject(request, ownerL);

  const stranger = await signUpAccount(request, uniqueEmail('stranger'));
  const strangerL = await createLearner(request, stranger);

  // Stranger trying to patch owner's subject must 404 (not 403 — Doc 04
  // §security explicitly says "don't leak the id exists").
  const r = await request.patch(`/subjects/${subjectId}`, {
    headers: authedHeaders(strangerL, strangerL.learnerId),
    data: { name: 'pwned' },
  });
  expect(r.status()).toBe(404);
});

test('materials reserve → finalize → SSE done event', async ({ request }) => {
  const acct = await signUpAccount(request, uniqueEmail('material'));
  const learner = await createLearner(request, acct);
  const subjectId = await createSubject(request, learner);

  // Reserve.
  const reserve = await request.post('/materials/upload-url', {
    headers: authedHeaders(learner, learner.learnerId),
    data: { subject_id: subjectId, folder_id: null, photo_count: 2, mime_type: 'image/jpeg' },
  });
  expect(reserve.status()).toBe(200);
  const reserveBody = (await reserve.json()) as {
    material_id: string;
    uploads: Array<{ position: number; signed_url: string; storage_path: string }>;
  };
  expect(reserveBody.uploads).toHaveLength(2);
  expect(reserveBody.uploads[0]?.signed_url).toContain('https://');

  // Finalize (SSE — the fake-LLM returns 3 short items; vision call
  // completes immediately so this is effectively synchronous).
  const finalize = await request.post('/materials', {
    headers: authedHeaders(learner, learner.learnerId),
    data: {
      material_id: reserveBody.material_id,
      subject_id: subjectId,
      folder_id: null,
      title: 'Bruchrechnung',
      locale: 'de',
      target_item_count: 10,
      client_quality_scores: [
        { position: 1, blur: 142, brightness: 138, tilt: 4, width: 1024, height: 768 },
        { position: 2, blur: 98, brightness: 145, tilt: 6, width: 1024, height: 768 },
      ],
    },
  });
  expect(finalize.status()).toBe(200);
  const body = await finalize.text();
  expect(body).toContain('event: phase');
  expect(body).toContain('event: done');

  // The material row + items are persisted.
  const fetched = await request.get(`/materials/${reserveBody.material_id}`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  expect(fetched.status()).toBe(200);
  const fetchedBody = (await fetched.json()) as { id: string; items: unknown[] };
  expect(fetchedBody.id).toBe(reserveBody.material_id);
  expect(fetchedBody.items.length).toBeGreaterThanOrEqual(3);
});

test('material PATCH renames, DELETE soft-archives', async ({ request }) => {
  const acct = await signUpAccount(request, uniqueEmail('rename'));
  const learner = await createLearner(request, acct);
  const subjectId = await createSubject(request, learner);

  // Set up a material.
  const reserve = await request.post('/materials/upload-url', {
    headers: authedHeaders(learner, learner.learnerId),
    data: { subject_id: subjectId, folder_id: null, photo_count: 1, mime_type: 'image/jpeg' },
  });
  const { material_id } = (await reserve.json()) as { material_id: string };
  await request.post('/materials', {
    headers: authedHeaders(learner, learner.learnerId),
    data: {
      material_id,
      subject_id: subjectId,
      folder_id: null,
      locale: 'de',
      target_item_count: 5,
      client_quality_scores: [
        { position: 1, blur: 120, brightness: 140, tilt: 0, width: 800, height: 600 },
      ],
    },
  });

  // PATCH — rename.
  const patch = await request.patch(`/materials/${material_id}`, {
    headers: authedHeaders(learner, learner.learnerId),
    data: { title: 'Mein Material' },
  });
  expect(patch.status()).toBe(200);
  const patchBody = (await patch.json()) as { title: string };
  expect(patchBody.title).toBe('Mein Material');

  // DELETE — soft-archive.
  const del = await request.delete(`/materials/${material_id}`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  expect(del.status()).toBe(200);

  // After archive, GET returns 404 (route filters archived_at IS NULL).
  const after = await request.get(`/materials/${material_id}`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  expect(after.status()).toBe(404);
});
