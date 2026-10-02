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
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SubjectCard } from '../components/library/SubjectCard.js';
import { byActivity, hasSomething } from '../components/library/subjects.js';
import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { Rise, useListEntrance } from '../components/lb/Motion.js';
import { Screen } from '../components/lb/Screen.js';
import { LibrarySkeleton } from '../components/lb/Skeletons.js';
import { useLibrary } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { bottomRoom, SPACE } from '../lib/theme/space.js';
import type { LibrarySubject } from '@learnbuddy/shared-types/contracts';

/** One card in the list: a subject of hers, or the sheets whose subject is not known yet. */
type Row = { key: string; name: string; subject: LibrarySubject | null };

export default function LibraryScreen() {
  const { palette } = useTheme();
  const { t } = useTranslation(['library', 'common']);
  const library = useLibrary();
  const insets = useSafeAreaInsets();
  const [pulling, setPulling] = useState(false);

  const view = library.data;
  const rows: Row[] = [];
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

  const openCapture = () => router.push('/capture');

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
        <ScrollView
          testID="scroll-list"
          contentContainerStyle={{
            padding: SPACE.lg,
            paddingBottom: SPACE.xl,
            gap: SPACE.md,
            ...(rows.length === 0 ? { flexGrow: 1 } : null),
          }}
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
        >
          {rows.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                orb
                title={t('library:empty.title')}
                action={
                  // Body text sits here at 16 px (EmptyState's own body is smaller).
                  <View style={{ alignItems: 'center', gap: SPACE.lg }}>
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
          ) : (
            rows.map((row, index) => (
              <Rise key={row.key} animate={entering(index)} index={index}>
                <SubjectCard
                  subject={row.subject}
                  name={row.name}
                  onPress={() => router.push(`/subject/${row.key}`)}
                />
              </Rise>
            ))
          )}
        </ScrollView>
        {rows.length > 0 ? (
          <View
            style={{
              paddingHorizontal: SPACE.lg,
              paddingTop: SPACE.sm,
              paddingBottom: bottomRoom(insets.bottom),
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

  return (
    <Screen back title={t('library:title')}>
      {content}
    </Screen>
  );
}
