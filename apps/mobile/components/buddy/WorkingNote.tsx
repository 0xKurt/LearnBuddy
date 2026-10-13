// Buddy at work in the thread (#599): the note that he is on something she is waiting for.
//
// `WorkingNote` says what he is doing with her photos or her finished practice instead of an
// unexplained pause — as the thread's status card (ui_kits/app/Flows.jsx:151, `ChatCard busy`).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { ChatCard } from './ChatCard.js';

export function WorkingNote({ what }: { what: NonNullable<BuddyHome['working']> }) {
  const { t } = useTranslation('buddy');
  useAnnounce(t(`working.${what}`));
  return <ChatCard tone="quiet" busy live title={t(`working.${what}`)} />;
}
