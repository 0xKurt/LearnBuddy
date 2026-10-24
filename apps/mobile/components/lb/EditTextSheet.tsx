// One short-text editor: the field scrolls, Save stays in the sheet footer (#918).
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Btn } from './Btn.js';
import { ErrorNote } from './ErrorNote.js';
import { LbTextInput } from './LbTextInput.js';
import { Sheet } from './Sheet.js';

type Props = {
  visible: boolean;
  title: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  maxLength: number;
  canSave: boolean;
  busy?: boolean;
  multiline?: boolean;
  placeholder?: string;
  error?: string | null;
  children?: ReactNode;
};

export function EditTextSheet(p: Props) {
  const { t } = useTranslation('common');
  return (
    <Sheet
      scrollTestID="scroll-form"
      visible={p.visible}
      title={p.title}
      closeLabel={t('actions.cancel')}
      onClose={p.onClose}
      footer={
        <Btn pill full busy={p.busy} disabled={!p.canSave} onPress={p.onSave}>
          {t('actions.save')}
        </Btn>
      }
    >
      <LbTextInput
        value={p.value}
        onChangeText={p.onChange}
        accessibilityLabel={p.label}
        placeholder={p.placeholder}
        maxLength={p.maxLength}
        multiline={p.multiline}
        autoFocus
        editable={!p.busy}
        error={!!p.error}
        returnKeyType={p.multiline ? 'default' : 'done'}
        onSubmitEditing={p.multiline || !p.canSave || p.busy ? undefined : p.onSave}
      />
      <ErrorNote text={p.error ?? null} />
      {p.children}
    </Sheet>
  );
}
