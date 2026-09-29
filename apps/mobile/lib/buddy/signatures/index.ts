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
  /** Round 1 "Ring": a tilted band of light round the orb, like a small planet. */
  'ring',
  /** Round 1 "Lichtkern": a soft whirl of light in the glass, three arms round a core. */
  'kern',
  /** Round 1 "Drei Punkte": three small satellites that circle, gather, line up and speak. */
  'punkte',
  /** Round 1 "Funkelstern": the glass's highlight is a twinkling four-pointed star. */
  'stern',
  /** Round 2 "Sternchen": a soft round star with a colourful tail and sparkles round Buddy. */
  'sternchen',
  /** Round 3 "Nur der große Stern": the soft round star alone. */
  'nurstern',
  /** Round 2 "Mond mit Funken": the moon with a colourful trail and pastel sparkles round Buddy. */
  'mondfunken',
  /** Round 3 "Nur die bunten Sternchen": only the colourful sparkles round Buddy. */
  'nurfunken',
  /** Round 2 "Prisma": a beam of light goes in, a fan of pastel rainbow comes out. */
  'prisma',
] as const;
export type SignatureKey = (typeof SIGNATURE_KEYS)[number];

/** The signature the app shows. */
export const DEFAULT_SIGNATURE: SignatureKey = 'mond';
