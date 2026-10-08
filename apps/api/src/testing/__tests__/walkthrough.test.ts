// Guard (issue #350, the open point of #313): every walkthrough spec brings its own scripted
// answers. A queued answer (`ScriptedGateway.script`) goes to whichever spec asks first, so a spec
// run alone — or after a different one — got another spec's answer: modes.spec.ts "learning
// modes" consumed the core loop's tutor reply and failed. Cheap on purpose: no browser, no
// database; `scripts/web-walkthrough-each.sh` runs every walkthrough test alone by hand.

import { describe, expect, it } from 'vitest';

import type { LlmPurpose, LlmRequest } from '../../llm/gateway.js';
import { EXTRACT_SYSTEM, HOMEWORK_SYSTEM } from '../../modules/materials/extract.js';
import { WORK_SYSTEM } from '../../modules/practice/workPhoto.js';
import { SYSTEM as VOICE_SYSTEM } from '../../modules/voice/service.js';
import { ScriptedGateway } from '../fakes.js';
import { DEMO_WORKSHEET } from '../scenarios/core-loop.js';
import { scriptWalkthrough } from '../scenarios/walkthrough.js';

/** The smallest JPEG header that says its size (all `ScriptedGateway.textOf` reads of a photo). */
function jpeg(width: number, height: number): string {
  const bytes = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff];
  bytes.push(width >> 8, width & 0xff, ...new Array<number>(12).fill(0));
  return Buffer.from(bytes).toString('base64');
}

function request(
  purpose: LlmPurpose,
  system: string,
  ...parts: LlmRequest['contents'][number]['parts']
): LlmRequest {
  return {
    purpose,
    tier: 'smart',
    promptVersion: 'test',
    system,
    contents: [{ role: 'user', parts }],
    schema: {},
    maxOutputTokens: 1000,
    temperature: 0,
    timeoutMs: 1000,
  };
}

const sheet = (system: string, width: number, height: number, page = 1, of = 1) =>
  request(
    'extraction',
    system,
    { text: 'LEARNER: 12 years, level school, grade 6, app language de' },
    { text: `Photo ${page} of ${of}:` },
    { inlineData: { mimeType: 'image/jpeg', data: jpeg(width, height) } },
  );

// One request per spec that used to take a queued answer, as the server sends it.
const SAMPLES = {
  // core-loop-*.spec.ts: its long question, answered wrong.
  coreLoopTutor: request('tutor', 'tutor', {
    text: '{"item":{"prompt":"Warum multipliziert man beim Erweitern Zähler und Nenner mit derselben Zahl?"}}\nweiß nicht',
  }),
  // modes.spec.ts: the homework question, "keine Ahnung".
  modesTutor: request('tutor', 'tutor', {
    text: '{"item":{"prompt":"Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt."}}\nkeine Ahnung',
  }),
  // core-loop-*.spec.ts: the drawn worksheet (1600 px on the long side after the app's resize).
  coreLoopSheet: sheet(EXTRACT_SYSTEM, 1280, 1600),
  // tour.spec.ts: homework of two pages, then the cut-off page again.
  tourHomework: request(
    'extraction',
    HOMEWORK_SYSTEM,
    { text: 'Photo 1 of 2:' },
    { inlineData: { mimeType: 'image/jpeg', data: jpeg(800, 1080) } },
    { text: 'Photo 2 of 2:' },
    { inlineData: { mimeType: 'image/jpeg', data: jpeg(800, 1080) } },
  ),
  tourPageAgain: sheet(HOMEWORK_SYSTEM, 800, 1080),
  // tour.spec.ts: one sentence to say.
  tourPronounce: request('pronounce', 'pronounce', {
    text: 'SENTENCE: The weather is nice today.',
  }),
  // work-photo.spec.ts: her working for the equation, photographed (#444) — `transcribe` too.
  workPhoto: request(
    'transcribe',
    WORK_SYSTEM,
    { text: 'QUESTION (context only, never answer it): Löse die Gleichung 2x + 3 = 7.' },
    { inlineData: { mimeType: 'image/jpeg', data: jpeg(1600, 2000) } },
  ),
  // The fake microphone in a conversation, no roleplay running.
  heard: request('transcribe', VOICE_SYSTEM, { text: 'MODE: MESSAGE\nEXPECTED LANGUAGE: de' }),
} as const;

async function answer(llm: ScriptedGateway, req: LlmRequest): Promise<unknown> {
  try {
    return (await llm.generate(req)).json;
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function walkthroughModel(): ScriptedGateway {
  const llm = new ScriptedGateway();
  scriptWalkthrough(llm);
  return llm;
}

// Rules live in module-level books, so the scenarios are scripted once per file.
const llm = walkthroughModel();

describe('the walkthrough model (spec-order independence, #350)', () => {
  it('holds no queued answer: every answer is chosen by what the request says', () => {
    // A queue is exactly what leaked between specs. Use a rule (scenarios/rules.ts, turns.ts).
    expect(llm.pending()).toBe(0);
  });

  it('gives every request the same answer in any order of the specs', async () => {
    const entries = Object.entries(SAMPLES);
    const forward = new Map<string, unknown>();
    for (const [name, req] of entries) forward.set(name, await answer(llm, req));
    const backward = new Map<string, unknown>();
    for (const [name, req] of [...entries].reverse()) backward.set(name, await answer(llm, req));
    for (const [name] of entries) expect(backward.get(name), name).toEqual(forward.get(name));
  });

  it('answers each spec with its own script, not the first one queued', async () => {
    // Run alone, modes.spec.ts got the core loop's "Fast. Denk daran …" here.
    expect(await answer(llm, SAMPLES.modesTutor)).toMatchObject({
      reply: 'Kein Problem! Welche zwei Längen kennst du vom Rechteck?',
    });
    expect(await answer(llm, SAMPLES.coreLoopTutor)).toMatchObject({ verdict: 'incorrect' });
    expect(await answer(llm, SAMPLES.coreLoopSheet)).toEqual(DEMO_WORKSHEET);
    expect(await answer(llm, SAMPLES.tourHomework)).toMatchObject({ title: 'Hausaufgabe Quadrat' });
    expect(await answer(llm, SAMPLES.tourPageAgain)).toMatchObject({
      title: 'Hausaufgabe Rechteck',
    });
    expect(await answer(llm, SAMPLES.tourPronounce)).toMatchObject({ overall: 'almost' });
    expect(await answer(llm, SAMPLES.workPhoto)).toMatchObject({ found: 'working' });
    expect(await answer(llm, SAMPLES.heard)).toEqual({
      heard_speech: true,
      text: 'Was steht diese Woche an?',
    });
  });

  it("reads the tour's sheet as unreadable first and readable when asked again", async () => {
    // Its own turn order, reached only by the tour's photo — the core loop's sheet never shifts it.
    const tourSheet = sheet(EXTRACT_SYSTEM, 800, 1080);
    await answer(llm, SAMPLES.coreLoopSheet);
    expect(await answer(llm, tourSheet)).toMatchObject({ readable: false });
    await answer(llm, SAMPLES.coreLoopSheet);
    expect(await answer(llm, tourSheet)).toMatchObject({ title: 'Nomen und Verben' });
  });

  it('leaves a photo nobody scripted unanswered instead of giving it another spec’s sheet', async () => {
    expect(await answer(llm, sheet(EXTRACT_SYSTEM, 640, 480))).toMatch(/unscripted model call/);
  });
});
