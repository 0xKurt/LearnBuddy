// What the French memory case may keep (issue #794). Since #771 Buddy keeps "this afternoon"
// as a constraint that ends tonight, in her own words — sensible: it stops a check from
// interrupting her and lets him ask after the match. The check called her own moment word a
// fault in any memory; the rule it guards ("words that only place it in the moment belong to
// that moment") is about what OUTLASTS the moment. Held here against the outcomes observed live,
// without a model call.

import { describe, expect, it } from 'vitest';

import { CASES } from '../cases.js';
import type { Outcome } from '../caseChecks.js';

const check = CASES.find((c) => c.id === 'fr_commitment_memory_without_german')!.check;

/** The case's check reads the status, the reply, the memories and the steps. */
const kept = (memories: Outcome['memories']): Outcome =>
  ({
    status: 'done',
    reply: "C'est noté, bon entraînement !",
    memories,
    steps: [],
  }) as unknown as Outcome;

const tonight = new Date('2026-09-28T22:00:00Z');

describe('what the French memory case may keep (#794)', () => {
  it('lets a constraint that ends tonight say "tout à l’heure", as she did', () => {
    const observed = {
      kind: 'constraint',
      statement: "Elle a entraînement de handball tout à l'heure et révisera après.",
      valid_until: tonight,
    };
    expect(check(kept([observed]))).toEqual([]);
    expect(check(kept([]))).toEqual([]);
  });

  it('still refuses the moment in what outlasts it', () => {
    const lasting = {
      kind: 'fact',
      statement: "Fait du handball tout à l'heure.",
      valid_until: null,
    };
    expect(check(kept([lasting]))).toEqual([
      expect.stringMatching(/^the moment kept past tonight/),
    ]);
    const longer = {
      ...lasting,
      kind: 'constraint',
      valid_until: new Date('2026-10-05T22:00:00Z'),
    };
    expect(check(kept([longer]))).toEqual([expect.stringMatching(/^the moment kept past tonight/)]);
  });

  it('still refuses a day or a rhythm she did not name, also tonight', () => {
    const invented = {
      kind: 'constraint',
      statement: 'Entraînement de handball chaque mardi.',
      valid_until: tonight,
    };
    expect(check(kept([invented]))).toEqual([expect.stringMatching(/^an invented day or rhythm/)]);
  });
});
