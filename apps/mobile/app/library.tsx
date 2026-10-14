// "Dein Material" (issue #189), the first of two levels: her subjects — what there is, and
// a glimpse of what is in each one. One tap goes in (app/subject/[id].tsx), where the
// sheets, the exercises and the topics stand. The one main action here stays photographing
// a new sheet.
//
// Why a list at all, with rule 16 in force: this is a path for LOOKING, not for working —
// the owner's "einfach damit man selbst mal schnell was raussuchen kann wenn man moechte.
// es ist ja alles da." Rule 16 allows a list she browses on purpose to scroll, and the
// sheets were already such a list; this adds ONE level to it instead of a second home.
//
// Nothing here counts anything: no progress, nothing due, no missed days (rule 6). How much
// there is, is said by naming the newest things — see components/library/subjects.ts.

import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ListGroup } from '../components/lb/ListGroup.js';
import { LIBRARY } from '../lib/theme/library.js';
import { MaterialRow } from '../components/library/MaterialRow.js';
import { useStartMaterial } from '../components/library/useStartMaterial.js';
import { SubjectCard } from '../components/library/SubjectCard.js';
import { byActivity, hasSomething } from '../components/library/subjects.js';
import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { LoadFailed } from '../components/lb/LoadFailed.js';
import { Rise, useListEntrance } from '../components/lb/Motion.js';
import { Screen } from '../components/lb/Screen.js';
import { LibrarySkeleton } from '../components/lb/Skeletons.js';
import { useLibrary } from '../lib/api/libraryQueries.js';
import { GUTTER_APP, SPACE } from '../lib/theme/space.js';
import type { LibrarySubject } from '@learnbuddy/shared-types/contracts';
import { attachInChat } from '../lib/capture/attachRequest.js';
import { useShown } from '../lib/perfShown.js';

/** One card in the list: a subject of hers, or the sheets whose subject is not known yet. */
type Row = { key: string; name: string; subject: LibrarySubject | null };

export default function LibraryScreen() {
  const { t } = useTranslation(['library', 'common']);
  const library = useLibrary();
  useShown('library', true);
  useShown('library_data', library.data !== undefined);
  const { busyId, start } = useStartMaterial();
  const [pulling, setPulling] = useState(false);

  const view = library.data;
  const rows: Row[] = [];
  const recent = view
    ? [...view.subjects.flatMap((subject) => subject.materials), ...view.unsorted].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )
    : [];
  if (view) {
    // A subject with nothing in it is left out: this list says what there IS, and an empty
    // card would only lead to an empty screen. It comes back the moment something lands in it.
    for (const s of [...view.subjects].filter(hasSomething).sort(byActivity)) {
      rows.push({ key: s.id, name: s.name, subject: s });
    }
    if (view.unsorted.length > 0) {
      rows.push({ key: 'unsorted', name: t('library:unsorted'), subject: null });
    }
  }
  const entering = useListEntrance(view !== undefined);

  // A new sheet: the chat's + menu (issue #519).
  const openCapture = () => attachInChat({ open: 'menu' });

  async function pull() {
    setPulling(true);
    try {
      await library.refetch();
    } finally {
      setPulling(false);
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
      <LibrarySkeleton label={t('common:loading')} capture />
    );
  } else {
    const empty = rows.length === 0;
    content = (
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={
          // The empty page brings its own room (the wider gutter, ui_kits/app/Gaps.jsx:52).
          empty
            ? { flexGrow: 1 }
            : {
                paddingHorizontal: GUTTER_APP,
                paddingTop: LIBRARY.pageTop,
                paddingBottom: LIBRARY.pageBottom,
                gap: SPACE.xl,
              }
        }
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
      >
        {empty ? (
          <EmptyState
            page
            title={t('library:empty.title')}
            body={t('library:empty.body')}
            action={
              <Btn icon="camera" onPress={openCapture}>
                {t('library:capture')}
              </Btn>
            }
          />
        ) : (
          <>
            <Btn variant="secondary" icon="camera" full onPress={openCapture}>
              {t('library:capture')}
            </Btn>
            <ListGroup label={t('library:subjects')}>
              {rows.map((row, index) => (
                <Rise key={row.key} animate={entering(index)} index={index}>
                  <SubjectCard
                    subject={row.subject}
                    name={row.name}
                    onPress={() => router.push(`/subject/${row.key}`)}
                  />
                </Rise>
              ))}
            </ListGroup>
            {recent.length > 0 ? (
              <ListGroup label={t('library:recent')}>
                {recent.map((material) => (
                  <MaterialRow
                    key={material.id}
                    material={material}
                    busy={busyId === material.id}
                    disabled={busyId !== null}
                    onOpen={() => router.push(`/material/${material.id}`)}
                    onStart={(mode) => start(material.id, mode)}
                  />
                ))}
              </ListGroup>
            ) : null}
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <Screen back title={t('library:title')} state={view ? 'idle' : 'think'}>
      {content}
    </Screen>
  );
}
