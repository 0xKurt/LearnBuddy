// "Anders erklären" (gaps.md #3): under an explanation and under a shown solution, three
// small chips — "Einfacher bitte", "Mit Beispiel", "Warum ist das so?". A tap asks Buddy for a
// new explanation that way (POST …/reexplain); her request and his new explanation then stand
// here like a short chat. The chips are shortcuts for what she could also type; examples,
// not a feature catalogue (docs/UX-PRINCIPLES.md). They sit in one row (a small side
// scroll on narrow phones) so the solution above keeps its room, arrive only after the
// moment of the answer has played, and step aside while Buddy writes.
//
// „Warum stimmt das?" (issue #388, report §5.3): where the question came with three reasons, the
// third chip asks HER why — a tap shows the reasons, she taps one, and the server says whether it
// is the rule behind the solution. The same chip in the same place, so there is still one "why";
// without reasons it stays "Warum ist das so?", Buddy's explanation.

import type { PracticeTurnView, ReexplainWay } from '@learnbuddy/shared-types/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { DURATION } from '../../lib/theme/motion.js';
import { useDraft } from '../../lib/drafts.js';
import { useRegisterCheckOverride } from './CheckOverride.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

import { Btn } from '../lb/Btn.js';
import { Appear } from '../lb/Motion.js';
import { ChoiceList } from './ChoiceList.js';
import { ItemThread } from './ItemThread.js';

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
};

export function Reexplain({
  draftKey,
  turns,
  pending,
  disabled,
  onAsk,
  delay = DURATION.reexplainArrival,
  why = null,
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
  const pendingText =
    pending === 'why' && asksHer && picked !== null
      ? (why[picked] ?? null)
      : pending
        ? t(`reexplain.${pending}`)
        : null;
  return (
    <View style={{ gap: SPACE.sm }}>
      <ItemThread turns={turns} pending={pendingText} thinkingLabel={t('reexplain.thinking')} />
      {pending ? null : asksHer && choosing ? (
        <Appear delay={0}>
          <View accessibilityLabel={t('why.label')} style={{ gap: SPACE.sm }}>
            {/* Says what the three are for: she picks the one that is the reason. */}
            <Text style={[TYPE.label, { color: palette.ink2 }]}>{t('why.label')}</Text>
            {/* Picking one of several is the answer tiles' job (CLAUDE.md rule 19). */}
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
      ) : (
        <Appear delay={turns.length > 0 ? DURATION.reexplainReply : delay}>
          {/* Wrapping, not a horizontal scroll: the half-visible chip read as a
              rendering bug, not as an affordance (user feedback 2026-09-28). */}
          <View
            accessibilityLabel={t('reexplain.label')}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}
          >
            {WAYS.map((way) => (
              // Ghost, not filled: a shortcut for something she could also type, not three
              // more buttons competing with "Weiter" (issue #61).
              <Btn
                key={way}
                size="sm"
                variant="ghost"
                pill
                disabled={disabled}
                accessibilityHint={way === 'why' && asksHer ? t('why.hint') : t('reexplain.hint')}
                onPress={() => (way === 'why' && asksHer ? setChoosing(true) : onAsk(way))}
              >
                {way === 'why' && asksHer ? t('why.ask') : t(`reexplain.${way}`)}
              </Btn>
            ))}
          </View>
        </Appear>
      )}
    </View>
  );
}
