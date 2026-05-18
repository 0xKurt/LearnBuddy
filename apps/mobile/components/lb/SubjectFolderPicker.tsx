// Post-capture target picker. Doc 05 §Capture ("'Fertig' proceeds to the
// subject / folder picker (if not pre-targeted)").
//
// Two-step modal: pick a subject, then pick a folder (or skip the folder).
// Uses the existing listSubjects / listFolders query hooks so the lists stay
// in sync with the home / subject screens via the shared TanStack cache.

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listFolders } from '../../lib/api/folders.js';
import { listSubjects, type SubjectListItem } from '../../lib/api/subjects.js';
import { LB } from '../../lib/theme/colors.js';
import { CircleBtn } from './CircleBtn.js';

type Props = {
  visible: boolean;
  learnerId: string;
  onChoose: (target: { subjectId: string; folderId: string | null }) => void;
  onCancel: () => void;
};

export function SubjectFolderPicker({ visible, learnerId, onChoose, onCancel }: Props) {
  const [step, setStep] = useState<{ subject: SubjectListItem | null }>({ subject: null });

  // iOS swipe-down on a formSheet bypasses both buttons and onRequestClose
  // (which is Android-only). Reset step on every visible→hidden transition
  // so the picker always re-opens on the subject list.
  useEffect(() => {
    if (!visible) setStep({ subject: null });
  }, [visible]);

  const subjectsQuery = useQuery({
    queryKey: ['subjects', learnerId],
    queryFn: () => listSubjects(learnerId),
    enabled: visible && !!learnerId,
  });

  const foldersQuery = useQuery({
    queryKey: ['folders', step.subject?.id],
    queryFn: () => listFolders(step.subject!.id),
    enabled: visible && !!step.subject?.id,
  });

  const close = () => {
    setStep({ subject: null });
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 16, gap: 14, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {step.subject ? (
              <CircleBtn icon="back" onPress={() => setStep({ subject: null })} />
            ) : (
              <CircleBtn icon="close" onPress={close} />
            )}
            <Text style={{ fontSize: 20, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
              {step.subject ? 'Ordner wählen' : 'Wohin damit?'}
            </Text>
          </View>

          {step.subject ? (
            <FolderList
              loading={foldersQuery.isLoading}
              folders={foldersQuery.data ?? []}
              onPick={(folderId) => {
                onChoose({ subjectId: step.subject!.id, folderId });
                setStep({ subject: null });
              }}
            />
          ) : (
            <SubjectList
              loading={subjectsQuery.isLoading}
              subjects={subjectsQuery.data ?? []}
              onPick={(subject) => setStep({ subject })}
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
            <Text style={{ fontSize: 12, color: LB.ink3 }}>
              {s.folder_count} Ordner · {s.material_count} Material
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function FolderList({
  loading,
  folders,
  onPick,
}: {
  loading: boolean;
  folders: { id: string; name: string }[];
  onPick: (folderId: string | null) => void;
}) {
  if (loading) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <ActivityIndicator color={LB.ink2} />
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
      <Pressable onPress={() => onPick(null)}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: 16,
            backgroundColor: LB.primaryLt,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '500', color: LB.primaryDk }}>
            Ohne Ordner — direkt im Fach
          </Text>
        </View>
      </Pressable>
      {folders.map((f) => (
        <Pressable key={f.id} onPress={() => onPick(f.id)}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: LB.bg,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: LB.ink }}>{f.name}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
