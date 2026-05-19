// Pedagogical move selector — Phase B (B2).
//
// Pure function over (runtime signal, item state, recent history) →
// chosen move. No I/O, no LLM call. The selector lives at the runtime
// tier (L2): it MUST be fast and deterministic.
//
// Decision procedure:
//   1. Drop moves whose `forbidden(ctx)` returns true.
//   2. Keep only moves whose `applies(ctx)` returns true.
//   3. Of those, pick the LOWEST `priority` value.
//   4. Tie-break: if the same move id was used in the last 2 turns,
//      prefer a different equal-priority move (variety penalty).
//   5. Fallback: `continue_natural` always applies — the model uses
//      its base rules with no fragment injected.

import type { MoveId, PedagogicalMove, SelectorContext } from './moves.js';
import { MOVE_REGISTRY } from './moves.js';

export type SelectorDecision = {
  move: PedagogicalMove;
  /** Other moves that were eligible — useful for telemetry / tuning. */
  alternates: ReadonlyArray<MoveId>;
  /** Short human-readable reason. Logged, never shown to the learner. */
  reason: string;
};

export function selectMove(
  ctx: SelectorContext,
  registry: ReadonlyArray<PedagogicalMove> = MOVE_REGISTRY,
): SelectorDecision {
  // 1+2. Filter by applies + forbidden.
  const eligible = registry.filter((m) => !m.forbidden(ctx) && m.applies(ctx));

  // Stable sort by priority ascending.
  const sorted = [...eligible].sort((a, b) => a.priority - b.priority);
  const top = sorted[0];
  if (!top) {
    // Should never happen because continue_natural always applies; but
    // be defensive and return continue_natural by id lookup.
    const fallback =
      registry.find((m) => m.id === 'continue_natural') ?? registry[registry.length - 1]!;
    return {
      move: fallback,
      alternates: [],
      reason: 'no_eligible_moves_fell_back_to_natural',
    };
  }

  // 4. Recency penalty: if this exact move was used in the last 2
  // moves, try to pick a different EQUAL-priority alternative.
  const usedRecently = ctx.recentMoves.slice(-2).includes(top.id);
  if (usedRecently) {
    const sameTier = sorted.filter((m) => m.priority === top.priority && m.id !== top.id);
    if (sameTier.length > 0) {
      return {
        move: sameTier[0]!,
        alternates: sorted.filter((m) => m.id !== sameTier[0]!.id).map((m) => m.id),
        reason: `variety_penalty_avoided_${top.id}`,
      };
    }
  }

  return {
    move: top,
    alternates: sorted.slice(1).map((m) => m.id),
    reason: `selected_by_priority_${top.priority}`,
  };
}
