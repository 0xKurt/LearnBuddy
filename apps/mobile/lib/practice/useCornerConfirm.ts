// The quiet action in the question's corner (`QuestionCorner`), confirmed in its sheet
// (`CornerSheet`): "Frage passt nicht" takes an unfit question out of this session and out of
// future practice; "Die Bewertung stimmt nicht" (issue #164) takes a judgement she has already
// been given and disagrees with back — the question leaves the result and future practice, and
// her learning state goes back to what it was. Both then go on to the next open question (or the
// result, when none is left). One flow for both: before #311 the screen held it twice.

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '../../components/lb/Toast.js';
import { disputeVerdict, flagItem } from '../api/endpoints.js';
import type { RunOne } from './useOneCall.js';

/** Which of the two the corner offers (`QuestionCorner`); also the i18n group of its words. */
export type CornerAction = 'flag' | 'dispute';

const CALL: Record<CornerAction, (sessionId: string, itemId: string) => Promise<SessionView>> = {
  flag: flagItem,
  dispute: disputeVerdict,
};

type Deps = {
  id: string;
  act: RunOne;
  store: (next: SessionView) => Promise<void>;
  /** After it went through: the question is gone, so is what she had begun for it. */
  onDone: () => void;
};

export function useCornerConfirm({ id, act, store, onDone }: Deps) {
  const { t } = useTranslation('practice');
  /** The action and the question it is about; kept while the sheet closes, so its words stay. */
  const [about, setAbout] = useState<{ action: CornerAction; itemId: string } | null>(null);
  const [open, setOpen] = useState(false);
  return {
    action: about?.action ?? 'flag',
    open,
    ask(action: CornerAction, itemId: string): void {
      setAbout({ action, itemId });
      setOpen(true);
    },
    close: () => setOpen(false),
    confirm(): Promise<void> {
      if (!about) return Promise.resolve();
      const { action, itemId } = about;
      return act(
        async () => {
          await store(await CALL[action](id, itemId));
          setOpen(false);
          onDone();
          toast.show(t(`${action}.done`));
        },
        () => setOpen(false),
      );
    },
  };
}
