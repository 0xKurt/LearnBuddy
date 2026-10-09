// The request's stopwatch (issue #447): milliseconds since the request arrived, each
// milestone once, in the order it was reached — and nothing in the line but the route
// pattern and the numbers.

import { describe, expect, it } from 'vitest';

import { Timeline } from '../timing.js';

/** A stopwatch whose time the test sets. */
function stopwatch(start: number) {
  let at = start;
  return { elapsed: () => at, to: (ms: number) => (at = ms) };
}

describe('Timeline', () => {
  it('counts from the moment the request arrived, rounded to whole milliseconds', () => {
    const clock = stopwatch(10_000);
    const t = new Timeline(clock.elapsed);
    clock.to(10_061.4);
    t.mark('auth');
    clock.to(10_074.6);
    t.mark('start');
    clock.to(12_012);
    t.mark('first');
    clock.to(12_493);
    t.mark('done');
    expect(t.line('POST /v1/buddy/messages')).toBe(
      '[timing] POST /v1/buddy/messages auth=61 start=75 first=2012 done=2493',
    );
  });

  it('keeps the first time a milestone was reached', () => {
    const clock = stopwatch(0);
    const t = new Timeline(clock.elapsed);
    clock.to(5);
    t.mark('first');
    clock.to(900);
    t.mark('first');
    expect(t.line('POST /v1/voice/transcribe')).toBe('[timing] POST /v1/voice/transcribe first=5');
  });

  it('lists only what was reached, in that order', () => {
    const clock = stopwatch(0);
    const t = new Timeline(clock.elapsed);
    clock.to(3);
    t.mark('start');
    clock.to(40);
    t.mark('error');
    expect(t.line('POST /v1/practice/sessions/:id/speak')).toBe(
      '[timing] POST /v1/practice/sessions/:id/speak start=3 error=40',
    );
  });
});
