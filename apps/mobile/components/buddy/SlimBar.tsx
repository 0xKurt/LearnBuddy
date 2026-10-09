// The slim bars on top of Buddy's home (owner request: the reading / ready card was "ein
// Riesenbrett"; issue #17 made the pattern the rule): one line of what is happening, about
// 60 pt tall — a small photo or mark, a short status, the reading's stage dots inline, and
// the one action as a compact button. A NAME may take a second line rather than end in "…"
// (issue #204: "Arbeitsbla…" and "Vokabelliste E…" on a 360 pt phone hid the one thing she
// had to recognise); the bar then grows by that one line, and only while it is needed. A bar with more to say (the stage names, "du kannst die
// App schließen", which test, "Heute nicht", "Kein Foto nötig") opens it on a tap; a bar whose
// line says it all (resume) has no expanded state. Screen readers hear it all in one label. Closing
// and swiping it away stay with the layer on top (TopOverlay). docs/architecture.md §Home.

import type { NowCard } from '@learnbuddy/shared-types/contracts';
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { readingView, type ReadingView, type StepState } from '../../lib/buddy/readingStages.js';
import type { Palette } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { fadeIn } from '../../lib/theme/enter.js';
import { EASE } from '../../lib/theme/motion.js';
import { around, circle } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { RHYTHM, SPACE, TOUCH } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn, MAX_FONT_SCALE } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { PressArea } from '../lb/PressArea.js';
import { PhotoThumb, ZoomablePhoto } from '../lb/ZoomViewer.js';
import { whenText } from './describe.js';

type Processing = Extract<NowCard, { type: 'material_processing' }>;
type Ready = Extract<NowCard, { type: 'practice_ready' }>;
type Resume = Extract<NowCard, { type: 'resume_practice' }>;
type Capture = Extract<NowCard, { type: 'capture_needed' }>;

// Theme values come from the palette the bar renders with, never frozen in module constants.
function titleStyle(p: Palette) {
  return {
    fontSize: TYPE.small.fontSize,
    lineHeight: 20, // token-exempt: the name a line tighter than TYPE.small, two lines fit 60 pt
    fontWeight: '700' as const,
    color: p.ink,
  };
}
function lineStyle(p: Palette) {
  return { fontSize: TYPE.label.fontSize, lineHeight: TYPE.label.lineHeight, color: p.ink2 };
}

/** The photo on a reading bar: its corner, and the white frame around it (concentric). */
const THUMB_CORNER = 5; // token-exempt: the 30 × 38 photo's corner, smaller than RADIUS.cell
const THUMB_FRAME = 2; // token-exempt: the hairline of paper around the photo

/** The status line's box, tappable or not: at least a finger tall. */
const TEXT_BOX = {
  flex: 1,
  minHeight: TOUCH,
  justifyContent: 'center',
  paddingVertical: SPACE.sm,
} as const;

/** What an opened bar says in a sentence. */
function Detail({ children }: { children: string }) {
  // token-exempt: TYPE.caption's 14 on a 20 line, the opened bar's reading size
  return <Text style={[TYPE.caption, { lineHeight: 20 }]}>{children}</Text>;
}

/**
 * Everything a bar says, as one sentence for a screen reader. Parts that already end in a
 * full stop keep it instead of getting a second one ("… 5 Min.. Für …" was what a plain
 * join produced once the lines became sentences, issue #204).
 */
function saidTogether(parts: ReadonlyArray<string | null>): string {
  return parts
    .map((p) => p?.trim() ?? '')
    .filter((p) => p !== '')
    .reduce((all, p) => (all === '' ? p : `${all}${/[.!?…]$/.test(all) ? '' : '.'} ${p}`), '');
}

