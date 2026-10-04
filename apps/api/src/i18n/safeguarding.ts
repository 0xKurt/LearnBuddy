// The fixed answer to distress and to a held-back message, in her language and for her age
// (i18n `safeguarding.*`). One implementation for every place a learner writes free text —
// the Buddy chat (`modules/buddy/turn.ts`) and the practice tutor (`modules/practice/answer.ts`,
// issue #389) — so the helpline text is the same wherever she says it.

import { t } from './index.js';

export type SafeguardingKind = 'blocked' | 'concern' | 'also_asked';

export function safeguardingText(locale: string, minor: boolean, kind: SafeguardingKind): string {
  return t(locale, minor ? `safeguarding.${kind}` : `safeguarding.${kind}_adult`);
}
