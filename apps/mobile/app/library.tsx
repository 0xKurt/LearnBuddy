// "Mein Stoff": every sheet the learner photographed, by subject, with its
// reading status and what can be done with it — practise, read again,
// delete (docs/architecture.md §Material). The one main action here is
// photographing a new sheet.

import type { LibraryView, MaterialView, SubjectKind } from '@learnbuddy/shared-types/contracts';
import { focusManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaterialCard } from '../components/library/MaterialCard.js';
import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { Section } from '../components/lb/Section.js';
import { Sheet } from '../components/lb/Sheet.js';
import { toast } from '../components/lb/Toast.js';
import { ApiError } from '../lib/api/client.js';
import { deleteMaterial, retryMaterial, startPractice } from '../lib/api/endpoints.js';
import { keys, queryClient, useLibrary } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import { LB, type SubjectTone } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

/** Each kind of subject keeps its pastel, so a subject looks the same everywhere in the list. */
const KIND_TONE: Record<SubjectKind, SubjectTone> = {
  math: 'sky',
  physics: 'sky',
  computer_science: 'sky',
  chemistry: 'mint',
  biology: 'mint',
  geography: 'mint',
  german: 'peach',
  english: 'lavender',
  french: 'lavender',
  spanish: 'lavender',
  latin: 'lavender',
  other_language: 'lavender',
  history: 'butter',
  economics: 'butter',
  social_studies: 'butter',
  art_music: 'blush',
  religion_ethics: 'rose',
  other: 'rose',
};

type Group = { key: string; title: string; tone: SubjectTone | 'paper'; materials: MaterialView[] };

const isReading = (m: MaterialView) => m.status === 'queued' || m.status === 'processing';

function mapMaterials(
  view: LibraryView,
  fn: (list: MaterialView[]) => MaterialView[],
): LibraryView {
  return {
    subjects: view.subjects.map((s) => ({ ...s, materials: fn(s.materials) })),
    unsorted: fn(view.unsorted),
  };
}

/** Library and home both show material status. */
function refreshAll(): void {
  void queryClient.invalidateQueries({ queryKey: keys.library });
  void queryClient.invalidateQueries({ queryKey: keys.home });
}

