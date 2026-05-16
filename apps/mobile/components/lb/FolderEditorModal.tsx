// FolderEditorModal — new/edit/archive sheet for folders. Doc 05 §folder + §edit-patterns.
// Shared by subject and folder screens. Supports create, rename, reschedule, and archive.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, Modal, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { archiveFolder, createFolder, updateFolder } from '../../lib/api/folders.js';
import { LB } from '../../lib/theme/colors.js';
import { Btn } from './Btn.js';
import type { Folder } from '@learnbuddy/shared-types';

type Props = {
  visible: boolean;
  subjectId: string;
  initial: Folder | null;
  onClose: () => void;
};

export function FolderEditorModal({ visible, subjectId, initial, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState(initial?.scheduled_for ?? '');

  useMemoResetOnVisible(visible, initial, setName, setDate);

  const createMut = useMutation({
    mutationFn: () =>
      createFolder(subjectId, {
        name: name.trim(),
        scheduled_for: date.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
      onClose();
    },
    onError: (err: Error) => Alert.alert('Ups.', err.message),
  });
  const updateMut = useMutation({
    mutationFn: () =>
      updateFolder(initial!.id, {
        name: name.trim(),
        scheduled_for: date.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
      onClose();
    },
    onError: (err: Error) => Alert.alert('Ups.', err.message),
  });
  const archiveMut = useMutation({
    mutationFn: () => archiveFolder(initial!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
      onClose();
    },
  });

  const isEdit = initial != null;
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
            {isEdit ? 'Ordner bearbeiten' : 'Neuer Ordner'}
          </Text>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: LB.ink2 }}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="z.B. Klassenarbeit 14.06."
              autoFocus
              placeholderTextColor={LB.ink3}
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: LB.ink2 }}>Termin (optional, JJJJ-MM-TT)</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="2026-06-14"
              placeholderTextColor={LB.ink3}
              autoCapitalize="none"
              style={inputStyle}
            />
          </View>

          <View style={{ flex: 1 }} />

          {isEdit && (
            <Btn variant="outline" full onPress={() => archiveMut.mutate()}>
              Archivieren
            </Btn>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Btn variant="outline" full onPress={onClose}>
                Abbrechen
              </Btn>
            </View>
            <View style={{ flex: 2 }}>
              <Btn full onPress={submit} disabled={pending || !name.trim()}>
                {pending ? 'Bitte warten…' : isEdit ? 'Speichern' : 'Anlegen'}
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
  setDate: (v: string) => void,
) {
  useMemo(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setDate(initial?.scheduled_for ?? '');
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
