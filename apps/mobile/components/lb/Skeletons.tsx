// The skeletons of the screens that load (components/lb/Skeleton.tsx): each one has the
// shape of what arrives — the practice question, the cards of "Mein Stoff", the entries
// Buddy remembers, the conversation — so nothing jumps when the real content comes.

import { View, type ViewStyle } from 'react-native';

import type { Palette } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { SKELETON } from '../../lib/theme/states.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Bone, BoneCard, BoneLines, SkeletonGroup } from './Skeleton.js';

// The measures are the shapes of the screens these stand in for, kept as they were (#311) and
// named in `SKELETON` (lib/theme/states.ts): a step of the spacing scale instead would move the
// bones, and with them the jump this file exists to avoid. A width in per cent is how much of its
// row a line of text takes; they differ on purpose, so the bones read as text and not as a grid.

/** A tinted card on the page: the question and memory cards, with Card's own padding. */
function tintCard(p: Palette): ViewStyle {
  return {
    backgroundColor: p.lavender,
    borderRadius: RADIUS.card,
    padding: SKELETON.tintPad,
  };
}

/** One of Buddy's bubbles: a card whose corner next to the orb is tucked in. */
const BUDDY_BUBBLE: ViewStyle = {
  padding: SKELETON.bubblePad,
  borderRadius: RADIUS.card,
  borderBottomLeftRadius: SKELETON.bubbleTuck,
};

/** The practice screen: where she is, the question card, the answer at the bottom. */
export function PracticeSkeleton({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <SkeletonGroup label={label} style={{ flex: 1, paddingHorizontal: SPACE.lg }}>
      {/* The header: the session's title and "Beenden". */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: SKELETON.head,
          gap: SPACE.md,
        }}
      >
        <Bone width="46%" {...SKELETON.text.title} />
        <View style={{ flex: 1 }} />
        <Bone width={SKELETON.width.end} {...SKELETON.touch} />
      </View>
      <View style={{ height: SKELETON.headRule }} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          marginBottom: SKELETON.progressGap,
        }}
      >
        <Bone width={SKELETON.width.short} {...SKELETON.text.label} />
        <Bone width="auto" {...SKELETON.progress} style={{ flex: 1 }} />
      </View>
      <View
        style={[
          tintCard(palette),
          { borderRadius: SKELETON.questionRadius, gap: SKELETON.questionGap },
        ]}
      >
        <Bone width={SKELETON.width.eyebrow} {...SKELETON.text.meta} tone="white" />
        <BoneLines
          lines={2}
          height={SKELETON.text.title.height}
          gap={SKELETON.questionLineGap}
          last="70%"
          tone="white"
        />
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingBottom: SPACE.lg }}>
        <Bone {...SKELETON.cta} />
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
        <Bone width={SKELETON.dot.height} {...SKELETON.dot} />
        <Bone width={SKELETON.width.dotLabel} {...SKELETON.text.meta} />
      </View>
      {[0, 1, 2].map((i) => (
        <BoneCard key={i}>
          <View style={{ flexDirection: 'row', gap: SKELETON.markGap, alignItems: 'center' }}>
            <Bone width={SKELETON.touch.height} {...SKELETON.touch} />
            <View style={{ flex: 1, gap: SPACE.sm }}>
              <Bone width={i === 1 ? '64%' : '82%'} {...SKELETON.text.name} />
              <Bone width="46%" {...SKELETON.text.meta} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: SKELETON.pillGap }}>
            <Bone width={SKELETON.width.shortPill} {...SKELETON.pill} />
            <Bone width={SKELETON.width.longPill} {...SKELETON.pill} />
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
    <SkeletonGroup label={label} style={{ padding: SPACE.lg, gap: SKELETON.introGap }}>
      <View style={{ paddingHorizontal: SPACE.xs }}>
        <BoneLines lines={2} height={SKELETON.text.intro.height} last="74%" />
      </View>
      <View style={{ gap: SPACE.md }}>
        <Bone
          width={SKELETON.width.medium}
          {...SKELETON.text.title}
          style={{ marginHorizontal: SPACE.xs }}
        />
        {[0, 1].map((i) => (
          <View key={i} style={[tintCard(palette), { gap: SPACE.md }]}>
            <Bone width={i === 0 ? '58%' : '72%'} {...SKELETON.text.name} tone="white" />
            <Bone width="44%" {...SKELETON.text.meta} tone="white" />
            <View style={{ flexDirection: 'row' }}>
              <Bone width={SKELETON.width.short} {...SKELETON.pill} tone="white" />
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
            <Bone width={width} {...SKELETON.touch} />
          </View>
        ) : (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
            <Bone width={SKELETON.orb.height} {...SKELETON.orb} />
            <BoneCard style={{ width, ...BUDDY_BUBBLE }}>
              <BoneLines lines={2} height={SKELETON.text.tag.height} gap={SPACE.sm} last="54%" />
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
          <Bone width={i === 1 ? '40%' : '52%'} {...SKELETON.text.heading} />
          <BoneLines lines={2} last="66%" />
          <Bone width={i === 0 ? SKELETON.width.long : SKELETON.width.medium} {...SKELETON.pill} />
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
        <Bone width="70%" {...SKELETON.text.title} />
        <Bone width="40%" {...SKELETON.text.meta} />
      </BoneCard>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[tintCard(palette), { gap: SKELETON.tagGap }]}>
          <Bone width={SKELETON.width.tag} {...SKELETON.text.tag} tone="white" />
          <BoneLines
            lines={2}
            height={SKELETON.text.label.height}
            last={i === 2 ? '44%' : '72%'}
            tone="white"
          />
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SKELETON.headGap,
          minHeight: SKELETON.head,
        }}
      >
        <Bone width={SKELETON.width.brand} {...SKELETON.touch} />
        <View style={{ flex: 1 }} />
        <Bone width={SKELETON.touch.height} {...SKELETON.touch} />
        <Bone width={SKELETON.touch.height} {...SKELETON.touch} />
      </View>
      <View
        style={{ alignItems: 'center', marginTop: SKELETON.greetingTop, marginBottom: SPACE.lg }}
      >
        <Bone width={SKELETON.width.long} {...SKELETON.text.greeting} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: SPACE.sm }}>
            <Bone width={SKELETON.touch.height} {...SKELETON.touch} />
            <Bone width={SKELETON.width.startLabel} {...SKELETON.text.tiny} />
          </View>
        ))}
      </View>
      <View
        style={{ flex: 1, justifyContent: 'flex-end', gap: SPACE.lg, paddingVertical: SPACE.lg }}
      >
        <View style={{ alignItems: 'flex-end' }}>
          <Bone width="52%" {...SKELETON.touch} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
          <Bone width={SKELETON.orb.height} {...SKELETON.orb} />
          <BoneCard style={{ width: '72%', ...BUDDY_BUBBLE }}>
            <BoneLines lines={3} height={SKELETON.text.tag.height} gap={SPACE.sm} last="48%" />
          </BoneCard>
        </View>
      </View>
      <View style={{ paddingBottom: SPACE.lg }}>
        <Bone {...SKELETON.bar} />
      </View>
    </SkeletonGroup>
  );
}
