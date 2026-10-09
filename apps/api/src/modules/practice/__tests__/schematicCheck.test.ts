// The picture library as the model is told it (issues #252, #462): the contract offers exactly the
// drawings the library has, and a part too small for a finger is marked "*" where it is small —
// the lens of the whole eye — and not where it is drawn large.

import { SCHEMATIC_IDS } from '@learnbuddy/shared-math';
import { SCHEMATIC_DRAWINGS } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { SCHEMATIC_PARTS } from '../schematicCheck.js';

const partsOf = (d: string) =>
  SCHEMATIC_PARTS.split('; ')
    .find((line) => line.startsWith(`${d}: `))
    ?.slice(d.length + 2)
    .split(', ');

describe('the library in the model’s rules', () => {
  it('offers exactly the drawings the library has, in its order', () => {
    expect([...SCHEMATIC_DRAWINGS]).toEqual(SCHEMATIC_IDS);
  });

  it('marks the lens and the stigma small in the whole drawing, not in the large one', () => {
    expect(partsOf('eye')).toContain('Linse*');
    expect(partsOf('eye_front')).toContain('Linse');
    expect(partsOf('flower')).toContain('Narbe*');
    expect(partsOf('flower_section')).toContain('Narbe');
    expect(partsOf('flower_section')).toContain('Staubblatt');
  });
});
