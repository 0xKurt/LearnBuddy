// The finished practice Buddy's greeting names (issue #195): the way into its full view rides with
// the greeting's sentence (components/buddy/extensions.ts `greetingAction`), instead of a card
// repeating it.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ChatCard } from '../buddy/ChatCard.js';
import { quietVariant, type Quiet } from '../buddy/extensions.js';

/** The card under the greeting, when the practice it tells about is this home's result. */
export function greetingResult(h: BuddyHome, tells: string, on: { busy: boolean; quiet: Quiet }) {
  return h.now?.type === 'practice_result' && h.now.session_id === tells ? (
    <ResultView sessionId={h.now.session_id} busy={on.busy} quiet={on.quiet} />
  ) : null;
}

/**
 * The finished practice with Buddy's greeting that names it: the thread's one card
 * (ui_kits/app/Flows.jsx `after`), with "Ansehen" into the full view. No detail — the greeting
 * above it has said how it went, and the card does not say it again (issue #195).
 */
function ResultView({
  sessionId,
  busy,
  quiet,
}: {
  sessionId: string;
  busy: boolean;
  quiet: Quiet;
}) {
  const { t } = useTranslation('buddy');
  return (
    <ChatCard
      tone="accent"
      icon="check"
      title={t('buddy:now.result_title')}
      primary={{
        label: t('buddy:now.result_view'),
        variant: quietVariant(quiet),
        disabled: busy,
        onPress: () => router.push(`/practice/${sessionId}`),
      }}
    />
  );
}