function Bar({
  tone,
  leading,
  title,
  line,
  action,
  details,
  label,
  titleInset,
}: {
  tone: 'sky' | 'primaryLt' | 'peach';
  leading?: ReactNode;
  title: string;
  line: ReactNode;
  action?: ReactNode;
  /** More the bar has to say, opened on a tap; a bar whose line says it all has none. */
  details?: ReactNode;
  /** Everything the bar says, for a screen reader (details included). */
  label: string;
  titleInset: number;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const [open, setOpen] = useState(false);
  const text = (
    <>
      {/* The bar carries a size contract (issue #17): ~60 pt while its texts fit one line,
          and it follows the system size only to the control cap (M-84, issue #73).
          TWO lines for the name, not one with "…" (issue #204): "Vokabelliste E…" hides the
          very thing she has to recognise — which sheet this is. A second line costs 20 pt
          and only when the name needs it; a cut-off name costs her the answer. */}
      <Animated.Text
        key={title}
        entering={fadeIn()}
        numberOfLines={2}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={titleStyle(palette)}
      >
        {title}
      </Animated.Text>
      {/* token-exempt: one point between the name and its line */}
      <View style={{ marginTop: 1 }}>{line}</View>
    </>
  );
  return (
    <Card tone={tone} padding={0} radius={20}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 60,
          paddingLeft: leading ? 10 : SPACE.lg, // token-exempt: tighter beside a photo or mark
          paddingRight: titleInset + SPACE.xs,
          gap: RHYTHM.parts,
        }}
      >
        {leading ?? null}
        {details ? (
          <PressArea
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={open ? t('now.less') : t('now.more')}
            accessibilityState={{ expanded: open }}
            style={TEXT_BOX}
          >
            {text}
          </PressArea>
        ) : (
          <View accessible accessibilityLabel={label} style={TEXT_BOX}>
            {text}
          </View>
        )}
        {action}
      </View>
      {open && details ? (
        <Animated.View
          entering={fadeIn()}
          style={{
            paddingHorizontal: 14, // token-exempt: the opened part's inset, 14 inside the bar's 20 corner
            paddingBottom: SPACE.md,
            paddingTop: 10, // token-exempt: under the divider, a little less than at the bottom
            gap: SPACE.sm,
            borderTopWidth: 1,
            borderTopColor: palette.hairline,
          }}
        >
          {details}
        </Animated.View>
      ) : null}
    </Card>
  );
}

/**
 * Her sheet being read: photo, status, the stage dots — the rest on a tap. The pages
 * she just sent stand in the opened bar as thumbnails, each one shown large on a tap
 * (issue #57: "eine vorschau von den bildern sieht man auch nicht"), for as long as
 * the photos are on the phone anyway — nothing is kept longer for them.
 */
export function ReadingBar({
  card,
  pages,
  preparing,
  titleInset,
}: {
  card: Processing;
  /** The photos of this sheet while they are still on the phone, in page order. */
  pages: readonly string[];
  preparing: boolean;
  titleInset: number;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'capture']);
  const thumb = pages[0] ?? null;
  const view = readingView(card, preparing);
  const title = t(
    view.title.key,
    view.title.count !== undefined ? { count: view.title.count } : {},
  );
  const body = t(view.body.key, view.body.count !== undefined ? { count: view.body.count } : {});
  const active = view.steps.findIndex((s) => s.state === 'active');
  const activeStep = view.steps[active];
  const stepText = activeStep
    ? t('now.steps.a11y', {
        step: active + 1,
        total: view.steps.length,
        label: t(`now.steps.${activeStep.key}`),
      })
    : '';
  return (
    <Bar
      tone="sky"
      titleInset={titleInset}
      title={title}
      label={saidTogether([title, stepText, body])}
      leading={
        thumb ? (
          <ZoomablePhoto
            uri={thumb}
            label={t('capture:photo_label', { index: 1, total: pages.length })}
          >
            <View
              style={[
                {
                  borderRadius: around(THUMB_CORNER, THUMB_FRAME),
                  backgroundColor: palette.paper,
                  padding: THUMB_FRAME,
                },
                SHADOW.soft,
              ]}
            >
              <Image
                source={{ uri: thumb }}
                accessible={false}
                style={{ width: 30, height: 38, borderRadius: THUMB_CORNER }}
                contentFit="cover"
              />
            </View>
          </ZoomablePhoto>
        ) : (
          <Mark icon="file" />
        )
      }
      line={<Dots view={view} label={activeStep ? t(`now.steps.${activeStep.key}`) : ''} />}
      details={
        <>
          <Detail>{body}</Detail>
          <StepNames view={view} />
          {/* One page is the thumbnail on the bar already; from two on they belong here. */}
          {pages.length > 1 ? <SentPages uris={pages} /> : null}
        </>
      }
    />
  );
}

