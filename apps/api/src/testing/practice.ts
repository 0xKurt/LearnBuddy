// The learning domain's test helpers (issue #107): what a spec of practice needs beyond the core's
// harness (testing/harness.ts). A core copy leaves this file and the specs that use it out.
// requires live verification in Claude Code session (paired with a real Postgres)

import type { SessionView } from '@learnbuddy/shared-types/contracts';

import type { ApiResponse, Learner, TestEnv } from './harness.js';

/**
 * Ends a practice run as the app does. Finishing wakes Buddy to look at it (`session_finished`,
 * one background `buddy_check`); here he plans nothing. The look is awaited, so its model call
 * belongs to the test that caused it instead of landing before or after the model report by
 * chance (issue #323).
 */
export async function finishRun(
  env: TestEnv,
  l: Learner,
  sessionId: string,
): Promise<ApiResponse<SessionView>> {
  env.llm.script('buddy_check', {
    json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
  });
  const res = await l.api.post<SessionView>(`/practice/sessions/${sessionId}/finish`, {});
  await env.flushBackground();
  return res;
}
