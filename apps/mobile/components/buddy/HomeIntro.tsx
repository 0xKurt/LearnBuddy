// First-visit Home: Buddy stays in the shared header; the real learner greeting and
// three ways to start stand directly above the shared Composer (#548), 24 in from the sides and
// from the bar (design ui_kits/app/Home.jsx:12).
//
// While pages are attached, the greeting and the ways to start are not drawn (#599 correction,
// CLAUDE.md rule 16: whole or not drawn): the strip of pages took their room, the list was cut
// after its first row at 360×740 and the headline under the strip in a short window. They are
// back when the pages are gone; what she is doing now is sending her sheet.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { HOME } from '../../lib/theme/home.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { TYPE } from '../../lib/theme/type.js';
import { whenText } from './describe.js';
import { introMark } from './extensions.js';

type Props = {
  h: BuddyHome;
  refreshing: boolean;
  onRefresh: () => void;
  onSend: (text: string) => void;
  onPhoto: () => void;
  /** Pages stand above the Composer. */
  pages?: boolean;
};

export function HomeIntro({ h, refreshing, onRefresh, onSend, onPhoto, pages = false }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  // The next test or talk (#264) in one line; everything else Buddy says in the conversation.
  const nextExam = h.next.find((i) => i.kind === 'exam' || i.kind === 'talk') ?? null;
  if (pages) return <View style={{ flex: 1 }} />;
  return (
    <ScrollView
      testID="scroll-home"
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: SPACE.xl,
        paddingBottom: SPACE.xl,
        gap: HOME.sections,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ gap: HOME.greetingGap }}>
        <Text accessibilityRole="header" style={[TYPE.display, { color: palette.ink }]}>
          {t('buddy:intro.hello', { name: h.learner.name })}
          {'\n'}
          {t('buddy:greeting_ask')}
        </Text>
        {nextExam ? (
          <Text style={[TYPE.meta, { color: palette.ink2 }]}>
            {t('buddy:next.line', {
              title: nextExam.title,
              when: nextExam.date ? whenText(nextExam.date, nextExam.time) : '',
            })}
          </Text>
        ) : null}
        {/* A domain's quiet mark beside the greeting (the learning domain: "Heute geübt ✓"). */}
        {introMark.get()?.(h) ?? null}
        {/* First visit: one sentence. */}
        <Text style={[TYPE.body, { color: palette.ink2 }]}>{t('buddy:intro.body')}</Text>
      </View>
      <ListGroup>
        <Row
          icon="calendar"
          title={t('buddy:suggest.exam')}
          chevron={false}
          onPress={() => onSend(t('buddy:suggest.exam'))}
        />
        <Row icon="camera" title={t('buddy:intro.photo')} chevron={false} onPress={onPhoto} />
        <Row
          icon="sparkle"
          title={t('buddy:intro.practice')}
          chevron={false}
          onPress={() => onSend(t('buddy:intro.practice'))}
        />
      </ListGroup>
    </ScrollView>
  );
}
