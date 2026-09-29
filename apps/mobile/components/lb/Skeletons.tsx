// The skeletons of the screens that load (components/lb/Skeleton.tsx): each one has the
// shape of what arrives — the practice question, the cards of "Mein Stoff", the entries
// Buddy remembers, the conversation — so nothing jumps when the real content comes.

import { View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Bone, BoneCard, BoneLines, SkeletonGroup } from './Skeleton.js';

/** The practice screen: where she is, the question card, the answer at the bottom. */
export function PracticeSkeleton({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <SkeletonGroup label={label} style={{ flex: 1, paddingHorizontal: 16 }}>
      {/* The header: the session's title and "Beenden". */}
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12 }}>
        <Bone width="46%" height={18} radius={9} />
        <View style={{ flex: 1 }} />
        <Bone width={96} height={44} radius={22} />
      </View>
      <View style={{ height: 4 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <Bone width={84} height={14} radius={7} />
        <Bone width="auto" height={8} radius={4} style={{ flex: 1 }} />
      </View>
      <View style={{ backgroundColor: palette.lavender, borderRadius: 24, padding: 18, gap: 14 }}>
        <Bone width={120} height={12} radius={6} tone="white" />
        <BoneLines lines={2} height={18} gap={10} last="70%" tone="white" />
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingBottom: 16 }}>
        <Bone height={54} radius={27} />
      </View>
    </SkeletonGroup>
  );
}

/** "Mein Stoff": a subject heading and a few sheets with their buttons. */
export function LibrarySkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
        <Bone width={10} height={10} radius={5} />
        <Bone width={70} height={12} radius={6} />
      </View>
      {[0, 1, 2].map((i) => (
        <BoneCard key={i}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Bone width={44} height={44} radius={22} />
            <View style={{ flex: 1, gap: 8 }}>
              <Bone width={i === 1 ? '64%' : '82%'} height={15} radius={7} />
              <Bone width="46%" height={12} radius={6} />
            </View>
          </View>
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
    <SkeletonGroup label={label} style={{ padding: 16, gap: 22 }}>
      <View style={{ paddingHorizontal: 4 }}>
        <BoneLines lines={2} height={13} last="74%" />
      </View>
      <View style={{ gap: 12 }}>
        <Bone width={110} height={18} radius={9} style={{ marginHorizontal: 4 }} />
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{ backgroundColor: palette.lavender, borderRadius: 22, padding: 18, gap: 12 }}
          >
            <Bone width={i === 0 ? '58%' : '72%'} height={15} radius={7} tone="white" />
            <Bone width="44%" height={12} radius={6} tone="white" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
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
    <SkeletonGroup label={label} style={{ padding: 16, gap: 16 }}>
      {Array.from({ length: rows }, (_, i) => {
        const mine = i % 2 === 0;
        const width = widths[i % widths.length] ?? '60%';
        return mine ? (
          <View key={i} style={{ alignItems: 'flex-end' }}>
            <Bone width={width} height={44} radius={22} />
          </View>
        ) : (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Bone width={26} height={26} radius={13} />
            <BoneCard style={{ width, padding: 14, borderRadius: 22, borderBottomLeftRadius: 6 }}>
              <BoneLines lines={2} height={11} gap={8} last="54%" />
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
    <SkeletonGroup label={label} style={{ padding: 16, gap: 16 }}>
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
    <SkeletonGroup label={label} style={{ padding: 16, gap: 12 }}>
      <BoneCard>
        <Bone width="70%" height={18} radius={9} />
        <Bone width="40%" height={12} radius={6} />
      </BoneCard>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{ backgroundColor: palette.lavender, borderRadius: 22, padding: 18, gap: 10 }}
        >
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
    <SkeletonGroup label={label} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 }}>
        <Bone width={104} height={44} radius={22} />
        <View style={{ flex: 1 }} />
        <Bone width={44} height={44} radius={22} />
        <Bone width={44} height={44} radius={22} />
      </View>
      <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 16 }}>
        <Bone width={150} height={22} radius={11} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: 8 }}>
            <Bone width={44} height={44} radius={22} />
            <Bone width={52} height={10} radius={5} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end', gap: 16, paddingVertical: 16 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Bone width="52%" height={44} radius={22} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <Bone width={26} height={26} radius={13} />
          <BoneCard
            style={{ width: '72%', padding: 14, borderRadius: 22, borderBottomLeftRadius: 6 }}
          >
            <BoneLines lines={3} height={11} gap={8} last="48%" />
          </BoneCard>
        </View>
      </View>
      <View style={{ paddingBottom: 16 }}>
        <Bone height={56} radius={28} />
      </View>
    </SkeletonGroup>
  );
}
