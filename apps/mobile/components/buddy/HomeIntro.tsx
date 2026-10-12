// First-visit Home: Buddy stays in the shared header; the real learner greeting and
// three ways to start stand directly above the shared Composer (#548).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { RADIUS } from '../../lib/theme/radius.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { UI } from '../../lib/theme/components.js';
import { HOME } from '../../lib/theme/home.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';
import { whenText } from './describe.js';

type Props = {
  /** Photos share the compact room; the greeting and all starts remain whole. */
  compact?: boolean;
  h: BuddyHome;
  refreshing: boolean;
  onRefresh: () => void;
  onSend: (text: string) => void;
  onPhoto: () => void;
};

export function HomeIntro({ h, refreshing, onRefresh, onSend, onPhoto, compact = false }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  // The next test or talk (#264) in one line; everything else Buddy says in the conversation.
  const nextExam = h.next.find((i) => i.kind === 'exam' || i.kind === 'talk') ?? null;
  return (
    <ScrollView
      testID="scroll-home"
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'flex-end',
        padding: SPACE.lg,
        gap: compact ? SPACE.lg : HOME.sections,
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
        {h.practiced_today ? <PracticedToday label={t('buddy:practiced_today')} /> : null}
        {/* First visit: one sentence. */}
        <Text style={[TYPE.body, { color: palette.ink2 }]}>{t('buddy:intro.body')}</Text>
      </View>
      <ListGroup>
        <Row
          icon="calendar"
          iconTone="accent"
          iconSize={UI.iconButton.glyph}
          title={t('buddy:suggest.exam')}
          chevron={false}
          onPress={() => onSend(t('buddy:suggest.exam'))}
        />
        <Row
          iconTone="accent"
          iconSize={UI.iconButton.glyph}
          icon="camera"
          title={t('buddy:intro.photo')}
          chevron={false}
          onPress={onPhoto}
        />
        <Row
          icon="sparkle"
          iconTone="accent"
          iconSize={UI.iconButton.glyph}
          title={t('buddy:intro.practice')}
          chevron={false}
          onPress={() => onSend(t('buddy:intro.practice'))}
        />
      </ListGroup>
    </ScrollView>
  );
}

/** The quiet "Heute geübt ✓" beside the greeting: a mark of what she did, never a number. */
function PracticedToday({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        alignItems: 'center',
        gap: SPACE.xs,
        paddingHorizontal: HOME.practiced.horizontal,
        paddingVertical: HOME.practiced.vertical,
        borderRadius: RADIUS.round,
        backgroundColor: palette.mint,
      }}
    >
      <Icon name="check" size={HOME.practiced.icon} color={palette.successText} />
      <Text style={[TYPE.label, { color: palette.successText }]}>{label}</Text>
    </View>
  );
}
