// Nuclear reactions, counted by mass and atomic number (issue #263). The acceptance: alpha and
// beta decay are balanced, a wrong number is found and named, and a chemical equation is never
// mistaken for a nuclear one.

import { describe, expect, it } from 'vitest';

import { checkNuclear, looksNuclear, nuclearImbalance, parseNuclear } from '../nuclear.js';

const alpha =
  '$^{238}_{92}\\mathrm{U} \\rightarrow ^{234}_{90}\\mathrm{Th} + ^{4}_{2}\\mathrm{He}$';
const beta = '$^{14}_{6}\\mathrm{C} \\rightarrow ^{14}_{7}\\mathrm{N} + ^{0}_{-1}e$';

describe('reading a nuclear equation', () => {
  it('reads every common notation the same way', () => {
    const want = { a: 238, z: 92 };
    for (const s of [
      alpha,
      '²³⁸₉₂U → ²³⁴₉₀Th + ⁴₂He',
      'U-238 → Th-234 + α',
      '^238U -> ^234Th + ^4He',
    ]) {
      const eq = parseNuclear(s);
      expect(eq?.left).toMatchObject(want);
      expect(eq && nuclearImbalance(eq)).toBeNull();
    }
  });

  it('balances alpha and beta decay', () => {
    expect(nuclearImbalance(parseNuclear(alpha)!)).toBeNull();
    expect(nuclearImbalance(parseNuclear(beta)!)).toBeNull();
    expect(nuclearImbalance(parseNuclear('C-14 → N-14 + β⁻ + ν̄')!)).toBeNull();
    expect(nuclearImbalance(parseNuclear('¹⁸₉F → ¹⁸₈O + e⁺')!)).toBeNull();
    expect(nuclearImbalance(parseNuclear('^1_0n + U-235 → Ba-141 + Kr-92 + 3 n')!)).toBeNull();
  });

  it('leaves a chemical equation to chemistry', () => {
    expect(looksNuclear('2 H2 + O2 → 2 H2O')).toBe(false);
    expect(looksNuclear('Fe → Fe^{3+} + 3e^-')).toBe(false);
  });

  it('refuses a nuclide whose written atomic number is not its element’s', () => {
    expect(parseNuclear('²³⁸₉₂U → ²³⁴₉₁Th + ⁴₂He')).toBeNull();
  });
});

describe('her equation against the key', () => {
  it('is right in any order and notation', () => {
    expect(checkNuclear(alpha, 'U-238 → α + Th-234')).toEqual({ verdict: 'correct' });
    expect(checkNuclear(beta, 'C-14 → N-14 + β⁻')).toEqual({ verdict: 'correct' });
    // A neutrino or γ written in addition is more complete, not wrong.
    expect(checkNuclear(beta, '¹⁴₆C → ¹⁴₇N + e⁻ + ν̄')).toEqual({ verdict: 'correct' });
  });

  it('names the number that does not add up', () => {
    expect(checkNuclear(alpha, '²³⁸U → ²³⁴Th + ³He')).toEqual({
      verdict: 'unbalanced',
      imbalance: { kind: 'mass_number', left: 238, right: 237 },
    });
    expect(checkNuclear(alpha, 'U-238 → Pa-234 + α')).toEqual({
      verdict: 'unbalanced',
      imbalance: { kind: 'atomic_number', left: 92, right: 93 },
    });
    // β⁺ instead of β⁻: the charge goes the wrong way.
    expect(checkNuclear(beta, 'C-14 → N-14 + β+')).toEqual({
      verdict: 'unbalanced',
      imbalance: { kind: 'atomic_number', left: 6, right: 8 },
    });
  });

  it('leaves another reaction to the tutor', () => {
    // Balanced, but other products than the key: another decay, not a counting error.
    expect(checkNuclear(alpha, 'U-238 → U-234 + 4 n')).toEqual({ verdict: 'unknown' });
    expect(checkNuclear(alpha, 'U-235 → Th-231 + α')).toEqual({ verdict: 'unknown' });
    expect(checkNuclear(alpha, 'Uran zerfällt in Thorium')).toEqual({ verdict: 'unknown' });
  });
});
