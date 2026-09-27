// The slim bar on top of Buddy's home (owner request: the reading / ready card was "ein
// Riesenbrett"): one line of what is happening, at most ~60 pt tall — a small photo or mark,
// a short status, the reading's stage dots inline, and the one action as a compact button.
// Everything else (the stage names, "du kannst die App schließen", which test, "Heute nicht")
// opens on a tap on the bar. Screen readers hear it all in one label. Closing and swiping it
// away stay with the card on top (TopOverlay). docs/architecture.md §Home.

import type { NowCard } from '@learnbuddy/shared-types/contracts';
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { LB } from '../../lib/theme/colors.js';
import { fadeIn } from '../../lib/theme/enter.js';
import { EASE } from '../../lib/theme/motion.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { ZoomablePhoto } from '../lb/ZoomViewer.js';
import { whenText } from './describe.js';

type Processing = Extract<NowCard, { type: 'material_processing' }>;
type Ready = Extract<NowCard, { type: 'practice_ready' }>;

/** Where the close button of the card on top sits on a slim bar (vertically centred). */
export const SLIM_CLOSE_TOP = 8;

const TITLE = { fontSize: 15, lineHeight: 20, fontWeight: '700' as const, color: LB.ink };
const LINE = { fontSize: 13, lineHeight: 18, color: LB.ink2 };

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
  tone: 'sky' | 'primaryLt';
  leading?: ReactNode;
  title: string;
  line: ReactNode;
  action?: ReactNode;
  details: ReactNode;
  /** Everything the bar says, for a screen reader (details included). */
  label: string;
  titleInset: number;
}) {
  const { t } = useTranslation('buddy');
  const [open, setOpen] = useState(false);
  return (
    <Card tone={tone} padding={0} radius={20}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 60,
          paddingLeft: leading ? 10 : 16,
          paddingRight: titleInset + 4,
          gap: 10,
        }}
      >
        {leading ?? null}
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={open ? t('now.less') : t('now.more')}
          accessibilityState={{ expanded: open }}
          style={{ flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 8 }}
        >
          <Animated.Text key={title} entering={fadeIn()} numberOfLines={1} style={TITLE}>
            {title}
          </Animated.Text>
          <View style={{ marginTop: 1 }}>{line}</View>
        </Pressable>
        {action}
      </View>
      {open ? (
        <Animated.View
          entering={fadeIn()}
          style={{
            paddingHorizontal: 14,
            paddingBottom: 12,
            paddingTop: 10,
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: LB.hairline,
          }}
        >
          {details}
        </Animated.View>
      ) : null}
    </Card>
  );
}

/** Her sheet being read: photo, status, the stage dots — the rest on a tap. */
export function ReadingBar({
  card,
  thumb,
  preparing,
  titleInset,
}: {
  card: Processing;
  thumb: string | null;
  preparing: boolean;
  titleInset: number;
}) {
  const { t } = useTranslation('buddy');
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
      label={[title, stepText, body].filter(Boolean).join('. ')}
      leading={
        thumb ? (
          <ZoomablePhoto uri={thumb}>
            <View style={[{ borderRadius: 7, backgroundColor: LB.paper, padding: 2 }, SHADOW.soft]}>
              <Image
                source={{ uri: thumb }}
                accessible={false}
                style={{ width: 30, height: 38, borderRadius: 5 }}
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
          <Text style={[TYPE.small, { fontSize: 14, lineHeight: 20 }]}>{body}</Text>
          <StepNames view={view} />
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
      label={[t('now.ready_title', { title: card.title }), line, exam, focus]
        .filter(Boolean)
        .join('. ')}
      line={
        <Text numberOfLines={1} style={LINE}>
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
          {exam ? <Text style={[TYPE.small, { fontSize: 14, lineHeight: 20 }]}>{exam}</Text> : null}
          {focus ? (
            <Text style={[TYPE.small, { fontSize: 14, lineHeight: 20 }]}>{focus}</Text>
          ) : null}
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

function Mark({ icon }: { icon: 'file' }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: LB.paper,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOW.soft,
      }}
    >
      <Icon name={icon} size={18} color={LB.primaryDk} />
    </View>
  );
}

/** The stages as dots in one line, and the one being worked on by name. */
function Dots({ view, label }: { view: ReadingView; label: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      {view.steps.map((s, i) => [
        <Dot key={s.key} state={s.state} />,
        i < view.steps.length - 1 ? (
          <View
            key={`${s.key}-line`}
            style={{
              width: 12,
              height: 2,
              borderRadius: 1,
              backgroundColor: s.state === 'done' ? LB.primary : LB.ink4,
              opacity: s.state === 'done' ? 0.5 : 0.8,
            }}
          />
        ) : null,
      ])}
      {label ? (
        <Text numberOfLines={1} style={[LINE, { marginLeft: 6, flexShrink: 1 }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function Dot({ state }: { state: StepState }) {
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
              borderRadius: 6,
              backgroundColor: LB.primary,
            },
            halo,
          ]}
        />
      ) : null}
      <View
        style={{
          width: state === 'active' ? 7 : 9,
          height: state === 'active' ? 7 : 9,
          borderRadius: 5,
          backgroundColor: state === 'todo' ? LB.paper : LB.primary,
          borderWidth: state === 'todo' ? 1.5 : 0,
          borderColor: LB.ink4,
        }}
      />
    </View>
  );
}

/** Expanded: every stage by name, the one done and the one now marked. */
function StepNames({ view }: { view: ReadingView }) {
  const { t } = useTranslation('buddy');
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
    >
      {view.steps.map((s) => (
        <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Dot state={s.state} />
          <Text
            style={[
              TYPE.label,
              {
                color: s.state === 'todo' ? LB.ink2 : LB.ink,
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
