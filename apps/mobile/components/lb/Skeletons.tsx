// The skeletons of the screens that load (components/lb/Skeleton.tsx): each one has the
// shape of what arrives — the practice question, the cards of "Mein Stoff", the entries
// Buddy remembers, the conversation — so nothing jumps when the real content comes.

import { View, type ViewStyle } from 'react-native';

import type { Palette } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Bone, BoneCard, BoneLines, SkeletonGroup } from './Skeleton.js';

// The numbers off the spacing scale below are the shapes of the screens these stand in for,
// kept as they were (#311): a step instead would move the bones, and with them the jump this
// file exists to avoid.

/** A tinted card on the page: the question and memory cards, with Card's own padding. */
function tintCard(p: Palette): ViewStyle {
  return {
    backgroundColor: p.lavender,
    borderRadius: RADIUS.card,
    padding: 18, // token-exempt: Card's own padding (components/lb/Card.tsx)
  };
}

/** One of Buddy's bubbles: a card whose corner next to the orb is tucked in. */
const BUDDY_BUBBLE: ViewStyle = {
  padding: 14, // token-exempt: bubble's inner room, kept as drawn (see top)
  borderRadius: RADIUS.card,
  borderBottomLeftRadius: 6, // token-exempt: tucked corner of a chat bubble (Conversation)
};

/** The practice screen: where she is, the question card, the answer at the bottom. */
export function PracticeSkeleton({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <SkeletonGroup label={label} style={{ flex: 1, paddingHorizontal: SPACE.lg }}>
      {/* The header: the session's title and "Beenden". */}
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: SPACE.md }}>
        <Bone width="46%" height={18} radius={9} />
        <View style={{ flex: 1 }} />
        <Bone width={96} height={44} radius={22} />
      </View>
      <View style={{ height: 4 }} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          marginBottom: 10, // token-exempt: progress row to question card, kept as drawn (see top)
        }}
      >
        <Bone width={84} height={14} radius={7} />
        <Bone width="auto" height={8} radius={4} style={{ flex: 1 }} />
      </View>
      {/* token-exempt: question card's 24 corner and 14 gap, kept as drawn (see top) */}
      <View style={[tintCard(palette), { borderRadius: 24, gap: 14 }]}>
        <Bone width={120} height={12} radius={6} tone="white" />
        {/* token-exempt: question lines 10 apart, kept as drawn (see top) */}
        <BoneLines lines={2} height={18} gap={10} last="70%" tone="white" />
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingBottom: SPACE.lg }}>
        <Bone height={54} radius={27} />
      </View>
    </SkeletonGroup>
  );
}

/** "Mein Stoff": a subject heading and a few sheets with their buttons. */
export function LibrarySkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} style={{ padding: SPACE.lg, gap: SPACE.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.xs,
        }}
      >
        <Bone width={10} height={10} radius={5} />
        <Bone width={70} height={12} radius={6} />
      </View>
      {[0, 1, 2].map((i) => (
        <BoneCard key={i}>
          {/* token-exempt: subject mark 14 from its name, kept as drawn (see top) */}
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Bone width={44} height={44} radius={22} />
            <View style={{ flex: 1, gap: SPACE.sm }}>
              <Bone width={i === 1 ? '64%' : '82%'} height={15} radius={7} />
              <Bone width="46%" height={12} radius={6} />
            </View>
          </View>
          {/* token-exempt: two pill buttons 10 apart, kept as drawn (see top) */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Bone width={72} height={40} radius={20} />
            <Bone width={128} height={40} radius={20} />
          </View>
        </BoneCard>
      ))}
    </SkeletonGroup>
  );
}

