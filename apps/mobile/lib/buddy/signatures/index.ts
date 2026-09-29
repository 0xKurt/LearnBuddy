// Buddy's signatures: the animated sign beside the glass orb that shows what he is doing
// (docs/DESIGN-BRIEF.md §Buddy's signature). "mond" is the chosen one and the default; the
// others are the approved prototypes' variants, prepared to the same standard so one can be
// swapped in — none is offered in the UI yet.
//
// Porting another prototype variant (orb-varianten*.html):
//  1. lib/buddy/signatures/<key>.ts — its sim (core OrbSim + its own numbers), step, still
//     (the prototype's `stills`), pose (everything its `update` writes), detail per size level,
//     `settle` (when "happy" hands back to idle) and a SignatureMaths object. Shared pieces:
//     core.ts (blend, orbit, speech, base pose, node order, burst), sparkField.ts.
//  2. __tests__/<key>.test.ts — numbers read from the prototype's SVG after jump('idle', 1.5),
//     setState and n steps of 16 ms (remember jump's one extra render), plus behaviour tests.
//  3. components/lb/signatures/<Key>Signature.tsx — its parts on OrbStage's layers (back,
//     inside, overGlass, front), animated views reading the pose; add it to SIGNATURES there.
//  4. Add the key below; compare prototype | app side by side at several times per state.

/** Every prepared signature (the prototype variant it reproduces in the comment). */
export const SIGNATURE_KEYS = [
  /** Round 1 "Mond": a pearl moon on a tilted orbit — the default. */
  'mond',
] as const;
export type SignatureKey = (typeof SIGNATURE_KEYS)[number];

/** The signature the app shows. */
export const DEFAULT_SIGNATURE: SignatureKey = 'mond';
