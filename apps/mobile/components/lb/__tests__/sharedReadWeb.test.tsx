// On the web there is no UI runtime (#637, review of #734): every frame of every animated style
// runs on the JS thread, so a style must read its shared value itself there — taking what the
// value was created with froze Buddy's orb at its first pose and every entrance at its start, and
// a new chat line stayed invisible. These tests run on react-native-web, as the web build does.

import { expect, it } from 'vitest';

import { read } from '../../../lib/sharedRead.js';

it('reads the value itself on the JS thread, not what it was created with', () => {
  const sv = { value: 1 } as Parameters<typeof read<number>>[0];
  expect(read(sv, 0)).toBe(1);
});
