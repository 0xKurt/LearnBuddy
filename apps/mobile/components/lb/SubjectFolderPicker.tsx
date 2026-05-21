// Post-capture target picker.
//
// Two-step modal:
//   1. (optional) pick a Subject  — skipped if caller pre-targeted one
//   2. pick a Lernziel (Folder) — existing folder, create new one
//      inline, or "Ohne Lernziel" (loose in the subject)
//
// The kid creates Lernziele themselves to organise; the picker is the
// moment where new material gets sorted. Mandatory step 2 (with the
// "Ohne Lernziel" fallback) ensures we never silently drop material
// into a void.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createFolder, listFolders, type FolderListItem } from '../../lib/api/folders.js';
import { listSubjects, type SubjectListItem } from '../../lib/api/subjects.js';
import { LB } from '../../lib/theme/colors.js';
import { Btn } from './Btn.js';
import { CircleBtn } from './CircleBtn.js';

type Props = {
  visible: boolean;
  learnerId: string;
  /** Pre-targeted subject — when set, step 1 is skipped. */
  initialSubjectId?: string | null;
  onChoose: (target: { subjectId: string; folderId: string | null }) => void;
  onCancel: () => void;
};

export function SubjectFolderPicker({
  visible,
  learnerId,
  initialSubjectId,
  onChoose,
  onCancel,
}: Props) {
  const { t } = useTranslation('home');
  const [pickedSubject, setPickedSubject] = useState<SubjectListItem | null>(null);
  const [creating, setCreating] = useState(false);

  // Reset when (re)opened so the picker always starts on step 1 (or
  // step 2 if a subject is pre-targeted).
  useEffect(() => {
    if (!visible) {
      setPickedSubject(null);
      setCreating(false);
    }
  }, [visible]);

  const subjectsQuery = useQuery({
    queryKey: ['subjects', learnerId],
    queryFn: () => listSubjects(learnerId),
    enabled: visible && !!learnerId && !initialSubjectId,
  });
  const subjects = subjectsQuery.data ?? [];

  const effectiveSubjectId = initialSubjectId ?? pickedSubject?.id ?? null;

  const foldersQuery = useQuery({
    queryKey: ['folders', effectiveSubjectId],
    queryFn: () => listFolders(effectiveSubjectId as string),
    enabled: visible && !!effectiveSubjectId,
  });
  const folders = foldersQuery.data ?? [];

  const showStep1 = !initialSubjectId && !pickedSubject;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 16, gap: 14, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {showStep1 ? (
              <CircleBtn icon="close" onPress={onCancel} />
            ) : !initialSubjectId ? (
              <CircleBtn icon="back" onPress={() => setPickedSubject(null)} />
            ) : (
              <CircleBtn icon="close" onPress={onCancel} />
            )}
            <Text style={{ fontSize: 20, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
              {showStep1 ? 'Welches Fach?' : 'Wofür ist das?'}
            </Text>
          </View>

          {showStep1 ? (
            <SubjectList
              loading={subjectsQuery.isLoading}
              subjects={subjects}
              onPick={(s) => setPickedSubject(s)}
            />
          ) : creating ? (
            <CreateFolderInline
              subjectId={effectiveSubjectId as string}
              onCreated={(folderId) =>
                onChoose({ subjectId: effectiveSubjectId as string, folderId })
              }
              onCancel={() => setCreating(false)}
            />
          ) : (
            <FolderList
              loading={foldersQuery.isLoading}
              folders={folders}
              onCreateNew={() => setCreating(true)}
              onPickFolder={(folderId) =>
                onChoose({ subjectId: effectiveSubjectId as string, folderId })
              }
              onPickLoose={() =>
                onChoose({ subjectId: effectiveSubjectId as string, folderId: null })
              }
              looseLabel={t('lernziel.loose_title')}
              createLabel={`+ ${t('lernziel.create_title')}`}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function SubjectList({
  loading,
  subjects,
  onPick,
}: {
  loading: boolean;
  subjects: SubjectListItem[];
  onPick: (s: SubjectListItem) => void;
}) {
  if (loading) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <ActivityIndicator color={LB.ink2} />
      </View>
    );
  }
  if (subjects.length === 0) {
    return (
      <View style={{ paddingVertical: 24 }}>
        <Text style={{ color: LB.ink2, fontSize: 14 }}>
          Du hast noch kein Fach. Leg zuerst ein Fach auf dem Startbildschirm an.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
      {subjects.map((s) => (
        <Pressable key={s.id} onPress={() => onPick(s)}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: LB.bg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: LB.ink }}>{s.name}</Text>
            <Text style={{ fontSize: 12, color: LB.ink3 }}>{s.material_count} Material</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function FolderList({
  loading,
  folders,
  onCreateNew,
  onPickFolder,
  onPickLoose,
  looseLabel,
  createLabel,
}: {
  loading: boolean;
  folders: FolderListItem[];
  onCreateNew: () => void;
  onPickFolder: (folderId: string) => void;
  onPickLoose: () => void;
  looseLabel: string;
  createLabel: string;
}) {
  if (loading) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <ActivityIndicator color={LB.ink2} />
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
      {/* + Neues Lernziel always first — the kid's main action when
          starting something new. Tinted in the warm primary so it stands
          apart from the neutral existing-folder rows below. */}
      <Pressable onPress={onCreateNew}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 16,
            borderRadius: 16,
            backgroundColor: LB.primaryLt,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: LB.primaryDk }}>
            {createLabel}
          </Text>
        </View>
      </Pressable>

      {folders.map((f) => (
        <Pressable key={f.id} onPress={() => onPickFolder(f.id)}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: LB.bg,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: LB.ink }}>{f.name}</Text>
            <Text style={{ fontSize: 12, color: LB.ink3, marginTop: 2 }}>
              {f.item_count} Karten
              {f.material_count > 0 ? ` · ${f.material_count} Material` : ''}
            </Text>
          </View>
        </Pressable>
      ))}

      {/* "Ohne Lernziel" — last option, deliberately less prominent so
          the kid does NOT pick it by default. Helps cards stay
          organised. */}
      <Pressable onPress={onPickLoose}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: 16,
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: LB.hairline,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '500', color: LB.ink2 }}>{looseLabel}</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

function CreateFolderInline({
  subjectId,
  onCreated,
  onCancel,
}: {
  subjectId: string;
  onCreated: (folderId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('home');
  const [name, setName] = useState('');
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      createFolder(subjectId, {
        name: name.trim(),
        scheduled_for: null,
      }),
    onSuccess: (folder) => {
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
      onCreated(folder.id);
    },
    onError: (err: Error) => Alert.alert(t('folder_editor.error_title'), err.message),
  });
  return (
    <View style={{ flex: 1, gap: 14, paddingTop: 8 }}>
      <Text style={{ fontSize: 14, color: LB.ink2, fontWeight: '500' }}>
        {t('lernziel.name_label')}
      </Text>
      <TextInput
        autoFocus
        value={name}
        onChangeText={setName}
        placeholder={t('lernziel.name_placeholder')}
        placeholderTextColor={LB.ink3}
        style={{
          backgroundColor: LB.bg,
          borderColor: LB.hairline,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 16,
          height: 52,
          fontSize: 15,
          color: LB.ink,
        }}
        returnKeyType="done"
        onSubmitEditing={() => name.trim().length > 0 && mut.mutate()}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Btn variant="outline" full onPress={onCancel} disabled={mut.isPending}>
            {t('lernziel.cancel')}
          </Btn>
        </View>
        <View style={{ flex: 1 }}>
          <Btn
            full
            onPress={() => mut.mutate()}
            disabled={name.trim().length === 0 || mut.isPending}
          >
            {t('lernziel.create')}
          </Btn>
        </View>
      </View>
    </View>
  );
}
