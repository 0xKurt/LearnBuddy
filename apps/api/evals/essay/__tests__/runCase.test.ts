// One case of the essay eval through the real API on a real Postgres, the model scripted (issue
// #258): the runner sends the case's text as the app does, reads back Buddy's feedback, and
// scores it against the expectation — the same path `run.ts` takes with the live model.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ESSAY_POINTS } from '../../../src/modules/practice/essay.js';
import { testDatabaseAvailable } from '../../../src/testing/database.js';
import {
  createTestEnv,
  onboard,
  type Learner,
  type TestEnv,
} from '../../../src/testing/harness.js';
import { ESSAY_CASES } from '../cases.js';
import { runCase } from '../runCase.js';
import { pointsOf } from '../score.js';

const dbReady = await testDatabaseAvailable();

/** An analysis whose introduction holds and whose quote has a line that exists. */
const c = ESSAY_CASES.find(
  (x) => x.type === 'analyse' && x.expected.intro === 'met' && x.expected.quotes === 'met',
)!;
/** The first sentence of each paragraph: whole words, as a model quotes them. */
const sentences = c.text.split('\n').map((p) => p.split('. ')[0]!);
const first = sentences[0]!;

describe.skipIf(!dbReady)('the essay eval runner (#258)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-15T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-03-10' });
  });
  afterEach(() => env.closeChecked());

  it('sends the text the way the app does and scores the feedback that comes back', async () => {
    // Buddy finds the introduction (quoted from her first paragraph) and nothing else.
    env.llm.script('tutor', {
      json: {
        elements: ESSAY_POINTS.analyse.map((_, i) => ({
          element: `r${i + 1}`,
          met: i === 0,
          quote: i === 0 ? first : '',
          verbs: [],
        })),
        places: [0, 1, 2].map((i) => ({ quote: sentences[i]!, better: 'Mehr.' })),
      },
    });
    const r = await runCase(env, l, c);
    expect(r.error).toBeNull();
    expect(r.safeguarded).toBe(false);
    const sent = JSON.stringify(env.llm.callsFor('tutor')[0]);
    expect(sent).toContain('REQUIRED ELEMENTS');
    expect(sent).toContain(c.passage!.lines[0]!);
    const rows = pointsOf(r);
    expect(r.feedback?.places).toHaveLength(3);
    expect(rows[0]).toMatchObject({ point: 'intro', got: 'met', expected: 'met', agree: true });
    // The tense element is code's: no verb listed, so it holds whatever the model said of it.
    expect(rows.find((x) => x.point === 'tense')?.got).toBe('met');
    expect(rows.find((x) => x.point === 'quotes')).toMatchObject({ got: 'open', agree: false });
  });

  it('counts a model outage as no feedback, never as agreement', async () => {
    env.llm.script('tutor', { json: { elements: [], places: [] } });
    const r = await runCase(env, l, c);
    expect(r.feedback).toBeNull();
    expect(r.error).not.toBeNull();
    expect(pointsOf(r).some((x) => x.agree)).toBe(false);
  });
});
