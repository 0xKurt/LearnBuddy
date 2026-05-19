// Problem-template API helpers. Doc 04 §POST /templates/:id/practice-run +
// PATCH /templates/:id/practice-run/:run_id + GET /templates/:id.
//
// The mobile owns variant generation (mathjs substitution against
// template.params) and scoring (lib/eval/local.ts). These calls are purely
// bookkeeping: open a run when the learner starts, finalize when they finish
// so the server can roll forward difficulty_adjustment per Doc 04.

import { ProblemTemplateRow, PracticeRun } from '@learnbuddy/shared-types';

import { api, newIdempotencyKey } from './client.js';

export async function getTemplate(
  learnerId: string,
  templateId: string,
): Promise<ProblemTemplateRow> {
  return api(`/templates/${templateId}`, {
    method: 'GET',
    schema: ProblemTemplateRow,
    learnerId,
  });
}

type StartPracticeRunRequest = { problems_generated: number };

export async function startPracticeRun(
  learnerId: string,
  templateId: string,
  input: StartPracticeRunRequest,
): Promise<PracticeRun> {
  return api(`/templates/${templateId}/practice-run`, {
    method: 'POST',
    body: input,
    schema: PracticeRun,
    learnerId,
    idempotencyKey: newIdempotencyKey(),
  });
}

export type FinalizePracticeRunInput = {
  problems_generated: number;
  problems_correct: number;
  avg_time_ms: number | null;
  ended_at: string;
};

export async function finalizePracticeRun(
  learnerId: string,
  templateId: string,
  runId: string,
  input: FinalizePracticeRunInput,
): Promise<PracticeRun> {
  return api(`/templates/${templateId}/practice-run/${runId}`, {
    method: 'PATCH',
    body: input,
    schema: PracticeRun,
    learnerId,
  });
}
