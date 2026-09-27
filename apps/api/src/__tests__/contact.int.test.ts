// Contact promises (CLAUDE.md rule 6; audit I-10, N-3): Buddy can only reduce contact, in-app
// messages count, an agreed reminder never vanishes, and a reminder keeps its subject.
// docs/architecture.md §Proactivity, §Delivery.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  enableContact,
  onboard,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-c000-${(++seq).toString(16).padStart(12, '0')}`;

async function send(l: Learner, text: string, id = uuid()) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: id,
    text,
  });
  return { ...res, id };
}

const reply = (text: string, actions: unknown[] = []) => ({
  json: { concern: false, reply: text, options: null, actions },
});

describe.skipIf(!dbReady)('contact promises', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('a child cannot undo "fewer messages" without the adult (rule 6)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    await enableContact(env, l.learnerId, { max_per_week: 4 });
    env.llm.script(
      'buddy_turn',
      reply('Okay, ich schreibe dir seltener.', [
        {
          tool: 'set_contact',
          args: {
            preferred_start: null,
            preferred_end: null,
            quiet_start: null,
            avoid_weekdays: null,
            pause: null,
            fewer: true,
            quote: 'schreib mir weniger',
          },
        },
      ]),
    );
    const res = await send(l, 'Bitte schreib mir weniger');
    expect(res.body.status).toBe('done');
    const card = res.body.home.thread.flatMap((m) => m.actions)[0]!;
    expect(card.summary).toMatchObject({ tool: 'set_contact', max_per_week: 2 });
    // Not offered to her …
    expect(card.undoable).toBe(false);
    // … and refused if she tries anyway.
    const denied = await l.api.post<{ error: { code: string } }>(`/buddy/actions/${card.id}/undo`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('admin_required');
    const settings = await l.api.get<{ max_per_week: number }>('/buddy/settings');
    expect(settings.body.max_per_week).toBe(2);
    // The adult can.
    const session = await l.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '4711',
    });
    const parent = l.api.with({ 'x-admin-token': session.body.admin_token });
    const undone = await parent.post<BuddyHome>(`/buddy/actions/${card.id}/undo`);
    expect(undone.status).toBe(200);
    expect((await l.api.get<{ max_per_week: number }>('/buddy/settings')).body.max_per_week).toBe(
      4,
    );
  });
});
