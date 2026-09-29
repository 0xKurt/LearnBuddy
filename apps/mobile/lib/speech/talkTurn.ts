// After Buddy's reply in conversation mode (app/talk.tsx): when does the loop listen again?
// Pure and unit-tested, because two endings race (issues #40/#41): the reading of a short
// reply can finish before the server has stored the reply — and the other way round. The
// loop listens again once BOTH are there, whichever came last; deciding only on one of the
// two left the screen stuck in "Buddy spricht" with the mic off.

import type { ListenEnd } from './pipeline.js';

export type AfterReply = 'wait' | 'listen' | 'pause';

/**
 * 'wait' while the reading or the stored reply is still missing; then 'listen' when the
 * reading ended well and the mic may open by itself (no screen reader — it would be
 * recorded), else 'pause' (she interrupted, or reading failed: the mic waits for her tap).
 */
export function afterReply(
  spokenEnd: ListenEnd | null,
  stored: boolean,
  listensByItself: boolean,
): AfterReply {
  if (spokenEnd === null || !stored) return 'wait';
  return spokenEnd === 'done' && listensByItself ? 'listen' : 'pause';
}
