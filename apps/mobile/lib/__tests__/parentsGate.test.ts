import { describe, expect, it } from 'vitest';

import { openParents, type GateDeps } from '../parentsGate.js';

function deps(answer: boolean, forgot = false): GateDeps & { asked: number; cleared: number } {
  const d = {
    asked: 0,
    cleared: 0,
    request: async () => {
      d.asked += 1;
      return answer;
    },
    takeForgot: () => forgot,
    clear: () => {
      d.cleared += 1;
    },
  };
  return d;
}

describe("the parents' area (user feedback #13)", () => {
  it("does not open for a minor's profile without the PIN", async () => {
    // Before: "Öffnen" showed the parent's e-mail and "Abmelden" to Lena.
    const d = deps(false);
    expect(await openParents({ minor: true, pinSet: true }, d)).toBeNull();
    expect(d.asked).toBe(1);
  });

  it('opens with the PIN, and the PIN counts for opening only', async () => {
    const d = deps(true);
    expect(await openParents({ minor: true, pinSet: true }, d)).toBe('all');
    expect(d.cleared).toBe(1);
  });

  it('"PIN vergessen?" opens only the PIN card (a new PIN needs the password)', async () => {
    expect(await openParents({ minor: true, pinSet: true }, deps(false, true))).toBe('pin_only');
  });

  it('opens without asking for an adult learner, or while there is no PIN to ask for', async () => {
    const adult = deps(false);
    expect(await openParents({ minor: false, pinSet: false }, adult)).toBe('all');
    expect(await openParents({ minor: true, pinSet: false }, adult)).toBe('all');
    expect(adult.asked).toBe(0);
  });
});
