// The walkthrough's safeguarding scenario (testing/scenarios/safeguarding.ts, #599 correction):
// the scripted model sets `concern`, and what she reads is the server's fixed help answer
// (CLAUDE.md rule 18) — in the chat for the written sentence, and for the fake microphone's one
// sentence when the learner is the scenario's own. Without this no browser run could walk the
// answer whose phone number was cut on the conversation screen.
// requires live verification in Claude Code session (needs a running Postgres)

import type { SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { safeguardingText } from '../i18n/safeguarding.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { DISTRESS_NAME, DISTRESS_TEXT } from '../testing/scenarios/safeguarding.js';
import { scriptWalkthrough } from '../testing/scenarios/walkthrough.js';

const dbReady = await testDatabaseAvailable();

const HELP = safeguardingText('de', true, 'concern');
/** What the fake microphone "says" on the conversation screen (scenarios/roleplay.ts). */
const SPOKEN = 'Was steht diese Woche an?';

describe.skipIf(!dbReady)('the scripted safeguarding scenario', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-13T08:00:00Z' });
    scriptWalkthrough(env.llm);
  });
  afterAll(async () => {
    await env?.close();
  });

  const child = (name: string) =>
    onboard(env, { relation: 'child', name, birthDate: '2014-02-10' });
  async function answerTo(l: Learner, text: string): Promise<string> {
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text,
    });
    expect(sent.status).toBe(200);
    return sent.body.home.thread.filter((m) => m.role === 'buddy').at(-1)?.text ?? '';
  }

  it('answers the written sentence with the fixed help answer and its number', async () => {
    const answer = await answerTo(await child('Lena'), DISTRESS_TEXT);
    expect(answer).toBe(HELP);
    expect(answer).toContain('116 111');
  });

  it('answers the microphone’s sentence with it for the scenario’s learner only', async () => {
    expect(await answerTo(await child(DISTRESS_NAME), SPOKEN)).toBe(HELP);
    expect(await answerTo(await child('Lena'), SPOKEN)).toBe(
      'Diese Woche steht noch nichts an – magst du etwas üben?',
    );
  });
});
