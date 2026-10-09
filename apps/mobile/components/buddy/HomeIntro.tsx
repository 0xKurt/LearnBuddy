// Buddy's home before there is a conversation: the status line, centred — the next test in one
// line, or Buddy asking what is up — and one sentence of what Buddy is. The ring of circles
// around Buddy is gone, and so is the big orb that stood in it (issue #174): Buddy is in the head
// now, on every screen, and the same ball twice on one screen reads as a mistake.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { RADIUS } from '../../lib/theme/radius.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { RHYTHM, SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';
import { whenText } from './describe.js';

type Props = {
  h: BuddyHome;
  refreshing: boolean;
  onRefresh: () => void;
};

export function HomeIntro({ h, refreshing, onRefresh }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  // The next test in one line; everything else Buddy says in the conversation.
  const nextExam = h.next.find((i) => i.kind === 'exam') ?? null;
  return (
    <ScrollView
      testID="scroll-home"
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        padding: SPACE.lg,
        gap: RHYTHM.sections,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* The status line: centred, well below the slim bar's room on top. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          columnGap: SPACE.sm,
          rowGap: SPACE.xs,
        }}
      >
        <Text
          numberOfLines={2}
          style={[TYPE.body, { color: palette.ink2, textAlign: 'center', fontWeight: '500' }]}
        >
          {nextExam
            ? t('buddy:next.line', {
                title: nextExam.title,
                when: nextExam.date ? whenText(nextExam.date, nextExam.time) : '',
              })
            : t('buddy:greeting_ask')}
        </Text>
        {h.practiced_today ? <PracticedToday label={t('buddy:practiced_today')} /> : null}
      </View>
      {/* First visit: one sentence. */}
      <Text
        style={[
          TYPE.body,
          { color: palette.ink2, textAlign: 'center', paddingHorizontal: SPACE.md },
        ]}
      >
        {t('buddy:intro.body')}
      </Text>
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
        alignItems: 'center',
        gap: SPACE.xs,
        paddingHorizontal: 9, // token-exempt: the mark is smaller than Chip; one pill is #311 slice 13
        paddingVertical: 3, // token-exempt: the mark is smaller than Chip; one pill is #311 slice 13
        borderRadius: RADIUS.round,
        backgroundColor: palette.mint,
      }}
    >
      <Icon name="check" size={13} color={palette.successText} />
      <Text style={[TYPE.label, { color: palette.successText }]}>{label}</Text>
    </View>
  );
}
