// Buddy at work in the thread (#599): the note that he is on something she is waiting for.
//
// `WorkingNote` says that he is making practice from her photos instead of an unexplained pause —
// as the thread's status card (ui_kits/app/Flows.jsx:151, `ChatCard busy`). Only for her photos:
// a look at her finished practice is not announced, because it may end in nothing (issue #845).

import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { ChatCard } from '../buddy/ChatCard.js';

export function WorkingNote() {
  const { t } = useTranslation('buddy');
  useAnnounce(t('working.material'));
  return <ChatCard tone="quiet" busy live title={t('working.material')} />;
}
