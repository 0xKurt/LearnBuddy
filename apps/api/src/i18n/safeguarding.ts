// The fixed answer to distress and to a held-back message, in her language and for her age
// (i18n `safeguarding.*`). One implementation for every place a learner writes free text —
// the Buddy chat (`modules/buddy/turn.ts`) and every practice answer field
// (`modules/practice/answerSafeguard.ts`, issues #389, #747) — so the helpline text is the same
// wherever she says it. `unchecked` is the one sentence a practice reply carries when no distress
// check could read her words.

import { t } from './index.js';

export type SafeguardingKind = 'blocked' | 'held' | 'concern' | 'also_asked' | 'unchecked';

export function safeguardingText(locale: string, minor: boolean, kind: SafeguardingKind): string {
  return t(locale, minor ? `safeguarding.${kind}` : `safeguarding.${kind}_adult`);
}
