// What can still be taken back, when more than one thing can (issue #204).
//
// The chat shows "Rückgängig" on the newest step only — three buttons under three receipts
// were the wall the owner saw ("schau dass die screens nicht überladen sind"). Taking
// something back is a principle here (docs/UX-PRINCIPLES.md: undo over confirmation), so the
// capability does not go with the buttons: a tap (or a long press) on a receipt opens this
// sheet, which lists everything that can still be taken back — newest first, each with its
// own way back. The sheet closes with its own visible button (CLAUDE.md rule 14, Sheet.tsx).

import type { ActionView } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Sheet } from '../lb/Sheet.js';
import { describeAction } from './describe.js';

type Props = {
  /** Newest first; empty means the sheet is never opened. */
  actions: readonly ActionView[];
  visible: boolean;
  busy: boolean;
  onUndo: (actionId: string) => void;
  onClose: () => void;
};

export function UndoSheet({ actions, visible, busy, onUndo, onClose }: Props) {
  const { t } = useTranslation(['buddy', 'common']);
  return (
    <Sheet
      visible={visible && actions.length > 0}
      title={t('buddy:done.undo_title')}
      closeLabel={t('common:actions.close')}
      onClose={onClose}
      // More than a handful of steps is a list she browses: it may scroll, and says so.
      scrollTestID="scroll-list"
    >
      {actions.map((a) => {
        const what = describeAction(a.summary);
        return (
          <View key={a.id} style={{ gap: SPACE.xs }}>
            <Text style={[TYPE.body, { textAlign: 'left' }]}>{what}</Text>
            <Btn
              variant="outline"
              full
              disabled={busy}
              accessibilityLabel={t('buddy:done.undo_label', { what })}
              onPress={() => {
                onClose();
                onUndo(a.id);
              }}
            >
              {/* Taking back a request for a photo: "no photo needed" (#14). */}
              {a.summary.tool === 'request_material'
                ? t('buddy:done.undo_request_material')
                : t('buddy:done.undo')}
            </Btn>
          </View>
        );
      })}
    </Sheet>
  );
}
