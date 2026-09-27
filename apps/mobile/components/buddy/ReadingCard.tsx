// While Buddy reads her sheet: the photo, what is happening now, and the few
// steps it goes through — each one only once the server reports it (lib/buddy/
// readingStages.ts, CLAUDE.md rule 5). The step being worked on breathes softly;
// nothing moves by itself towards "done". Screen readers hear the title and the
// step ("Schritt 2 von 3: Lesen").

import type { NowCard } from '@learnbuddy/shared-types/contracts';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { readingView, type StepState } from '../../lib/buddy/readingStages.js';
import { LB } from '../../lib/theme/colors.js';
import { fadeIn } from '../../lib/theme/enter.js';
import { EASE } from '../../lib/theme/motion.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';

type Processing = Extract<NowCard, { type: 'material_processing' }>;

export function ReadingCard({
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
  return (
    <Card tone="sky" padding={16} radius={22}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: titleInset }}
      >
        {thumb ? (
          <View style={[{ borderRadius: 8, backgroundColor: LB.paper, padding: 3 }, SHADOW.soft]}>
            <Image
              source={{ uri: thumb }}
              accessible={false}
              style={{ width: 40, height: 52, borderRadius: 6 }}
              contentFit="cover"
            />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          {/* A new stage fades in (keyed on what it says). */}
          <Animated.Text
            key={title}
            entering={fadeIn()}
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={TYPE.title}
          >
            {title}
          </Animated.Text>
          <Animated.Text key={body} entering={fadeIn()} style={TYPE.small}>
            {body}
          </Animated.Text>
        </View>
      </View>
      <View
        accessible
        accessibilityLabel={
          activeStep
            ? t('now.steps.a11y', {
                step: active + 1,
                total: view.steps.length,
                label: t(`now.steps.${activeStep.key}`),
              })
            : undefined
        }
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 6 }}
      >
        {view.steps.map((s, i) => [
          <Step key={s.key} state={s.state} label={t(`now.steps.${s.key}`)} />,
          i < view.steps.length - 1 ? (
            <View
              key={`${s.key}-line`}
              style={{
                flex: 1,
                minWidth: 8,
                height: 2,
                borderRadius: 1,
                backgroundColor: s.state === 'done' ? LB.primary : LB.ink4,
                opacity: s.state === 'done' ? 0.5 : 0.8,
              }}
            />
          ) : null,
        ])}
      </View>
    </Card>
  );
}

function Step({ state, label }: { state: StepState; label: string }) {
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
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
        {state === 'active' ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: LB.primary,
              },
              halo,
            ]}
          />
        ) : null}
        <View
          style={{
            width: state === 'active' ? 10 : 16,
            height: state === 'active' ? 10 : 16,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              state === 'done' ? LB.primary : state === 'active' ? LB.primary : LB.paper,
            borderWidth: state === 'todo' ? 1.5 : 0,
            borderColor: LB.ink4,
          }}
        >
          {state === 'done' ? (
            <Text style={{ color: LB.paper, fontSize: 10, lineHeight: 12, fontWeight: '700' }}>
              ✓
            </Text>
          ) : null}
        </View>
      </View>
      <Text
        style={[
          TYPE.label,
          {
            color: state === 'todo' ? LB.ink2 : LB.ink,
            fontWeight: state === 'active' ? '700' : '600',
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
