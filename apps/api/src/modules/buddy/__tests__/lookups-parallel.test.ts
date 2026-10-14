// One step's lookups run side by side (issue #626): the step waits for its slowest lookup, not
// for their sum. Two lookups that each wait for the other to have started can only finish when
// both run at once — run one after the other, the first never returns and the test times out.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { Deps } from '../../../deps.js';
import { defineLookup, registerLookups, withLookups } from '../lookups.js';

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}

const first = gate();
const second = gate();
const order: string[] = [];

registerLookups(
  defineLookup({
    name: 'test_slow_a',
    description: 'test',
    args: z.object({}),
    surfaces: ['turn'],
    run: async () => {
      first.open();
      await second.opened;
      order.push('a');
      return 'A';
    },
  }),
  defineLookup({
    name: 'test_slow_b',
    description: 'test',
    args: z.object({}),
    surfaces: ['turn'],
    run: async () => {
      second.open();
      await first.opened;
      order.push('b');
      return 'B';
    },
  }),
);

describe('lookups of one step', () => {
  it('run side by side and come back in the order the model asked', async () => {
    const seen: string[] = [];
    let round = 0;
    await withLookups({
      ctx: { deps: {} as Deps, learnerId: 'l', timezone: 'Europe/Berlin' },
      surface: 'turn',
      contents: [],
      call: async (messages) => {
        round++;
        if (round === 1)
          return {
            lookups: [
              { tool: 'test_slow_a', args: {} },
              { tool: 'test_slow_b', args: {} },
            ],
          };
        seen.push(JSON.stringify(messages.at(-1)));
        return { lookups: [] };
      },
    });
    expect(order.sort()).toEqual(['a', 'b']);
    const results = seen[0] ?? '';
    expect(results.indexOf('test_slow_a')).toBeLessThan(results.indexOf('test_slow_b'));
  }, 2_000);
});