/** Practice Buddy prepared: its name, how long, "Jetzt üben" — the test and "Heute nicht" on a tap. */
export function ReadyBar({
  card,
  busy,
  titleInset,
  onStart,
  onSkip,
}: {
  card: Ready;
  busy: boolean;
  titleInset: number;
  onStart: (stepId: string) => void;
  onSkip: (stepId: string) => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  // The practice's own name leads; "ready" is said by "Jetzt üben" (and to screen readers).
  const title = card.title;
  const line = t('now.ready_body', { count: card.question_count, minutes: card.est_minutes });
  const exam = card.goal?.due_date
    ? t('now.ready_for_exam', { exam: card.goal.title, when: whenText(card.goal.due_date) })
    : null;
  const focus =
    card.focus_topics.length > 0
      ? t('now.ready_focus', { topics: card.focus_topics.join(', ') })
      : null;
  return (
    <Bar
      tone="primaryLt"
      titleInset={titleInset}
      title={title}
      label={saidTogether([t('now.ready_title', { title: card.title }), line, exam, focus])}
      line={
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={lineStyle(palette)}>
          {line}
        </Text>
      }
      action={
        // In its own box: a Btn aligns itself to the top of a row, this one sits centred.
        <View>
          <Btn size="sm" pill onPress={() => onStart(card.step_id)} disabled={busy}>
            {t('now.ready_cta_short')}
          </Btn>
        </View>
      }
      details={
        <>
          {exam ? <Detail>{exam}</Detail> : null}
          {focus ? <Detail>{focus}</Detail> : null}
          <View style={{ flexDirection: 'row' }}>
            <Btn variant="ghost" size="sm" onPress={() => onSkip(card.step_id)} disabled={busy}>
              {t('now.ready_later')}
            </Btn>
          </View>
        </>
      }
    />
  );
}

/** A practice to go on with: what it is, how much is left, "Weitermachen". */
export function ResumeBar({
  card,
  busy,
  titleInset,
  onResume,
}: {
  card: Resume;
  busy: boolean;
  titleInset: number;
  onResume: (sessionId: string) => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const title = t(
    card.mode === 'help'
      ? 'now.resume_title_help'
      : card.mode === 'test'
        ? 'now.resume_title_test'
        : 'now.resume_title',
  );
  // Sessions started from a topic or homework have no goal or step title.
  const line = card.title.trim()
    ? t('now.resume_body', { title: card.title, count: card.remaining })
    : t('now.resume_body_untitled', { count: card.remaining });
  return (
    <Bar
      tone="primaryLt"
      titleInset={titleInset}
      title={title}
      label={saidTogether([title, line])}
      line={
        // Two lines, never "…": the sheet's name lives in this line here, and a name cut
        // off is a bar that cannot say what it is about (issue #204).
        <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={lineStyle(palette)}>
          {line}
        </Text>
      }
      action={
        <View>
          <Btn size="sm" pill onPress={() => onResume(card.session_id)} disabled={busy}>
            {t('now.resume_cta')}
          </Btn>
        </View>
      }
    />
  );
}

/**
 * Buddy waits for a photo of a sheet: which one, and the camera one tap away. The ask is
 * said once (issue #94): the sheet's own name leads (like ReadyBar), the line asks, and
 * the way out — "Kein Foto nötig", the undo of the request — opens on a tap, so the
 * word-for-word receipt in the conversation is not needed while this bar stands.
 */
export function CaptureBar({
  card,
  busy,
  titleInset,
  onPress,
  onNoPhoto,
}: {
  card: Capture;
  busy: boolean;
  titleInset: number;
  onPress: () => void;
  /** Takes the request back ("Kein Foto nötig") — absent when nothing undoable is known. */
  onNoPhoto?: (() => void) | null;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const title = card.title;
  // Short, because this line stands beside the mark and the button in about 140 pt on a 360
  // pt phone — "Schick mir ei…" next to "Arbeitsbla…" was a bar that said nothing (#204).
  // What Buddy will do with the photo is one tap away, where there is room for it.
  const line = t('now.capture_body');
  const why = t('now.capture_why');
  return (
    <Bar
      tone="peach"
      titleInset={titleInset}
      title={title}
      label={saidTogether([title, line, why])}
      // No mark here (issue #204): the violet button right beside it says "Foto machen", so
      // a camera disc would only repeat it — and it took 46 pt of the very column the
      // sheet's name needs. With it, "Arbeitsblatt Brüche" read "Arbeitsbla…" on a 360 pt
      // phone and the bar grew to two lines per text on a 390 pt one. The reading bar keeps
      // its leading, because there it is the photo of her own sheet, not decoration.
      line={
        // The sheet's name above may take two lines on a small phone, and so may this —
        // "Schick mir ei…" next to "Arbeitsbla…" was the whole bar saying nothing (#204).
        <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={lineStyle(palette)}>
          {line}
        </Text>
      }
      action={
        <View>
          <Btn size="sm" pill onPress={onPress} disabled={busy}>
            {t('now.capture_cta')}
          </Btn>
        </View>
      }
      details={
        <>
          <Detail>{why}</Detail>
          {onNoPhoto ? (
            <View style={{ flexDirection: 'row' }}>
              <Btn variant="ghost" size="sm" onPress={onNoPhoto} disabled={busy}>
                {t('done.undo_request_material')}
              </Btn>
            </View>
          ) : null}
        </>
      }
    />
  );
}

/**
 * The pages of the sheet, in the order they were taken: a small picture each, shown
 * large on a tap (ZoomViewer) — so "schief, unscharf, halbe Seite" is visible while
 * the sheet is being read (issue #57). The number stands under the picture, not over
 * it: on a thumbnail this small a badge would cover the very thing she wants to see.
 * A page the phone cannot show says so instead of standing there empty.
 */
function SentPages({ uris }: { uris: readonly string[] }) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'capture']);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  return (
    // token-exempt: the heading 6 above its pages
    <View style={{ gap: 6 }}>
      <Text style={TYPE.label}>{t('now.reading_pages')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // token-exempt: room above and below, so the scroller does not cut a page's edge
        contentContainerStyle={{ gap: SPACE.sm, paddingVertical: 2 }}
      >
        {uris.map((uri, i) => {
          const label = t('capture:photo_label', { index: i + 1, total: uris.length });
          return (
            // token-exempt: the page's number just under it
            <View key={uri} style={{ alignItems: 'center', gap: 2 }}>
              <View
                style={{
                  // 44 wide keeps the tap target at the 44 pt rule; 58 is the page's shape.
                  width: 44,
                  height: 58,
                  borderRadius: 8, // token-exempt: the page thumbnail's corner
                  overflow: 'hidden',
                  backgroundColor: palette.canvas,
                }}
              >
                {broken.has(uri) ? (
                  <View
                    accessible
                    accessibilityLabel={t('capture:preview_failed')}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="eye-off" size={18} color={palette.ink3} />
                  </View>
                ) : (
                  <PhotoThumb
                    uri={uri}
                    label={label}
                    onError={() => setBroken((was) => new Set(was).add(uri))}
                  />
                )}
              </View>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                // token-exempt: the page number at 11/14, below the type scale
                style={{ fontSize: 11, lineHeight: 14, color: palette.ink2 }}
              >
                {i + 1}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The round mark in front of a bar's text: a page or the camera. */
const MARK = 36;

function Mark({ icon }: { icon: 'file' | 'camera' }) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: MARK,
        height: MARK,
        borderRadius: circle(MARK),
        backgroundColor: palette.paper,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOW.soft,
      }}
    >
      <Icon name={icon} size={18} color={palette.primaryDk} />
    </View>
  );
}

/** The stages as dots in one line, and the one being worked on by name. */
function Dots({ view, label }: { view: ReadingView; label: string }) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}
    >
      {view.steps.map((s, i) => [
        <Dot key={s.key} state={s.state} />,
        i < view.steps.length - 1 ? (
          <View
            key={`${s.key}-line`}
            style={{
              width: 12,
              height: 2,
              borderRadius: 1, // token-exempt: half its height, a rounded link
              backgroundColor: s.state === 'done' ? palette.primary : palette.ink4,
              opacity: s.state === 'done' ? 0.5 : 0.8,
            }}
          />
        ) : null,
      ])}
      {label ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          // token-exempt: the stage's name 6 after its dots, beyond their own 4
          style={[lineStyle(palette), { marginLeft: 6, flexShrink: 1 }]}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function Dot({ state }: { state: StepState }) {
  const { palette } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (state !== 'active' || reduce) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: EASE.breathe }), -1, true);
    return () => cancelAnimation(pulse);
  }, [state, reduce, pulse]);
  const halo = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.value * 0.35,
    transform: [{ scale: 1 + pulse.value * 0.4 }],
  }));
  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      {state === 'active' ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 12,
              height: 12,
              borderRadius: 6, // token-exempt: half its size, a circle
              backgroundColor: palette.primary,
            },
            halo,
          ]}
        />
      ) : null}
      <View
        style={{
          width: state === 'active' ? 7 : 9,
          height: state === 'active' ? 7 : 9,
          borderRadius: 5, // token-exempt: half its size or more, a circle
          backgroundColor: state === 'todo' ? palette.paper : palette.primary,
          borderWidth: state === 'todo' ? 1.5 : 0,
          borderColor: palette.ink4,
        }}
      />
    </View>
  );
}

/** Expanded: every stage by name, the one done and the one now marked. */
function StepNames({ view }: { view: ReadingView }) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}
    >
      {view.steps.map((s) => (
        // token-exempt: the dot 6 from its stage's name
        <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Dot state={s.state} />
          <Text
            style={[
              TYPE.label,
              {
                color: s.state === 'todo' ? palette.ink2 : palette.ink,
                fontWeight: s.state === 'active' ? '700' : '600',
              },
            ]}
          >
            {t(`now.steps.${s.key}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}
