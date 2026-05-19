// FolderEditorModal — new/edit/archive sheet for folders. Doc 05 §folder + §edit-patterns.
// Shared by subject and folder screens. Supports create, rename, reschedule, and archive.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { archiveFolder, createFolder, updateFolder } from '../../lib/api/folders.js';
import { todayIso } from '../../lib/date.js';
import { LB } from '../../lib/theme/colors.js';
import { Btn } from './Btn.js';
import { LbDatePicker } from './LbDatePicker.js';
import type { Folder } from '@learnbuddy/shared-types';

type Props = {
  visible: boolean;
  subjectId: string;
  initial: Folder | null;
  onClose: () => void;
};

export function FolderEditorModal({ visible, subjectId, initial, onClose }: Props) {
  const { t } = useTranslation('home');
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState<string | null>(initial?.scheduled_for ?? null);

  useMemoResetOnVisible(visible, initial, setName, setDate);

  const createMut = useMutation({
    mutationFn: () =>
      createFolder(subjectId, {
        name: name.trim(),
        scheduled_for: date,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
      onClose();
    },
    onError: (err: Error) => Alert.alert(t('folder_editor.error_title'), err.message),
  });
  const updateMut = useMutation({
    mutationFn: () =>
      updateFolder(initial!.id, {
        name: name.trim(),
        scheduled_for: date,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
      onClose();
    },
    onError: (err: Error) => Alert.alert(t('folder_editor.error_title'), err.message),
  });
  const archiveMut = useMutation({
    mutationFn: () => archiveFolder(initial!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
      onClose();
    },
  });

  const isEdit = initial != null;
  // A test date in the past makes no sense for "scheduled_for". The original
  // value (when editing an existing folder) is allowed through unchanged so
  // we don't force the user to fix a date they didn't touch — only freshly
  // selected past dates are blocked.
  const today = todayIso();
  const originalDate = initial?.scheduled_for ?? null;
  const dateIsPast = date != null && date < today && date !== originalDate;
  const submit = () => (isEdit ? updateMut.mutate() : createMut.mutate());
  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22, gap: 18, flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
            {isEdit ? t('folder_editor.title_edit') : t('folder_editor.title_new')}
          </Text>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: LB.ink2 }}>{t('folder_editor.name_label')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('folder_editor.name_placeholder')}
              autoFocus
              placeholderTextColor={LB.ink3}
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: LB.ink2 }}>{t('folder_editor.date_label')}</Text>
            <LbDatePicker
              value={date}
              onChange={setDate}
              clearable
              error={dateIsPast}
              errorMessage={dateIsPast ? t('folder_editor.date_past') : undefined}
              accessibilityLabel={t('folder_editor.date_label')}
            />
          </View>

          <View style={{ flex: 1 }} />

          {isEdit && (
            <Btn variant="outline" full onPress={() => archiveMut.mutate()}>
              {t('folder_editor.archive')}
            </Btn>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Btn variant="outline" full onPress={onClose}>
                {t('folder_editor.cancel')}
              </Btn>
            </View>
            <View style={{ flex: 2 }}>
              <Btn full onPress={submit} disabled={pending || !name.trim() || dateIsPast}>
                {pending
                  ? t('folder_editor.pending')
                  : isEdit
                    ? t('folder_editor.save')
                    : t('folder_editor.create')}
              </Btn>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function useMemoResetOnVisible(
  visible: boolean,
  initial: Folder | null,
  setName: (v: string) => void,
  setDate: (v: string | null) => void,
) {
  useMemo(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setDate(initial?.scheduled_for ?? null);
    }
  }, [visible, initial, setName, setDate]);
}

const inputStyle = {
  borderWidth: 1,
  borderColor: LB.hairline,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 16,
  color: LB.ink,
  backgroundColor: '#fff',
} as const;
