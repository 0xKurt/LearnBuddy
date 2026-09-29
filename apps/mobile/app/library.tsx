// "Mein Stoff": every sheet the learner photographed, by subject, with its
// reading status and what can be done with it — practise, read again,
// delete (docs/architecture.md §Material). The one main action here is
// photographing a new sheet.

import type { LibraryView, MaterialView, SubjectKind } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { FlashList } from '@shopify/flash-list';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaterialCard } from '../components/library/MaterialCard.js';
import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { ErrorNote } from '../components/lb/ErrorNote.js';
import { Rise, useListEntrance } from '../components/lb/Motion.js';
import { Screen } from '../components/lb/Screen.js';
import { Section } from '../components/lb/Section.js';
import { Sheet } from '../components/lb/Sheet.js';
import { LibrarySkeleton } from '../components/lb/Skeletons.js';
import { toast } from '../components/lb/Toast.js';
import { ApiError } from '../lib/api/client.js';
import { deleteMaterial, retryMaterial, startPractice } from '../lib/api/endpoints.js';
import { keys, queryClient, seedSession, useLibrary } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import type { SubjectTone } from '../lib/theme/palettes.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
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

/** One row of the (virtualised) list: a subject's heading or one of its sheets. */
type Row =
  | { type: 'heading'; key: string; title: string; tone: SubjectTone | 'paper'; first: boolean }
  | { type: 'sheet'; key: string; material: MaterialView; tone: SubjectTone | 'paper' };

function rowsOf(groups: Group[]): Row[] {
  return groups.flatMap((g, n): Row[] => [
    { type: 'heading', key: `h:${g.key}`, title: g.title, tone: g.tone, first: n === 0 },
    ...g.materials.map((m): Row => ({ type: 'sheet', key: m.id, material: m, tone: g.tone })),
  ]);
}

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
  const { palette, tones } = useTheme();
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
  const rows = rowsOf(groups);
  const entering = useListEntrance(view !== undefined);

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
      seedSession(session);
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
          action={
            <Btn pill center busy={library.isFetching} onPress={() => void library.refetch()}>
              {t('common:actions.retry')}
            </Btn>
          }
        />
      </View>
    ) : (
      <LibrarySkeleton label={t('common:loading')} />
    );
  } else {
    content = (
      <>
        {groups.length === 0 ? (
          <ScrollView
            testID="scroll-list"
            contentContainerStyle={{ padding: 16, paddingBottom: 24, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
          >
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                orb
                title={t('library:empty.title')}
                action={
                  // Body text sits here at 16 px (EmptyState's own body is smaller).
                  <View style={{ alignItems: 'center', gap: 16 }}>
                    <Text
                      style={[
                        TYPE.body,
                        { color: palette.ink2, textAlign: 'center', maxWidth: 320 },
                      ]}
                    >
                      {t('library:empty.body')}
                    </Text>
                    <Btn size="lg" pill center onPress={openCapture}>
                      {t('library:capture')}
                    </Btn>
                  </View>
                }
              />
            </View>
          </ScrollView>
        ) : (
          // A school year of sheets gets long: only what is on screen is drawn (gaps.md #22).
          <FlashList
            testID="scroll-list"
            data={rows}
            keyExtractor={(row) => row.key}
            getItemType={(row) => row.type}
            extraData={busyId}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
            renderItem={({ item: row, index }) =>
              row.type === 'heading' ? (
                <Rise
                  animate={entering(index)}
                  index={index}
                  style={{ marginTop: row.first ? 0 : 14, marginBottom: 10 }}
                >
                  <Section
                    title={row.title}
                    dot={row.tone === 'paper' ? palette.ink4 : tones.deep[row.tone]}
                  >
                    {null}
                  </Section>
                </Rise>
              ) : (
                <Rise animate={entering(index)} index={index} style={{ marginBottom: 12 }}>
                  <MaterialCard
                    material={row.material}
                    tone={row.tone}
                    busy={busyId === row.material.id}
                    disabled={busyId !== null}
                    onPractice={() => practice(row.material)}
                    onOpen={() => router.push(`/material/${row.material.id}`)}
                    onRetry={() => readAgain(row.material)}
                    onDelete={() => askDelete(row.material)}
                  />
                </Rise>
              )
            }
          />
        )}
        {groups.length > 0 ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            <Btn size="lg" pill full onPress={openCapture}>
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
        <ErrorNote text={deleteError} />
        <Btn variant="danger" pill full busy={deleting} onPress={() => void confirmDelete()}>
          {t('library:delete_sheet.confirm')}
        </Btn>
      </Sheet>
    </Screen>
  );
}
