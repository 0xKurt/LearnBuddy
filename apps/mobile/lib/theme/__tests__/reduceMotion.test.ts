// Reduce motion means "replace movement with a cross-fade", not "show nothing moving at
// all" (issue #126, WCAG 2.3.3). The file's own comment promised that for months while the
// code switched the animation off entirely.
//
// What is checked here is the whole decision `enter.ts` acts on, both halves of it: which
// builder it reaches for (`moves` — `FadeInDown` carries a `translateY`, `FadeIn` carries no
// transform at all) and which reduce-motion policy it hangs on that builder (`fade` —
// `always` is `ReduceMotion.Never`, `system` is `ReduceMotion.System`). The bug was in the
// second half, and the second half had no test.
//
// `enter.ts` itself cannot be imported here: it reaches for `Platform`, and react-native's
// Flow source does not parse under this runner. It is kept to a straight translation of these
// answers for that reason.

import { describe, expect, it } from 'vitest';

import { enterPlan, fadePolicy, sharedEntrance } from '../reduceMotion.js';

describe('how something enters', () => {
  it('rises and fades on a phone with motion allowed', () => {
    for (const os of ['ios', 'android'])
      expect(enterPlan(false, os)).toEqual({
        moves: true,
        fade: 'always',
      });
  });

  it('fades in place when the system asks for less motion — and still fades', () => {
    for (const os of ['ios', 'android']) {
      const plan = enterPlan(true, os);
      // Nothing moves …
      expect(plan.moves).toBe(false);
      // … and the fade is not the thing that gets dropped. This is issue #126 in one line:
      // `system` here would hand Reanimated a `FadeIn` it switches off, and the element
      // would appear in a single frame instead of fading.
      expect(plan.fade).toBe('always');
      expect(plan.fade).not.toBe('system');
    }
  });

  it('never rises on the web, whatever the setting', () => {
    // Reanimated 4.1 pins a web element with custom initial values to an absolute
    // position once the animation ends.
    expect(enterPlan(false, 'web').moves).toBe(false);
    expect(enterPlan(true, 'web').moves).toBe(false);
  });
});

describe('who decides whether a cross-fade plays', () => {
  it('leaves it to the system only on the web', () => {
    expect(fadePolicy('web')).toBe('system');
  });

  it('always plays it on a phone — the setting may take the movement, not the fade', () => {
    for (const os of ['ios', 'android']) expect(fadePolicy(os)).toBe('always');
  });

  it('is the same answer whether or not the element also moves', () => {
    // `fadeIn`/`fadeOut` ask `fadePolicy` directly, `riseIn` gets it inside the plan; a
    // chip that only fades must not be treated differently from one that rises.
    for (const os of ['ios', 'android', 'web'])
      for (const reduced of [false, true]) expect(enterPlan(reduced, os).fade).toBe(fadePolicy(os));
  });
});

describe('an entrance driven by a shared value (<Rise>, <SlideIn>, <Appear>, the sheet)', () => {
  it('drops the movement under reduce motion and keeps the fade on a phone', () => {
    for (const os of ['ios', 'android']) {
      expect(sharedEntrance(true, os)).toEqual({ moves: false, fade: 'always' });
      expect(sharedEntrance(false, os)).toEqual({ moves: true, fade: 'always' });
    }
  });

  it('may move on the web — the layout-animation bug does not reach shared values', () => {
    expect(sharedEntrance(false, 'web').moves).toBe(true);
    expect(sharedEntrance(true, 'web').moves).toBe(false);
  });

  it('asks the same fade policy as a layout animation, so the two kinds cannot drift apart', () => {
    for (const os of ['ios', 'android', 'web'])
      for (const reduced of [false, true])
        expect(sharedEntrance(reduced, os).fade).toBe(enterPlan(reduced, os).fade);
  });
});