/** "Was Buddy über dich weiß": the intro, a heading and the entries. */
export function MemorySkeleton({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <SkeletonGroup
      label={label}
      // token-exempt: intro to entries, kept as drawn (see top)
      style={{ padding: SPACE.lg, gap: 22 }}
    >
      <View style={{ paddingHorizontal: SPACE.xs }}>
        <BoneLines lines={2} height={13} last="74%" />
      </View>
      <View style={{ gap: SPACE.md }}>
        <Bone width={110} height={18} radius={9} style={{ marginHorizontal: SPACE.xs }} />
        {[0, 1].map((i) => (
          <View key={i} style={[tintCard(palette), { gap: SPACE.md }]}>
            <Bone width={i === 0 ? '58%' : '72%'} height={15} radius={7} tone="white" />
            <Bone width="44%" height={12} radius={6} tone="white" />
            <View style={{ flexDirection: 'row' }}>
              <Bone width={84} height={40} radius={20} tone="white" />
            </View>
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** A conversation: her bubbles on the right, Buddy's on the left with the small orb. */
export function ChatSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  const widths = ['56%', '70%', '38%', '62%', '48%', '66%'] as const;
  return (
    <SkeletonGroup label={label} style={{ padding: SPACE.lg, gap: SPACE.lg }}>
      {Array.from({ length: rows }, (_, i) => {
        const mine = i % 2 === 0;
        const width = widths[i % widths.length] ?? '60%';
        return mine ? (
          <View key={i} style={{ alignItems: 'flex-end' }}>
            <Bone width={width} height={44} radius={22} />
          </View>
        ) : (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
            <Bone width={26} height={26} radius={13} />
            <BoneCard style={{ width, ...BUDDY_BUBBLE }}>
              <BoneLines lines={2} height={11} gap={SPACE.sm} last="54%" />
            </BoneCard>
          </View>
        );
      })}
    </SkeletonGroup>
  );
}

/** A screen of settings: a few white cards with a heading and two rows. */
export function SettingsSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} style={{ padding: SPACE.lg, gap: SPACE.lg }}>
      {[0, 1, 2].map((i) => (
        <BoneCard key={i}>
          <Bone width={i === 1 ? '40%' : '52%'} height={16} radius={8} />
          <BoneLines lines={2} height={12} last="66%" />
          <Bone width={i === 0 ? 150 : 110} height={40} radius={20} />
        </BoneCard>
      ))}
    </SkeletonGroup>
  );
}

/** The questions of one sheet: the sheet's card, then a few question cards. */
export function QuestionsSkeleton({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <SkeletonGroup label={label} style={{ padding: SPACE.lg, gap: SPACE.md }}>
      <BoneCard>
        <Bone width="70%" height={18} radius={9} />
        <Bone width="40%" height={12} radius={6} />
      </BoneCard>
      {[0, 1, 2].map((i) => (
        // token-exempt: question tag 10 above its lines, kept as drawn (see top)
        <View key={i} style={[tintCard(palette), { gap: 10 }]}>
          <Bone width={90} height={11} radius={6} tone="white" />
          <BoneLines lines={2} height={14} last={i === 2 ? '44%' : '72%'} tone="white" />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Buddy's home before its first load: the header, the greeting, the start row, the chat, the field. */
export function HomeSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup
      label={label}
      style={{ flex: 1, paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm }}
    >
      {/* token-exempt: head buttons 10 apart, kept as drawn (see top) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 }}>
        <Bone width={104} height={44} radius={22} />
        <View style={{ flex: 1 }} />
        <Bone width={44} height={44} radius={22} />
        <Bone width={44} height={44} radius={22} />
      </View>
      {/* token-exempt: greeting 18 under the head, kept as drawn (see top) */}
      <View style={{ alignItems: 'center', marginTop: 18, marginBottom: SPACE.lg }}>
        <Bone width={150} height={22} radius={11} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: SPACE.sm }}>
            <Bone width={44} height={44} radius={22} />
            <Bone width={52} height={10} radius={5} />
          </View>
        ))}
      </View>
      <View
        style={{ flex: 1, justifyContent: 'flex-end', gap: SPACE.lg, paddingVertical: SPACE.lg }}
      >
        <View style={{ alignItems: 'flex-end' }}>
          <Bone width="52%" height={44} radius={22} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
          <Bone width={26} height={26} radius={13} />
          <BoneCard style={{ width: '72%', ...BUDDY_BUBBLE }}>
            <BoneLines lines={3} height={11} gap={SPACE.sm} last="48%" />
          </BoneCard>
        </View>
      </View>
      <View style={{ paddingBottom: SPACE.lg }}>
        <Bone height={56} radius={28} />
      </View>
    </SkeletonGroup>
  );
}