export default function LibraryScreen() {
  const { t } = useTranslation(['library', 'common']);
  const library = useLibrary();
  const insets = useSafeAreaInsets();
  const [pulling, setPulling] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The sheet keeps its material while it slides out.
  const [deleteTarget, setDeleteTarget] = useState<MaterialView | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Starting practice and deleting are not idempotent: one action at a time, even on a double tap.
  const acting = useRef(false);

  const view = library.data;
  const groups: Group[] = [];
  if (view) {
    for (const s of view.subjects) {
      if (s.materials.length > 0) {
        groups.push({ key: s.id, title: s.name, tone: KIND_TONE[s.kind], materials: s.materials });
      }
    }
    if (view.unsorted.length > 0) {
      groups.push({
        key: 'unsorted',
        title: t('library:unsorted'),
        tone: 'paper',
        materials: view.unsorted,
      });
    }
  }
  const reading = groups.some((g) => g.materials.some(isReading));

  // While a sheet is being read, follow it here as the home does.
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => {
      if (focusManager.isFocused()) void queryClient.invalidateQueries({ queryKey: keys.library });
    }, 5000);
    return () => clearInterval(timer);
  }, [reading]);

  const openCapture = () => router.push('/capture');

  async function pull() {
    setPulling(true);
    try {
      await library.refetch();
    } finally {
      setPulling(false);
    }
  }

  async function act(m: MaterialView, fn: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setBusyId(m.id);
    try {
      await fn();
    } catch (err) {
      toast.show(messageFor(err), 'error');
      // Changed meanwhile (read again, deleted elsewhere): show what is true now.
      if (err instanceof ApiError && (err.code === 'conflict' || err.code === 'not_found'))
        refreshAll();
    } finally {
      acting.current = false;
      setBusyId(null);
    }
  }

  const practice = (m: MaterialView) =>
    void act(m, async () => {
      const session = await startPractice({ material_id: m.id, mode: 'practice' });
      router.push(`/practice/${session.id}`);
    });

  const readAgain = (m: MaterialView) =>
    void act(m, async () => {
      const updated = await retryMaterial(m.id);
      queryClient.setQueryData<LibraryView>(
        keys.library,
        (v) => v && mapMaterials(v, (list) => list.map((x) => (x.id === updated.id ? updated : x))),
      );
      refreshAll();
      toast.show(t('library:retry_started'));
    });

  function askDelete(m: MaterialView) {
    if (acting.current) return;
    setDeleteTarget(m);
    setDeleteError(null);
    setSheetOpen(true);
  }

  async function confirmDelete() {
    const m = deleteTarget;
    if (!m || acting.current) return;
    acting.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMaterial(m.id);
      setSheetOpen(false);
      queryClient.setQueryData<LibraryView>(
        keys.library,
        (v) => v && mapMaterials(v, (list) => list.filter((x) => x.id !== m.id)),
      );
      refreshAll();
      toast.show(t('library:deleted'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_found') {
        // Already gone: nothing left to confirm.
        setSheetOpen(false);
        refreshAll();
        toast.show(messageFor(err));
      } else {
        // Shown in the sheet: a toast would sit behind it.
        setDeleteError(messageFor(err));
      }
    } finally {
      acting.current = false;
      setDeleting(false);
    }
  }

  let content: ReactNode;
  if (!view) {
    content = library.isError ? (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          title={messageFor(library.error)}
          action={<Btn onPress={() => void library.refetch()}>{t('common:actions.retry')}</Btn>}
        />
      </View>
    ) : (
      <LoadingState label={t('common:loading')} />
    );
  } else {
    content = (
      <>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 22, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
        >
          {groups.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                title={t('library:empty.title')}
                action={
                  // Body text sits here at 16 px (EmptyState's own body is smaller).
                  <View style={{ alignItems: 'center', gap: 16 }}>
                    <Text
                      style={[TYPE.body, { color: LB.ink2, textAlign: 'center', maxWidth: 320 }]}
                    >
                      {t('library:empty.body')}
                    </Text>
                    <Btn size="lg" center onPress={openCapture}>
                      {t('library:capture')}
                    </Btn>
                  </View>
                }
              />
            </View>
          ) : (
            groups.map((g) => (
              <Section key={g.key} title={g.title}>
                <View style={{ gap: 10 }}>
                  {g.materials.map((m) => (
                    <MaterialCard
                      key={m.id}
                      material={m}
                      tone={g.tone}
                      busy={busyId === m.id}
                      disabled={busyId !== null}
                      onPractice={() => practice(m)}
                      onRetry={() => readAgain(m)}
                      onDelete={() => askDelete(m)}
                    />
                  ))}
                </View>
              </Section>
            ))
          )}
        </ScrollView>
        {groups.length > 0 ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 16),
              backgroundColor: LB.paper,
              borderTopWidth: 1,
              borderTopColor: LB.hairline,
            }}
          >
            <Btn size="lg" full onPress={openCapture}>
              {t('library:capture')}
            </Btn>
          </View>
        ) : null}
      </>
    );
  }

  const deleteTitle = deleteTarget?.title ?? t('library:untitled');

  return (
    <Screen back title={t('library:title')}>
      {content}
      <Sheet
        visible={sheetOpen}
        title={t('library:delete_sheet.title')}
        closeLabel={t('common:actions.cancel')}
        onClose={() => setSheetOpen(false)}
      >
        <Text style={TYPE.body}>{t('library:delete_sheet.body', { title: deleteTitle })}</Text>
        {deleteError ? (
          <View accessibilityLiveRegion="polite">
            <Card tone="blush" padding={14} radius={16}>
              <Text style={TYPE.body}>{deleteError}</Text>
            </Card>
          </View>
        ) : null}
        <Btn variant="danger" full disabled={deleting} onPress={() => void confirmDelete()}>
          {t('library:delete_sheet.confirm')}
        </Btn>
      </Sheet>
    </Screen>
  );
}
