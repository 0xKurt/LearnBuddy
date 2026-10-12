// Actual turn actions supplied by the adapter; choosing one takes it back immediately.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SPACE } from '../../lib/theme/space.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import { Sheet } from '../lb/Sheet.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { Btn } from '../lb/Btn.js';

type UndoRow = {
  id: string;
  title: string;
  undone: boolean;
  busy: boolean;
  disabled: boolean;
};
export function UndoSheet({
  visible,
  rows,
  onClose,
  onUndo,
  error = null,
}: {
  error?: string | null;
  visible: boolean;
  rows: UndoRow[];
  onClose: () => void;
  onUndo: (id: string) => void;
}) {
  const { t } = useTranslation('buddy');
  return (
    <Sheet
      visible={visible}
      title={t('done.undo_sheet_title')}
      closeLabel={t('common:a11y.close')}
      onClose={onClose}
    >
      <View style={{ gap: SPACE.md }}>
        <ErrorNote text={error} />
        <ListGroup>
          {rows.map((row) => (
            <Row
              key={row.id}
              title={row.title}
              completed={row.undone}
              chevron={false}
              value={row.undone ? t('done.taken_back') : undefined}
              trailing={
                row.undone ? undefined : (
                  <Btn
                    size="sm"
                    variant="secondary"
                    busy={row.busy}
                    disabled={row.disabled}
                    accessibilityLabel={t('done.undo_label', { what: row.title })}
                    onPress={() => onUndo(row.id)}
                  >
                    {t('done.undo')}
                  </Btn>
                )
              }
            />
          ))}
        </ListGroup>
      </View>
    </Sheet>
  );
}
