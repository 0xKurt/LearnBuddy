// Session + attempts + summary: the study loop end-to-end.

import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  authedHeaders,
  createLearner,
  createSubject,
  signUpAccount,
  uniqueEmail,
} from './helpers.js';

async function seedMaterialWithItems(
  request: APIRequestContext,
  learner: Awaited<ReturnType<typeof createLearner>>,
  subjectId: string,
): Promise<{ material_id: string; item_ids: string[] }> {
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
  const items = await request.get(`/materials/${material_id}/items`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  const itemsBody = (await items.json()) as { items: Array<{ id: string }> };
  return { material_id, item_ids: itemsBody.items.map((i) => i.id) };
}

test('start session → attempt → summary', async ({ request }) => {
  const acct = await signUpAccount(request, uniqueEmail('session'));
  const learner = await createLearner(request, acct);
  const subjectId = await createSubject(request, learner);
  const { item_ids } = await seedMaterialWithItems(request, learner, subjectId);

  // Start session.
  const start = await request.post('/sessions', {
    headers: authedHeaders(learner, learner.learnerId),
    data: { subject_id: subjectId, test_mode: false, max_items: 10 },
  });
  expect(start.status()).toBe(200);
  const startBody = (await start.json()) as {
    session_id: string;
    items: Array<{ id: string }>;
  };
  expect(startBody.items.length).toBeGreaterThanOrEqual(1);

  // Single local-correct attempt — zero credits.
  const att = await request.post('/attempts', {
    headers: authedHeaders(learner, learner.learnerId),
    data: {
      session_id: startBody.session_id,
      item_id: startBody.items[0]!.id,
      mode: 'text',
      kid_answer: 'OK',
      client_local_verdict: 'correct',
      prior_hints_given: [],
      duration_ms: 1200,
    },
  });
  expect(att.status()).toBe(200);
  const attBody = (await att.json()) as { verdict: string; credits_used: number };
  expect(attBody.verdict).toBe('correct');
  expect(attBody.credits_used).toBe(0);

  // Summary endpoint reflects the attempt.
  const sum = await request.get(`/sessions/${startBody.session_id}/summary`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  expect(sum.status()).toBe(200);
  const sumBody = (await sum.json()) as {
    attempts_count: number;
    secure_now: number;
    still_unsure: number;
  };
  expect(sumBody.attempts_count).toBe(1);
  expect(sumBody.secure_now).toBe(1);
  expect(sumBody.still_unsure).toBe(0);

  // Finish + verify ended_at.
  const finish = await request.patch(`/sessions/${startBody.session_id}/finish`, {
    headers: authedHeaders(learner, learner.learnerId),
  });
  expect(finish.status()).toBe(200);
  const finBody = (await finish.json()) as { ended_at: string | null };
  expect(finBody.ended_at).not.toBeNull();

  expect(item_ids.length).toBeGreaterThan(0);
});

test('attempts/batch bulk-inserts + upserts states', async ({ request }) => {
  const acct = await signUpAccount(request, uniqueEmail('batch'));
  const learner = await createLearner(request, acct);
  const subjectId = await createSubject(request, learner);
  const { item_ids } = await seedMaterialWithItems(request, learner, subjectId);

  const reviewedAt = new Date().toISOString();
  const body = {
    attempts: item_ids.slice(0, 3).map((id, i) => ({
      client_attempt_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      item_id: id,
      mode: 'text' as const,
      kid_answer: 'OK',
      verdict: i === 0 ? 'incorrect' : ('correct' as const),
      evaluated_by: 'local' as const,
      reviewed_at: reviewedAt,
    })),
  };
  const res = await request.post('/attempts/batch', {
    headers: authedHeaders(learner, learner.learnerId),
    data: body,
  });
  expect(res.status()).toBe(200);
  const out = (await res.json()) as { accepted: string[]; rejected: unknown[] };
  expect(out.accepted).toHaveLength(3);
  expect(out.rejected).toHaveLength(0);
});

test('session 401 without bearer', async ({ request }) => {
  const res = await request.post('/sessions', {
    headers: { 'x-learner-id': 'anything' },
    data: { max_items: 5 },
  });
  expect(res.status()).toBe(401);
});

test('summary 404 for stranger session', async ({ request }) => {
  const owner = await signUpAccount(request, uniqueEmail('sum-owner'));
  const ownerL = await createLearner(request, owner);
  const subjectId = await createSubject(request, ownerL);
  await seedMaterialWithItems(request, ownerL, subjectId);
  const start = await request.post('/sessions', {
    headers: authedHeaders(ownerL, ownerL.learnerId),
    data: { subject_id: subjectId, max_items: 5 },
  });
  const { session_id } = (await start.json()) as { session_id: string };

  const stranger = await signUpAccount(request, uniqueEmail('sum-stranger'));
  const strangerL = await createLearner(request, stranger);
  const r = await request.get(`/sessions/${session_id}/summary`, {
    headers: authedHeaders(strangerL, strangerL.learnerId),
  });
  expect(r.status()).toBe(404);
});
