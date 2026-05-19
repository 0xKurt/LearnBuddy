// Templates route tests. Doc 04 §POST /templates/:id/practice-run + §PATCH.
//
// Covers: start + finalize a practice run; ownership guards; difficulty-
// adjustment logic (≥90% → +1, <50% → -1, else 0); auth failures.

import { describe, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { createTestDeps, getFake } from '../../test/fake-supabase.js';

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(email = 'parent@example.com') {
  const deps = createTestDeps();
  const app = createApp({ deps });
  const fake = getFake(deps);
  const signup = await app.request('/auth/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'pw123456', locale: 'de', country_code: 'DE' }),
  });
  const { user_id } = (await signup.json()) as { user_id: string; account_id: string };
  const token = fake.authenticate(user_id, email);
  const learnerRes = await app.request('/learners', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      display_name: 'Max',
      birth_date: '2007-01-15',
      grade_level: 10,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'text',
    }),
  });
  const learner = (await learnerRes.json()) as { id: string };
  return { app, deps, fake, token, learnerId: learner.id };
}

function authed(s: Setup) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${s.token}`,
    'x-learner-id': s.learnerId,
  } as Record<string, string>;
}

/** Seed a problem_template row directly into the fake and return its id. */
function seedTemplate(s: Setup): string {
  const templates = s.fake.tables.get('problem_templates') ?? [];
  const id = s.fake.nextId();
  templates.push({
    id,
    learner_id: s.learnerId,
    material_id: s.fake.nextId(),
    template_text: 'Berechne {{a}} + {{b}}',
    params: [
      { name: 'a', type: 'int', min: 1, max: 10 },
      { name: 'b', type: 'int', min: 1, max: 10 },
    ],
    constraints: [],
    solution_expression: 'a + b',
    answer_kind: 'numeric',
    topic: 'Addition',
    difficulty: 1,
    archived_at: null,
    feasible: true,
  });
  s.fake.tables.set('problem_templates', templates);
  return id;
}

describe('GET /templates/:id', () => {
  it('returns the template for the owning learner', async () => {
    const s = await setup();
    const templateId = seedTemplate(s);

    const res = await s.app.request(`/templates/${templateId}`, {
      method: 'GET',
      headers: authed(s),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; topic: string };
    expect(body.id).toBe(templateId);
    expect(body.topic).toBe('Addition');
  });

  it('returns 404 when template belongs to another learner', async () => {
    const owner = await setup('owner@x.com');
    const templateId = seedTemplate(owner);
    const stranger = await setup('stranger@y.com');

    const res = await stranger.app.request(`/templates/${templateId}`, {
      method: 'GET',
      headers: authed(stranger),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /templates/:id/practice-run', () => {
  it('creates a practice_run row and returns 201', async () => {
    const s = await setup();
    const templateId = seedTemplate(s);

    const res = await s.app.request(`/templates/${templateId}/practice-run`, {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ problems_generated: 10 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      template_id: string;
      problems_generated: number;
      problems_correct: number;
    };
    expect(body.template_id).toBe(templateId);
    expect(body.problems_generated).toBe(10);
    expect(body.problems_correct).toBe(0);

    const rows = s.fake.tables.get('practice_runs') ?? [];
    expect(rows.some((r) => r.id === body.id)).toBe(true);
  });

  it('returns 404 when template does not belong to the learner', async () => {
    const owner = await setup('owner@x.com');
    const templateId = seedTemplate(owner);
    const stranger = await setup('stranger@y.com');

    const res = await stranger.app.request(`/templates/${templateId}/practice-run`, {
      method: 'POST',
      headers: authed(stranger),
      body: JSON.stringify({ problems_generated: 5 }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 without a bearer token', async () => {
    const s = await setup();
    const templateId = seedTemplate(s);

    const res = await s.app.request(`/templates/${templateId}/practice-run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-learner-id': s.learnerId },
      body: JSON.stringify({ problems_generated: 10 }),
    });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /templates/:id/practice-run/:run_id', () => {
  /** Helper: start a run and return its id. */
  async function startRun(s: Setup, templateId: string): Promise<string> {
    const res = await s.app.request(`/templates/${templateId}/practice-run`, {
      method: 'POST',
      headers: authed(s),
      body: JSON.stringify({ problems_generated: 10 }),
    });
    const body = (await res.json()) as { id: string };
    return body.id;
  }

  it('finalizes a run and computes difficulty_adjustment = +1 for ≥90% accuracy', async () => {
    const s = await setup();
    const templateId = seedTemplate(s);
    const runId = await startRun(s, templateId);

    const res = await s.app.request(`/templates/${templateId}/practice-run/${runId}`, {
      method: 'PATCH',
      headers: authed(s),
      body: JSON.stringify({
        problems_generated: 10,
        problems_correct: 9,
        avg_time_ms: 4200,
        ended_at: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { difficulty_adjustment: number; problems_correct: number };
    expect(body.problems_correct).toBe(9);
    expect(body.difficulty_adjustment).toBe(1);
  });

  it('computes difficulty_adjustment = -1 for <50% accuracy', async () => {
    const s = await setup();
    const templateId = seedTemplate(s);
    const runId = await startRun(s, templateId);

    const res = await s.app.request(`/templates/${templateId}/practice-run/${runId}`, {
      method: 'PATCH',
      headers: authed(s),
      body: JSON.stringify({
        problems_generated: 10,
        problems_correct: 4,
        ended_at: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { difficulty_adjustment: number };
    expect(body.difficulty_adjustment).toBe(-1);
  });

  it('computes difficulty_adjustment = 0 for 50–89% accuracy', async () => {
    const s = await setup();
    const templateId = seedTemplate(s);
    const runId = await startRun(s, templateId);

    const res = await s.app.request(`/templates/${templateId}/practice-run/${runId}`, {
      method: 'PATCH',
      headers: authed(s),
      body: JSON.stringify({
        problems_generated: 10,
        problems_correct: 7,
        ended_at: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { difficulty_adjustment: number };
    expect(body.difficulty_adjustment).toBe(0);
  });

  it('returns 404 when the run_id does not exist', async () => {
    const s = await setup();
    const templateId = seedTemplate(s);
    const fakeRunId = s.fake.nextId();

    const res = await s.app.request(`/templates/${templateId}/practice-run/${fakeRunId}`, {
      method: 'PATCH',
      headers: authed(s),
      body: JSON.stringify({
        problems_generated: 5,
        problems_correct: 3,
        ended_at: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /templates/:id', () => {
  it('soft-archives a template the learner owns', async () => {
    const s = await setup();
    const templateId = seedTemplate(s);

    const res = await s.app.request(`/templates/${templateId}`, {
      method: 'DELETE',
      headers: authed(s),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; archived: boolean };
    expect(body.id).toBe(templateId);
    expect(body.archived).toBe(true);

    const row = s.fake.tables.get('problem_templates')?.find((r) => r.id === templateId);
    expect(row?.archived_at).toBeTruthy();
  });

  it('returns 404 when template belongs to another learner', async () => {
    const owner = await setup('owner@x.com');
    const templateId = seedTemplate(owner);
    const stranger = await setup('stranger@y.com');

    const res = await stranger.app.request(`/templates/${templateId}`, {
      method: 'DELETE',
      headers: authed(stranger),
    });
    expect(res.status).toBe(404);
  });
});
