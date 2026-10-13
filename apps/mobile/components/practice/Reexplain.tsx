// "Anders erklären" (gaps.md #3): under an explanation and under a shown solution, three
// small chips — "Einfacher bitte", "Mit Beispiel", "Warum ist das so?". A tap asks Buddy for a
// new explanation that way (POST …/reexplain); her request and his new explanation then stand
// here like a short chat. Ordinary presentation places the same shortcuts in Composer;
// the default structured presentation remains below the reply. The chips are shortcuts for what she could also type; examples,
// not a feature catalogue (docs/UX-PRINCIPLES.md). They sit in one row (a small side
// scroll on narrow phones) so the solution above keeps its room, arrive only after the
// moment of the answer has played, and step aside while Buddy writes.
//
// „Warum stimmt das?" (issue #388, report §5.3): where the question came with three reasons, the
// third chip asks HER why — a tap shows the reasons, she taps one, and the server says whether it
// is the rule behind the solution. The same chip in the same place, so there is still one "why";
// without reasons it stays "Warum ist das so?", Buddy's explanation.

import type { PracticeTurnView, ReexplainWay } from '@learnbuddy/shared-types/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { PRACTICE } from '../../lib/theme/practice.js';
import { PRACTICE_SCREEN } from '../../lib/theme/practiceScreen.js';
import { DURATION } from '../../lib/theme/motion.js';
import { useStackTops } from '../../lib/practice/useStackTops.js';
import { useDraft } from '../../lib/drafts.js';
import { useRegisterCheckOverride } from './CheckOverride.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

import { Btn } from '../lb/Btn.js';
import { Chip } from '../lb/Chip.js';
import { Appear } from '../lb/Motion.js';
import { ChoiceList } from './ChoiceList.js';
import { ItemThread, useWritesBelow } from './ItemThread.js';

const WAYS: readonly ReexplainWay[] = ['simpler', 'example', 'why'];
/** A reason is picked once (`why.ts`): none of them was tried before. */
const NONE_TRIED: ReadonlySet<string> = new Set();

type Props = {
  draftKey: string;
  /** The exchanges so far about this explanation or solution (turns with `reexplain`). */
  turns: PracticeTurnView[];
  /** The way she just tapped, while Buddy writes. */
  pending: ReexplainWay | null;
  disabled: boolean;
  /** A way she tapped — with `choice`, the reason she picked for „Warum stimmt das?". */
  onAsk: (way: ReexplainWay, choice?: number) => void | Promise<unknown>;
  /** Wait before the chips appear (ms): after a right answer, let its moment play first. */
  delay?: number;
  /** „Warum stimmt das?": the three reasons to tap, until she tapped one (`SessionItemView.why`). */
  why?: readonly string[] | null;
  /** Pure presentation slots; one owner retains the real draft and check override. */
  render?: (slots: {
    body: ReactNode;
    actions: ReactNode;
    revealTop?: number;
    revealKey?: string;
  }) => ReactNode;
};

