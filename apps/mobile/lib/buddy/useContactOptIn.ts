// "Darf Buddy sich melden?" answered with yes (CLAUDE.md rule 6: contact is opt-in). Under 16 the
// parents allow it with their PIN, and they see what they allow — the rules, not only "Buddy may"
// (user feedback #4). The notification permission is asked only now, when it has a purpose.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { optInRules, type OptInDecision } from '../../components/buddy/DecisionCard.js';
import { toast } from '../../components/lb/Toast.js';
import { clearAdminToken } from '../admin.js';
import { requestAdmin } from '../adminFlow.js';
import { answerContactOptIn } from '../api/endpoints.js';
import { registerDeviceForPush } from '../push.js';
import type { HomeAct } from './useHomeAct.js';

export function useContactOptIn(home: BuddyHome | undefined, act: HomeAct) {
  const { t } = useTranslation('buddy');

  /** "Nie nach 20:00 Uhr" from the stored rules. */
  function rulesShort(decision: OptInDecision | null): string {
    const r = decision?.rules;
    if (!r) return t('buddy:decision.rules_settings');
    return t('buddy:decision.rules_short', { time: r.quiet_start });
  }

  return async function enableContact(asAdult: boolean): Promise<void> {
    const name = home?.learner.name ?? '';
    const decision = home?.decision?.type === 'contact_opt_in' ? home.decision : null;
    try {
      // The parents see what they allow (user feedback #4): the rules, not only "Buddy may".
      if (
        asAdult &&
        !(await requestAdmin(
          'contact',
          t('buddy:decision.optin_parent', {
            name,
            rules: decision ? optInRules(t, decision) : t('buddy:decision.optin_body'),
          }),
        ))
      )
        return;
      let registered = false;
      let enabled = false;
      await act(async () => {
        const next = await answerContactOptIn(true);
        enabled = next.system.contact_enabled;
        // Ask for notification permission only now, when it has a purpose.
        if (enabled) registered = await registerDeviceForPush().catch(() => false);
        return next;
      });
      // … and afterwards it is confirmed, with what was allowed. A phone that could not be set
      // up for notifications is no toast over the chat (live finding 8): the card in the chat
      // says what was allowed, and settings says calmly that this phone is not set up yet.
      if (enabled && registered) {
        const rules = rulesShort(decision);
        toast.show(
          asAdult
            ? t('buddy:decision.optin_done_minor', { name, rules })
            : t('buddy:decision.optin_done', { rules }),
        );
      }
    } finally {
      // The PIN was for this one step, also when it failed (docs/privacy.md §PIN gate).
      if (asAdult) clearAdminToken();
    }
  };
}
