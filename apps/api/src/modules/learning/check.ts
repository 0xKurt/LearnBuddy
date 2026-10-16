// The learning domain's part of the background check (buddy/checkDecide.ts, issue #107): the
// wake-ups that follow from what she did — a sheet that was read, a practice she finished — as
// lines of TRIGGERS, and her practice questions as something Buddy can work with.

import type { Trigger } from '../buddy/checkTrigger.js';
import type { BuddyState } from '../buddy/state.js';

/** Wake-ups that follow directly from something the learner did. */
const LEARNER_TRIGGERED: ReadonlySet<string> = new Set(['material_ready', 'session_finished']);
/** Those with a fixed answer of their own: her sheet's ready line and start (`checkFallback`). */
const FIXED_ANSWER: ReadonlySet<string> = new Set(['material_ready']);

function describe(state: BuddyState, t: Trigger): string | null {
  switch (t.reason) {
    case 'material_ready': {
      const m = state.materials.find((x) => x.id === t.materialId);
      return `- new material is ready: "${m?.title ?? 'worksheet'}" with ${m?.item_count ?? 0} questions.`;
    }
    case 'session_finished': {
      const s = state.sessions.find((x) => x.id === t.sessionId);
      return s
        ? `- the learner just finished practice: ${s.answered}/${s.total} answered, ${s.first_try} right first try${s.shaky_topics.length ? `, shaky: ${s.shaky_topics.join(', ')}` : ''}.`
        : '- the learner just finished practice.';
    }
    default:
      return null;
  }
}

export const learningCheck = {
  learnerTriggered: LEARNER_TRIGGERED,
  fixedAnswer: FIXED_ANSWER,
  describe,
  somethingToWorkWith: (state: BuddyState) => state.totals.items > 0,
};
