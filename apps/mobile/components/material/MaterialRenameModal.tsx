// Bottom modal for renaming a material. Single TextInput with auto-focus
// + Save / Cancel. Submits via onSave(title) so the caller owns the API
// call + cache invalidation.

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { LbTextInput } from '../lb/LbTextInput.js';
import { LB } from '../../lib/theme/colors.js';

type Props = {
  visible: boolean;
  initialTitle: string;
  onClose: () => void;
  onSave: (title: string) => void;
  /** Optional async-pending state to disable buttons while the parent's
   *  mutation is in flight. */
  saving?: boolean;
};

export function MaterialRenameModal({ visible, initialTitle, onClose, onSave, saving }: Props) {
  const { t } = useTranslation('home');
  const [value, setValue] = useState(initialTitle);

  // Reset when the modal is (re)opened so the user always starts on the
  // current title — not whatever was typed last time.
  useEffect(() => {
    if (visible) setValue(initialTitle);
  }, [visible, initialTitle]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== initialTitle.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.scrim} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{t('material.actions.rename')}</Text>
            <LbTextInput
              value={value}
              onChangeText={setValue}
              placeholder={t('material.untitled')}
              autoFocus
              maxLength={140}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canSave && !saving) onSave(trimmed);
              }}
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Btn variant="outline" full onPress={onClose} disabled={saving}>
                  {t('subject.cancel')}
                </Btn>
              </View>
              <View style={{ flex: 1 }}>
                <Btn full onPress={() => onSave(trimmed)} disabled={!canSave || saving}>
                  {t('folder_editor.save')}
                </Btn>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: LB.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 22,
    paddingBottom: 28,
    gap: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: LB.ink,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});
