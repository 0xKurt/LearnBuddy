// What a model request may carry only once (issue #284, docs/architecture.md §Model calls).
//
// Recherche 2 of #279 found the same bytes going out more than once: the page photos (extraction
// and figures), the sheet's text (explain and every tutor call) and the 22-day list of `## Now`.
// Measured on the request (evals/requests/measure.ts), each of them is sent ONCE per request —
// the repetition is across calls, each of which is a separate, stateless task that needs that
// input (decisions in §Model calls). This pins exactly that line: inside one request nothing is
// sent twice, and no call besides the two that look at the pages carries a photo. A change that
// puts a page, the sheet or the day list into a request a second time fails here.
// requires live verification in Claude Code session (needs a running Postgres; model scripted)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { playSheetJourney, requestFacts, type JourneyResult } from '../testing/request-flow.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('nothing goes out twice in one request (issue #284)', () => {
  let env: TestEnv;
  let lena: Learner;
  let journey: JourneyResult;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T12:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    journey = await playSheetJourney(env, lena);
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

  it('plays the whole journey: every call type of a photographed sheet', () => {
    expect(env.llm.calls.map((c) => c.purpose)).toEqual([
      'extraction',
      'figures',
      'buddy_check',
      'explain',
      'tutor',
      'tutor',
      'tutor',
      'tutor',
      'buddy_turn',
    ]);
  });

  it('a page photo appears once in each request that looks at the pages, and in no other', () => {
    expect(journey.pagesBase64).toHaveLength(2);
    expect(journey.pagesBase64[0]).not.toBe(journey.pagesBase64[1]);
    for (const req of env.llm.calls) {
      const f = requestFacts(req, journey);
      if (req.purpose === 'extraction' || req.purpose === 'figures') {
        // Every page exactly once, and nothing else attached.
        expect({ purpose: f.purpose, pages: f.pageCopies, images: f.images }).toEqual({
          purpose: req.purpose,
          pages: [1, 1],
          images: 2,
        });
      } else {
        expect({ purpose: f.purpose, images: f.images }).toEqual({
          purpose: req.purpose,
          images: 0,
        });
      }
    }
  });

  it("the sheet's text appears once in each request grounded in it, and in no other", () => {
    for (const req of env.llm.calls) {
      const f = requestFacts(req, journey);
      const grounded = req.purpose === 'explain' || req.purpose === 'tutor';
      expect({ purpose: f.purpose, sheet: f.sheetTextCopies }).toEqual({
        purpose: req.purpose,
        sheet: grounded ? 1 : 0,
      });
    }
    // In the tutor it stands in the first message only — never again in the history.
    for (const req of env.llm.callsFor('tutor')) {
      const withSheet = req.contents.filter((m) =>
        m.parts.some((p) => 'text' in p && p.text.includes('STUDY MATERIAL:')),
      );
      expect(withSheet).toEqual([req.contents[0]]);
    }
  });

  it('the day list of `## Now` appears once in each Buddy request, and in no other', () => {
    for (const req of env.llm.calls) {
      const f = requestFacts(req, journey);
      const buddy = req.purpose === 'buddy_turn' || req.purpose === 'buddy_check';
      expect({ purpose: f.purpose, days: f.dayListCopies }).toEqual({
        purpose: req.purpose,
        days: buddy ? 1 : 0,
      });
    }
  });
});
