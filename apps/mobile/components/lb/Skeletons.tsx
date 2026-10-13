// The skeletons of the screens that load (design components/core/States.jsx `SkeletonScreen`:
// chat, list, question, settings — and the app's own pages built from the same parts). Each has
// the shape of what arrives, so nothing jumps when the real content comes: where a bone stands in
// for something the loaded screen draws, its box is measured with that screen's own tokens (the
// page's margins, a list row, a line of its type) and only the bone inside is the design's.

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHAT } from '../../lib/theme/chat.js';
import { UI } from '../../lib/theme/components.js';
import { COMPOSER } from '../../lib/theme/composer.js';
import { LIBRARY } from '../../lib/theme/library.js';
import { MATERIAL_DETAIL } from '../../lib/theme/materialDetail.js';
import { PRACTICE } from '../../lib/theme/practice.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SETTINGS } from '../../lib/theme/settings.js';
import { bottomRoom, CARD_PAD, GUTTER_APP, RHYTHM, SPACE } from '../../lib/theme/space.js';
import { SKELETON } from '../../lib/theme/states.js';
import { TYPE } from '../../lib/theme/type.js';
import { Bone, BoneCard, BoneRule, BoneText, SkeletonGroup } from './Skeleton.js';

const { line, width } = SKELETON;

/** `n` of something, one under the other. */
const times = (n: number, each: (i: number) => ReactNode) =>
  Array.from({ length: n }, (_, i) => each(i));

/**
 * A group of rows on one paper card under its label — `ListGroup` and `Row` while they load
 * (States.jsx:15,24,29): the row's height and padding, its tile, the boxes of its two lines.
 */
function Rows({
  rows,
  tile = false,
  sub = false,
}: {
  rows: number;
  tile?: boolean;
  sub?: boolean;
}) {
  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={{ paddingHorizontal: SPACE.xs }}>
        <BoneText type={TYPE.label} width={width.label} height={line.meta} />
      </View>
      <BoneCard padding={0} gap={0}>
        {times(rows, (i) => (
          <View key={i}>
            {i ? <BoneRule /> : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.md,
                minHeight: UI.list.row,
                paddingHorizontal: SPACE.lg,
                paddingVertical: UI.list.padY,
              }}
            >
              {tile ? <Bone width={UI.list.tile} height={UI.list.tile} radius={RADIUS.sm} /> : null}
              <View style={{ flex: 1, gap: UI.list.lineGap }}>
                <BoneText type={TYPE.option} width={sub ? width.name : width.setting} />
                {sub ? <BoneText type={TYPE.meta} width={width.meta} height={line.meta} /> : null}
              </View>
            </View>
          </View>
        ))}
      </BoneCard>
    </View>
  );
}

/** Two lines Buddy says: in the thread they start after his orb's column (States.jsx:20). */
function BuddyLines() {
  return (
    <View style={{ paddingLeft: CHAT.orb.indent }}>
      <BoneText type={TYPE.body} width={width.long} height={line.text} />
      <BoneText type={TYPE.body} width={width.short} height={line.text} />
    </View>
  );
}

/** One bubble of hers at the end edge, as tall as a one-line message (States.jsx:21). */
function OwnBubble() {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Bone
        tone="selected"
        width={width.bubble}
        height={TYPE.body.lineHeight + CHAT.mine.paddingVertical + CHAT.mine.paddingVertical}
        radius={CHAT.mine.borderRadius}
      />
    </View>
  );
}

/** The Composer's box at rest: its padding, her line of text, the row of tools. */
const BAR = COMPOSER.pad + COMPOSER.text.height + COMPOSER.gap + COMPOSER.slot + COMPOSER.pad;

/**
 * The input bar at the bottom, where the Composer will stand, in `BottomBar`'s room. `inset`
 * where the screen leaves the bottom safe area to its bar (`Screen`); the home's loading shell
 * takes it itself.
 */
function Bar({ inset = false }: { inset?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingHorizontal: SPACE.lg,
        paddingTop: SPACE.sm,
        paddingBottom: bottomRoom(inset ? insets.bottom : 0, SPACE.md),
      }}
    >
      <Bone tone="paper" height={BAR} radius={RADIUS.bar} />
    </View>
  );
}

