// The conversation on Buddy's home, once there is one: what she is working on in one line, the
// thread standing at its newest message unless she scrolled up to read (lib/buddy/useThreadFollow),
// its fade under the head, and "↓ Neue Antwort" when Buddy answered meanwhile.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { ThreadFollow } from '../../lib/buddy/useThreadFollow.js';
import { fadeOut, riseIn } from '../../lib/theme/enter.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { CONTROL, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { TopEdgeFade, topEdgeMaskFrom } from '../lb/EdgeFade.js';
import { TextLink } from '../lb/TextLink.js';
import { RoleplayStrip } from './RoleplayCard.js';

type Props = {
  h: BuddyHome;
  follow: ThreadFollow;
  /** "↓ Neue Antwort": she scrolled up and Buddy answered (or is writing) meanwhile. */
  pill: boolean;
  /** How tall the card lying over the conversation is (0 = none). */
  cardHeight: number;
  refreshing: boolean;
  onRefresh: () => void;
  /** The conversation itself. */
  children: ReactNode;
};

export function HomeThread({
  h,
  follow,
  pill,
  cardHeight,
  refreshing,
  onRefresh,
  children,
}: Props) {
  /** Where the conversation starts (the line on top ends): for its fade-out. */
  const [threadTop, setThreadTop] = useState(0);
  /** Where the conversation is first seen while a card lies on top of it (issue #287). */
  const underCard = cardHeight > 0 ? cardHeight + SPACE.sm : 0;
  return (
    <>
      {/* What she is working on, in her own words (issue #160). One line, and only when there
          is something — an empty slot waiting to be filled would be a dashboard (rule 16).
          Tapping opens the sheet it is about. */}
      <View
        style={{ paddingHorizontal: SPACE.lg, paddingBottom: h.focus || h.roleplay ? SPACE.xs : 0 }}
        // Where the conversation starts (for its fade-out under the head).
        onLayout={(e) => setThreadTop(e.nativeEvent.layout.height)}
      >
        <WorkingOn h={h} />
      </View>
      <ScrollView
        ref={follow.scroll}
        testID="scroll-thread"
        // The fade starts where the view is first seen: under the slim bar while one lies on
        // top (issue #287), at the view's own top otherwise. Under the bar it starts an sm
        // further down: a tinted offer card half-faded right at the bar's edge still read as a
        // lavender sliver in the first round of shots.
        style={[{ flex: 1 }, topEdgeMaskFrom(underCard - threadTop)]}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.md,
          // sm here + the composer's xs on top: md from the last bubble to the pill, on the
          // scale like the sm between turns (issue #51). The same numbers as the thread's tail
          // in talk.tsx.
          paddingBottom: SPACE.sm,
          gap: SPACE.sm,
        }}
        keyboardShouldPersistTaps="handled"
        onScroll={follow.onScroll}
        scrollEventThrottle={64}
        onLayout={follow.onLayout}
        onContentSizeChange={follow.follow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {children}
      </ScrollView>
      {/* A message scrolled up under the head fades out there instead of a hard-cut violet
          sliver (live finding 8). It used to be left out whenever a card was open — on the idea
          that the card covers the edge itself — and that is exactly when the lavender stripe
          was measured on the phone (issue #170): the card ends a few pixels above where the
          thread begins. The card sits above this anyway (zIndex 10 against 1), so drawing it
          always costs nothing and closes the gap.
          `threadTop` is 0 whenever there is no focus line — and 0 is where the conversation
          starts then, not a reason to leave the fade out. On the phone that showed as a
          message sliced off hard under the head (seen on the Xiaomi, 01.10.), the very fault
          this exists to remove.
          …and under a card lying on top it starts at the card's lower edge: the fade at the
          thread's top sat hidden behind the card, so a bubble scrolled under it was cut off
          hard right where the card ends (issue #287). This fade is opaque at its own top, so
          it starts right at the card's edge. */}
      <TopEdgeFade top={Math.max(threadTop, cardHeight)} />
      {pill ? <NewReplyPill onPress={follow.toEnd} /> : null}
    </>
  );
}

/** A running roleplay takes the line: its way out stays in reach (#244). Else her focus. */
function WorkingOn({ h }: { h: BuddyHome }) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  if (h.roleplay) return <RoleplayStrip roleplay={h.roleplay} />;
  if (!h.focus) return null;
  const materialId = h.focus.material_id;
  return (
    <TextLink
      accessibilityLabel={t('buddy:focus.label', { what: h.focus.text })}
      onPress={materialId ? () => router.push(`/material/${materialId}`) : undefined}
      style={[TYPE.small, { color: palette.ink3, textAlign: 'center' }]}
    >
      {h.focus.text}
    </TextLink>
  );
}

/** The round ends of a small pill button (it is CONTROL.sm tall, components/lb/Btn.tsx). */
const PILL_ROUND = CONTROL.sm / 2;

/** "↓ Neue Antwort": floats over the conversation's end and brings her back to it. */
function NewReplyPill({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('buddy');
  return (
    <Animated.View
      entering={riseIn(0)}
      exiting={fadeOut()}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: SPACE.md, alignItems: 'center' }}
    >
      {/* The shadow follows the pill's own round ends. */}
      <View style={[{ borderRadius: PILL_ROUND }, SHADOW.float]}>
        <Btn
          size="sm"
          pill
          variant="outline"
          accessibilityLabel={t('buddy:thread.new_reply_label')}
          onPress={onPress}
        >
          {`↓ ${t('buddy:thread.new_reply')}`}
        </Btn>
      </View>
    </Animated.View>
  );
}
