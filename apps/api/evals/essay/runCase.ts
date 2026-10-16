// One case of the essay eval through the real API (issue #258): her sheet with the essay task,
// a practice session on it, her text sent as the answer — the same path the app takes, the same
// one model call (`practice/essay.ts`). What comes back is handed to `score.ts`.
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';

import { safeguardingText } from '../../src/i18n/safeguarding.js';
import { essayItem } from '../../src/modules/practice/essay.js';
import { insertItems } from '../../src/modules/practice/items.js';
import type { Learner, TestEnv } from '../../src/testing/harness.js';
import type { EssayCase } from './cases.js';
import type { CaseResult } from './score.js';

export async function runCase(env: TestEnv, l: Learner, c: EssayCase): Promise<CaseResult> {
  const m = await env.db.one<{ id: string }>(
    `insert into materials (learner_id, client_request_id, status, photo_count, title, extracted_text, created_at)
     values ($1, gen_random_uuid(), 'ready', 1, $2, $3, $4) returning id`,
    [l.learnerId, c.topic, c.passage?.lines.join('\n') ?? c.prompt, env.clock.now()],
  );
  const item = essayItem(
    { prompt: c.prompt, type: c.type, topic: c.topic, difficulty: 3, passage: c.passage },
    'de',
  );
  const [itemId] = await insertItems(
    env.db,
    { learnerId: l.learnerId, materialId: m.id, subjectId: null, origin: 'material' },
    [item],
  );
  const s = await l.api.post<SessionView>('/practice/sessions', {
    material_id: m.id,
    mode: 'practice',
  });
  if (s.status !== 201) return failed(c, `session ${s.status}`);
  const res = await l.api.post<AnswerResponse>(`/practice/sessions/${s.body.id}/answer`, {
    client_turn_id: crypto.randomUUID(),
    item_id: itemId,
    text: c.text,
  });
  if (res.status !== 200) return failed(c, `answer ${res.status}`);
  const feedback = res.body.reply.essay ?? null;
  // The fixed help answer, in any of its forms (by age, concern or the provider's filter).
  const help = [true, false].flatMap((minor) =>
    (['concern', 'blocked'] as const).map((kind) => safeguardingText('de', minor, kind)),
  );
  const safeguarded = feedback === null && help.includes(res.body.reply.text);
  return {
    case: c,
    feedback,
    safeguarded,
    error: feedback === null && !safeguarded ? res.body.reply.text : null,
  };
}

const failed = (c: EssayCase, error: string): CaseResult => ({
  case: c,
  feedback: null,
  safeguarded: false,
  error,
});