export function Reexplain({
  draftKey,
  turns,
  pending,
  disabled,
  onAsk,
  delay = DURATION.reexplainArrival,
  why = null,
  render,
}: Props) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  const asksHer = why !== null;
  /** The reasons are open: she tapped „Warum stimmt das?". */
  const [choosing, setChoosing] = useState(false);
  const draft = useDraft(draftKey);
  const index = /^\d+$/.test(draft.text) ? Number(draft.text) : -1;
  const picked = why && index >= 0 && index < why.length ? index : null;
  const latest = useRef({ onAsk, disabled, pending, picked });
  latest.current = { onAsk, disabled, pending, picked };
  const submitting = useRef(false);
  const wasPending = useRef(false);
  if (wasPending.current && pending === null) submitting.current = false;
  wasPending.current = pending !== null;
  useEffect(() => {
    setChoosing(false);
    submitting.current = false;
  }, [draftKey]);
  const submit = useCallback(() => {
    const current = latest.current;
    if (submitting.current || current.disabled || current.pending || current.picked === null)
      return;
    submitting.current = true;
    try {
      void Promise.resolve(current.onAsk('why', current.picked))
        .catch(() => undefined)
        .finally(() => {
          submitting.current = false;
        });
    } catch {
      submitting.current = false;
    }
  }, []);
  const override = useMemo(
    () =>
      choosing && asksHer
        ? {
            ready: picked !== null,
            disabled: disabled || pending !== null,
            waitsHint: t('select.check_waits'),
            onPress: submit,
          }
        : null,
    [choosing, asksHer, picked, disabled, pending, t, submit],
  );
  useRegisterCheckOverride(draftKey, override);
  // While Buddy writes the new explanation his orb stands at these dots, not at a line above.
  const writing = pending !== null;
  useEffect(() => {
    useWritesBelow.setState({ writing });
    return () => useWritesBelow.setState({ writing: false });
  }, [writing]);
  const pendingText =
    pending === 'why' && asksHer && picked !== null
      ? (why[picked] ?? null)
      : pending
        ? t(`reexplain.${pending}`)
        : null;
  const newestTutor = turns.filter((turn) => turn.role === 'tutor').at(-1)?.id;
  const [tutorTop, setTutorTop] = useState<{ key: string; top: number } | null>(null);
  const reportTops = useCallback(
    (tops: Readonly<Record<string, number>>) => {
      if (newestTutor === undefined || tops[newestTutor] === undefined) return;
      const top = tops[newestTutor]!;
      setTutorTop((current) =>
        current?.key === newestTutor && current.top === top ? current : { key: newestTutor, top },
      );
    },
    [newestTutor],
  );
  const { pieces, onHeight } = useStackTops(SPACE.sm, ['reply', 'reasons'], undefined);
  const hasBody = turns.length > 0 || pendingText !== null || (asksHer && choosing);
  const body = hasBody ? (
    <View>
      <View onLayout={onHeight('reply')}>
        <ItemThread
          gap={render ? PRACTICE.ordinaryBody.feedbackGap : undefined}
          turns={turns}
          onTurnTops={render ? reportTops : undefined}
          pending={pendingText}
          thinkingLabel={t('reexplain.thinking')}
        />
      </View>
      <View onLayout={onHeight('reasons')} style={{ marginTop: pieces[1]?.step ?? 0 }}>
        {!pending && asksHer && choosing ? (
          <Appear delay={0}>
            <View accessibilityLabel={t('why.label')} style={{ gap: SPACE.sm }}>
              <Text style={[TYPE.label, { color: palette.ink2 }]}>{t('why.label')}</Text>
              <ChoiceList
                choices={[...why]}
                tried={NONE_TRIED}
                disabled={disabled}
                selected={picked}
                onChoose={(n) => {
                  if (!disabled) draft.setText(String(n));
                }}
              />
            </View>
          </Appear>
        ) : null}
      </View>
    </View>
  ) : null;
  const Shortcut = render ? Chip : Btn;
  const actions =
    pending || (asksHer && choosing) ? null : (
      <Appear delay={turns.length > 0 ? DURATION.reexplainReply : delay}>
        <View
          accessibilityLabel={t('reexplain.label')}
          style={[
            { flexDirection: 'row', flexWrap: 'wrap' },
            render ? PRACTICE_SCREEN.chipRow : { gap: SPACE.sm },
          ]}
        >
          {WAYS.map((way) => (
            <Shortcut
              key={way}
              {...(render ? {} : { size: 'sm' as const, variant: 'ghost' as const, pill: true })}
              disabled={disabled}
              accessibilityHint={way === 'why' && asksHer ? t('why.hint') : t('reexplain.hint')}
              onPress={() => (way === 'why' && asksHer ? setChoosing(true) : onAsk(way))}
            >
              {way === 'why' && asksHer ? t('why.ask') : t(`reexplain.${way}`)}
            </Shortcut>
          ))}
        </View>
      </Appear>
    );
  return render ? (
    render({
      body,
      actions,
      ...(asksHer && choosing
        ? { revealTop: pieces[1]?.top ?? 0, revealKey: `${draftKey}.reasons` }
        : pending === null && tutorTop !== null && tutorTop.key === newestTutor
          ? { revealTop: tutorTop.top, revealKey: tutorTop.key }
          : {}),
    })
  ) : (
    <View style={{ gap: SPACE.sm }}>
      {body}
      {actions}
    </View>
  );
}
