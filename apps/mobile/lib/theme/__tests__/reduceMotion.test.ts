import { describe, expect, it } from 'vitest';

import { enterPlan, fadePolicy } from '../reduceMotion.js';

describe('how something enters', () => {
  it('rises and fades on a phone with motion allowed', () => {
    for (const os of ['ios', 'android'])
      expect(enterPlan(false, os)).toEqual({
        moves: true,
        fade: 'system',
      });
  });

  it('drops movement and lets the system disable fades under reduced motion', () => {
    for (const os of ['ios', 'android']) {
      const plan = enterPlan(true, os);
      expect(plan.moves).toBe(false);
      expect(plan.fade).toBe('system');
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
  it('leaves it to the system on the web', () => {
    expect(fadePolicy('web')).toBe('system');
  });

  it('lets the system disable fades on phones too', () => {
    for (const os of ['ios', 'android']) expect(fadePolicy(os)).toBe('system');
  });

  it('is the same answer whether or not the element also moves', () => {
    // `fadeIn`/`fadeOut` ask `fadePolicy` directly, `riseIn` gets it inside the plan; a
    // chip that only fades must not be treated differently from one that rises.
    for (const os of ['ios', 'android', 'web'])
      for (const reduced of [false, true]) expect(enterPlan(reduced, os).fade).toBe(fadePolicy(os));
  });
});