/** The practice screen under its head: the question card, four answers, the bar (States.jsx:25–28). */
export function PracticeSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: SPACE.lg,
          paddingTop: PRACTICE.ordinaryBody.paddingTop,
          gap: PRACTICE.ordinaryBody.gap,
        }}
      >
        <BoneCard padding={CARD_PAD.base} gap={PRACTICE.contentGap}>
          <BoneText type={TYPE.label} width={width.label} height={line.meta} />
          <View>
            <BoneText type={TYPE.question} width={width.question} height={line.question} />
            <BoneText type={TYPE.question} width={width.answer} height={line.question} />
          </View>
        </BoneCard>
        <View style={{ gap: PRACTICE.optionGap }}>
          {times(SKELETON.options, (i) => (
            <Bone key={i} tone="paper" height={PRACTICE.optionHeight} radius={RADIUS.md} />
          ))}
        </View>
      </View>
      <Bar inset />
    </SkeletonGroup>
  );
}

/** "Dein Material", a subject, the subjects of a profile: one list of rows with their tiles. */
export function LibrarySkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup
      label={label}
      style={{ paddingHorizontal: GUTTER_APP, paddingTop: LIBRARY.pageTop, gap: SPACE.xl }}
    >
      <Rows rows={SKELETON.rows} tile sub />
    </SkeletonGroup>
  );
}

/** "Was Buddy über dich weiß": the page's two lines, then what he remembers as rows. */
export function MemorySkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup
      label={label}
      style={{ paddingHorizontal: GUTTER_APP, paddingTop: LIBRARY.pageTop, gap: SPACE.xl }}
    >
      <View style={{ paddingHorizontal: SPACE.xs }}>
        <BoneText type={TYPE.paragraph} width={width.long} height={line.text} />
        <BoneText type={TYPE.paragraph} width={width.short} height={line.text} />
      </View>
      <Rows rows={SKELETON.rows} sub />
    </SkeletonGroup>
  );
}

/** A conversation: what Buddy said after his orb's column, her bubbles at the end edge. */
export function ChatSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <SkeletonGroup
      label={label}
      style={{ paddingHorizontal: GUTTER_APP, paddingTop: LIBRARY.pageTop, gap: SPACE.lg }}
    >
      {times(rows, (i) => (i % 2 ? <OwnBubble key={i} /> : <BuddyLines key={i} />))}
    </SkeletonGroup>
  );
}

/** A page of settings: two groups of rows (States.jsx:29). */
export function SettingsSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup
      label={label}
      style={{ paddingHorizontal: GUTTER_APP, paddingTop: SETTINGS.page.top, gap: SPACE.xl }}
    >
      {SKELETON.settingsGroups.map((rows, i) => (
        <Rows key={i} rows={rows} />
      ))}
    </SkeletonGroup>
  );
}

/** The questions of one sheet: a card each — which question it is, then its two lines. */
export function QuestionsSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup
      label={label}
      style={{ paddingHorizontal: GUTTER_APP, paddingTop: GUTTER_APP, gap: RHYTHM.stack }}
    >
      {times(SKELETON.cards, (i) => (
        <BoneCard key={i} gap={RHYTHM.stack}>
          <View style={{ minHeight: MATERIAL_DETAIL.menu.row, justifyContent: 'center' }}>
            <Bone width={width.label} height={line.meta} />
          </View>
          <View>
            <BoneText type={TYPE.body} width={width.long} height={line.text} />
            <BoneText
              type={TYPE.body}
              width={i % 2 ? width.name : width.short}
              height={line.text}
            />
          </View>
        </BoneCard>
      ))}
    </SkeletonGroup>
  );
}

/**
 * Buddy's home before its first load, under the real head (States.jsx:19–23, Extra.jsx:236): the
 * conversation ends at the bottom — what he said, a bubble of hers, one of his cards — above the
 * bar.
 */
export function HomeSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: SPACE.lg, gap: SPACE.lg }}>
        <BuddyLines />
        <OwnBubble />
        <BoneCard padding={CARD_PAD.thread}>
          <Bone width={width.label} height={line.meta} />
          <Bone width={width.title} height={line.text} />
          <Bone
            width={SKELETON.button.width}
            height={SKELETON.button.height}
            radius={RADIUS.round}
          />
        </BoneCard>
      </View>
      <Bar />
    </SkeletonGroup>
  );
}
