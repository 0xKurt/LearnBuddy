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
import { bottomRoom, CARD_PAD, CONTROL, GUTTER_APP, RHYTHM, SPACE } from '../../lib/theme/space.js';
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
  label = true,
}: {
  rows: number;
  tile?: boolean;
  sub?: boolean;
  /** False for a group that has none (her card in the settings, the one choice of a page). */
  label?: boolean;
}) {
  return (
    <View style={{ gap: SPACE.sm }}>
      {label ? (
        <View style={{ paddingHorizontal: SPACE.xs }}>
          <BoneText type={TYPE.label} width={width.label} height={line.meta} />
        </View>
      ) : null}
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

/**
 * The quiet words a page opens with (`Hint`, components/settings/SettingsPage.tsx: 14/20, 4 in
 * from the groups): as many lines as the page has, the last one shorter.
 */
function Lead({ lines }: { lines: number }) {
  return (
    <View style={{ paddingHorizontal: SPACE.xs }}>
      {times(lines, (i) => (
        <BoneText
          key={i}
          type={TYPE.meta}
          width={i === lines - 1 ? width.short : width.long}
          height={line.meta}
        />
      ))}
    </View>
  );
}

/**
 * "Dein Material" and a subject: one list of rows with their tiles. `capture` where the page
 * opens with the button for a new sheet (app/library.tsx) — its box, round like the button.
 */
export function LibrarySkeleton({ label, capture = false }: { label: string; capture?: boolean }) {
  return (
    <SkeletonGroup
      label={label}
      style={{ paddingHorizontal: GUTTER_APP, paddingTop: LIBRARY.pageTop, gap: SPACE.xl }}
    >
      {capture ? <Bone tone="paper" height={CONTROL.md} radius={RADIUS.round} /> : null}
      <Rows rows={SKELETON.rows} tile sub />
    </SkeletonGroup>
  );
}

/**
 * One group of rows with their tiles inside a page that is already there (the subjects of a
 * profile): the group's own box, with no page around it.
 */
export function GroupSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label}>
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

/**
 * What a settings page opens with before its groups: her card (the settings themselves), one
 * line of what holds over a group without a label ("Aufs Handy"), or its opening paragraph
 * ("Lernzeiten").
 */
export type SettingsStart = 'profile' | 'answer' | 'lead';

/** A page of settings: two groups of rows (States.jsx:29), after what the page opens with. */
export function SettingsSkeleton({ label, start }: { label: string; start?: SettingsStart }) {
  return (
    <SkeletonGroup
      label={label}
      style={{ paddingHorizontal: GUTTER_APP, paddingTop: SETTINGS.page.top, gap: SPACE.xl }}
    >
      {start === 'profile' ? <Rows rows={1} tile sub label={false} /> : null}
      {start === 'answer' || start === 'lead' ? (
        <Lead lines={start === 'lead' ? SKELETON.leadLines : 1} />
      ) : null}
      {SKELETON.settingsGroups.map((rows, i) => (
        <Rows key={i} rows={rows} label={!(start === 'answer' && i === 0)} />
      ))}
    </SkeletonGroup>
  );
}

const PAGES = MATERIAL_DETAIL.pages;

/**
 * The questions of one sheet: the sheet's page pinned under the head, in the strip's own box
 * (components/library/SheetPages.tsx), then a card each — which question it is, its two lines.
 */
export function QuestionsSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label}>
      <View
        style={{
          flexDirection: 'row',
          marginTop: PAGES.top,
          marginHorizontal: PAGES.side,
          minHeight: PAGES.height,
        }}
      >
        <Bone tone="paper" width={PAGES.width} height={PAGES.height} radius={PAGES.radius} />
      </View>
      <View style={{ paddingHorizontal: GUTTER_APP, paddingTop: GUTTER_APP, gap: RHYTHM.stack }}>
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
      </View>
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
