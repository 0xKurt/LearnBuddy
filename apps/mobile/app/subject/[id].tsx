// "Dein Material", second level (issue #189): one subject with everything there is for it —
// her sheets, the exercises that came from no sheet, and the topics that came up.
//
// A place to LOOK THINGS UP, not a place she has to work: nothing asks for anything, nothing
// is due, nothing is counted (CLAUDE.md rule 6). What CAN be done from here is what could be
// done from the sheet list before — practise a sheet again, see its questions, read it again,
// delete it — plus going back into an exercise she already had. Nothing new is asked of her.
//
// The id is a subject's, or `unsorted` for the sheets whose subject is not known yet.

import type { LibrarySubject, LibraryView, MaterialView } from '@learnbuddy/shared-types/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ExerciseCard } from '../../components/library/ExerciseCard.js';
import { MaterialCard } from '../../components/library/MaterialCard.js';
import { KIND_TONE, type CardTone } from '../../components/library/tone.js';
import { Btn } from '../../components/lb/Btn.js';
import { Chip } from '../../components/lb/Chip.js';
import { EmptyState } from '../../components/lb/EmptyState.js';
import { ErrorNote } from '../../components/lb/ErrorNote.js';
import { LoadFailed } from '../../components/lb/LoadFailed.js';
import { Rise, useListEntrance } from '../../components/lb/Motion.js';
import { Screen } from '../../components/lb/Screen.js';
import { Section } from '../../components/lb/Section.js';
import { Sheet } from '../../components/lb/Sheet.js';
import { LibrarySkeleton } from '../../components/lb/Skeletons.js';
import { toast } from '../../components/lb/Toast.js';
import { ApiError } from '../../lib/api/client.js';
import { deleteMaterial, retryMaterial, startPractice } from '../../lib/api/endpoints.js';
import { keys, queryClient, seedSession, useLibrary } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';

/** What this screen shows, whichever of the two kinds of id brought her here. */
type Shown = {
  name: string;
  tone: CardTone;
  sheets: MaterialView[];
  subject: LibrarySubject | null;
};

function mapMaterials(
  view: LibraryView,
  fn: (list: MaterialView[]) => MaterialView[],
): LibraryView {
  return {
    subjects: view.subjects.map((s) => ({ ...s, materials: fn(s.materials) })),
    unsorted: fn(view.unsorted),
  };
}

/** The subject screen and the home both show material status. */
function refreshAll(): void {
  void queryClient.invalidateQueries({ queryKey: keys.library });
  void queryClient.invalidateQueries({ queryKey: keys.home });
}

export default function SubjectScreen() {
  const { palette, tones } = useTheme();
  const { t } = useTranslation(['library', 'common']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const library = useLibrary();
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
  const unsorted = id === 'unsorted';
  const subject = view && !unsorted ? (view.subjects.find((s) => s.id === id) ?? null) : null;
  // A const, so what is narrowed below stays narrowed inside the rows' callbacks.
  const shown: Shown | null =
    view && unsorted
      ? { name: t('library:unsorted'), tone: 'paper', sheets: view.unsorted, subject: null }
      : subject
        ? {
            name: subject.name,
            tone: KIND_TONE[subject.kind],
            sheets: subject.materials,
            subject,
          }
        : null;
  const exercises = shown?.subject?.exercises ?? [];
  const topics = shown?.subject?.topics ?? [];
  const entering = useListEntrance(view !== undefined);

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

  // Practise the sheet, or read its sentences aloud (issue #223 point 2) — the same way in,
  // one server call that decides what the run holds. Which of the two a sheet offers is the
  // card's business: it knows whether the sheet has sentences to read aloud at all.
  const start = (m: MaterialView, mode: 'practice' | 'speak') =>
    void act(m, async () => {
      const session = await startPractice({ material_id: m.id, mode });
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
      <LoadFailed
        error={library.error}
        busy={library.isFetching}
        onRetry={() => void library.refetch()}
      />
    ) : (
      <LibrarySkeleton label={t('common:loading')} />
    );
  } else if (!shown) {
    // The subject is not in her material any more (renamed, merged, deleted while she was
    // elsewhere): say so plainly and offer the way back — never an empty screen.
    content = (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          title={t('library:subject.gone_title')}
          body={t('library:subject.gone_body')}
          action={
            // To her material, not "back": whatever brought her to a subject that is gone,
            // the way on is the list — and the dead address leaves the history with it.
            <Btn pill center onPress={() => router.replace('/library')}>
              {t('library:subject.back')}
            </Btn>
          }
        />
      </View>
    );
  } else if (shown.sheets.length === 0 && exercises.length === 0 && topics.length === 0) {
    // Everything in this subject is gone (she deleted the last sheet right here). Calm, and
    // with the one thing that fills it again — never "kommt später" (rule 12).
    content = (
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={{ padding: SPACE.lg, flexGrow: 1, justifyContent: 'center' }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
      >
        <EmptyState
          orb
          title={t('library:subject.empty_title')}
          body={t('library:subject.empty_body')}
          action={
            <Btn size="lg" pill center onPress={() => router.push('/capture')}>
              {t('library:capture')}
            </Btn>
          }
        />
      </ScrollView>
    );
  } else {
    content = (
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SPACE.xl, gap: SPACE.xl }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
      >
        {shown.sheets.length > 0 ? (
          <Rise animate={entering(0)} index={0}>
            <Section
              title={t('library:subject.sheets')}
              dot={shown.tone === 'paper' ? palette.ink4 : tones.deep[shown.tone]}
            >
              <View style={{ gap: SPACE.md }}>
                {shown.sheets.map((m) => (
                  <MaterialCard
                    key={m.id}
                    material={m}
                    tone={shown.tone}
                    busy={busyId === m.id}
                    disabled={busyId !== null}
                    onPractice={() => start(m, 'practice')}
                    onSpeak={() => start(m, 'speak')}
                    onOpen={() => router.push(`/material/${m.id}`)}
                    onRetry={() => readAgain(m)}
                    onDelete={() => askDelete(m)}
                  />
                ))}
              </View>
            </Section>
          </Rise>
        ) : null}
        {exercises.length > 0 ? (
          <Rise animate={entering(1)} index={1}>
            <Section title={t('library:subject.exercises')}>
              <View style={{ gap: SPACE.md }}>
                {exercises.map((e) => (
                  <ExerciseCard
                    key={e.id}
                    exercise={e}
                    onPress={() => router.push(`/practice/${e.id}`)}
                  />
                ))}
              </View>
            </Section>
          </Rise>
        ) : null}
        {topics.length > 0 ? (
          <Rise animate={entering(2)} index={2}>
            <Section title={t('library:subject.topics')}>
              <View style={{ gap: SPACE.sm }}>
                <Text style={[TYPE.small, { color: palette.ink2 }]}>
                  {t('library:subject.topics_hint')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                  {topics.map((topic) => (
                    <Chip key={topic}>{topic}</Chip>
                  ))}
                </View>
              </View>
            </Section>
          </Rise>
        ) : null}
      </ScrollView>
    );
  }

  const deleteTitle = deleteTarget?.title ?? t('library:untitled');

  return (
    <Screen back title={shown?.name ?? t('library:title')}>
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
