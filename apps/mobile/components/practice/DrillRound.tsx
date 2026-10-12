// Kopfrechnen-Schnellrunde (issue #243): one task, big; the shared numeric Composer; "Prüfen". That is all.
//
// The server wrote every task from the range Buddy offered and checks every answer by code,
// so nothing here waits for a model — and nothing here waits for the server either: the next
// task comes up the moment she presses "Prüfen" (`pending` holds what is on its way, sent in
// order, one after the other). What the server says about the task she just answered arrives
// a moment later in the line under the card — "Richtig: 6 · 7 = 42" or "7 · 8 = 56" — and
// stays there while she works on the next one. One try per task: a miss is not a conversation,
// the fact comes back through the schedule.
//
// No count of misses at the end (CLAUDE.md rule 6): one line about a row, from the server.
// Minimalism (#224): no settings, no instructions, no timer, no score. The head carries only
// what every practice head has (`HeadActions`): the Vorlesen switch — on, the task is read
// aloud, a tap on it reads it again (#434) — and the round ✕.

import type { SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { announce } from '../../lib/announce.js';
import { useDraft } from '../../lib/drafts.js';
import { newId } from '../../lib/api/client.js';
import { answerDrill, startDrill } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { haptic } from '../../lib/haptics.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Composer } from '../lb/Composer.js';
import { KeyRow } from '../lb/KeyRow.js';
import { ReadAloudSwitch } from '../lb/ReadAloudSwitch.js';
import { DRILL } from '../../lib/theme/drill.js';
import { PRACTICE } from '../../lib/theme/practice.js';
import { CARD_PAD } from '../../lib/theme/space.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Screen } from '../lb/Screen.js';
import { toast } from '../lb/Toast.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { ReadAgain } from '../lb/ReadAgain.js';
import { BottomBar } from '../lb/BottomBar.js';
import { PassEnd } from './PassEnd.js';
import { ProgressRow } from './Question.js';
import { useQuestionVoice } from './useQuestionVoice.js';

type Props = {
  session: SessionView;
  title: string;
  /** The round as the server now holds it. */
  onChange: (next: SessionView) => Promise<void>;
  /** "Beenden": back to Buddy; what she answered stays answered. */
  onClose: () => void;
};

/** Long enough for every answer a range can have (100, 3/4, 0,75), short enough for the slot. */
const MAX_TYPED = 6;

/** A task of numbers and signs only ("7 · 8", "56 : 7", "45 − 18"), written without `$…$`. */
const BARE_SUM = /^[\d\s·:+−]+$/;

/**
 * A task as it is read aloud (#434): a bare sum is math through and through, so it is read as
 * math — "sieben mal acht", never the dot as a symbol. A fraction task is already written with
 * `$…$`, a percent task in words ("15 % von 80"): both read as they are.
 */
function asSpoken(item: SessionItemView['item']): SessionItemView['item'] {
  return BARE_SUM.test(item.prompt) ? { ...item, prompt: `$${item.prompt}$` } : item;
}

export function DrillRound({ session, title, onChange, onClose }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  const drill = session.drill!;
  /** Tasks she answered whose answer is still on its way (item id → what she typed). */
  const [pending, setPending] = useState<ReadonlyMap<string, string>>(new Map());
  const queue = useRef<Array<{ itemId: string; text: string }>>([]);
  const draining = useRef(false);
  const [again, setAgain] = useState(false);

  const open = session.items.filter((i) => i.status === 'open' && !pending.has(i.item.id));
  const current: SessionItemView | undefined = open[0];
  // Vorlesen (#434): the task is read when it appears, a tap on it reads it again — where the
  // server lets it be heard (`read_aloud`). A round has no spoken answer, so nothing listens.
  const words = useSpokenWords();
  const spoken = current?.item.read_aloud ? asSpoken(current.item) : null;
  const readTask = useQuestionVoice(spoken, words, t, { listens: false });
  // What she typed for THIS task is a draft: a theme switch rebuilds the screen, and the digits
  // must still be there afterwards (the review of #228–#230 found exactly that loss).
  const draft = useDraft(`drill.${session.id}.${current?.item.id ?? 'none'}`);
  const typed = draft.text;
  const answered = session.items.length - open.length;
  // The task she answered last — the server's word once it is there, her own typing until then.
  const lastSent = [...pending.entries()].at(-1);
  const lastItem = lastSent ? session.items.find((i) => i.item.id === lastSent[0]) : undefined;

  const last = drill.last;
  // A screen reader hears what the server decided about the task she just answered.
  useEffect(() => {
    if (last && pending.size === 0) {
      announce(
        last.correct
          ? t('practice:drill.right', { task: `${last.prompt} = ${last.answer}` })
          : t('practice:drill.was', { task: `${last.prompt} = ${last.answer}` }),
      );
    }
  }, [last?.item_id, pending.size]);

  async function drain(): Promise<void> {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length > 0) {
        const next = queue.current[0]!;
        try {
          const view = await answerDrill(session.id, next.itemId, next.text);
          queue.current.shift();
          setPending((p) => {
            const m = new Map(p);
            m.delete(next.itemId);
            return m;
          });
          if (view.drill?.last?.item_id === next.itemId) {
            if (view.drill.last.correct) haptic.success();
            else haptic.soft();
          }
          await onChange(view);
        } catch (err) {
          // Whatever did not arrive is hers to answer again: the server's view says which.
          queue.current = [];
          setPending(new Map());
          toast.show(messageFor(err), 'error');
          void queryClient.invalidateQueries({ queryKey: keys.session(session.id) });
        }
      }
    } finally {
      draining.current = false;
    }
  }

  function submit(): void {
    if (!current || typed.length === 0 || typed.endsWith('/')) return;
    haptic.tap();
    const itemId = current.item.id;
    queue.current.push({ itemId, text: typed });
    draft.clear();
    setPending((p) => new Map(p).set(itemId, typed));
    void drain();
  }

  async function oneMore(): Promise<void> {
    if (again) return;
    setAgain(true);
    try {
      const next = await startDrill(newId(), drill.spec);
      queryClient.setQueryData(keys.session(next.id), next);
      void queryClient.invalidateQueries({ queryKey: keys.home });
      router.replace(`/practice/${next.id}`);
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      setAgain(false);
    }
  }

  // ─────────────── the end of the round ───────────────

  if (session.status !== 'active') {
    const finished = session.status === 'finished';
    return (
      <Screen
        title={title}
        state={finished ? 'happy' : undefined}
        subtitle={finished ? t('practice:summary.finished') : undefined}
        leading={{ icon: 'close', onPress: onClose, label: t('practice:end_label') }}
      >
        <PassEnd
          finished={finished}
          title={t('practice:drill.done_title')}
          line={
            finished && drill.summary
              ? drill.summary.group.kind === 'range'
                ? t(`practice:drill.line.${drill.summary.line}_range`, { what: title })
                : t(`practice:drill.line.${drill.summary.line}_${drill.summary.group.kind}`, {
                    n: drill.summary.group.n,
                  })
              : null
          }
          lineTestID="drill-line"
        />
        <BottomBar>
          <Btn size="lg" pill full variant="primary" onPress={onClose}>
            {t('practice:back_to_buddy')}
          </Btn>
          {finished ? (
            <Btn size="lg" pill full variant="ghost" busy={again} onPress={() => void oneMore()}>
              {t('practice:drill.again')}
            </Btn>
          ) : null}
        </BottomBar>
      </Screen>
    );
  }

  // ─────────────── one task ───────────────

  // The line under the card: the task she answered last. Hers while it is on its way, then
  // the server's verdict and key.
  const shownLast =
    lastSent && lastItem
      ? {
          prompt: lastItem.item.prompt,
          text: `${lastItem.item.prompt} = ${lastSent[1]}`,
          verdict: null,
        }
      : last
        ? {
            prompt: last.prompt,
            text: `${last.prompt} = ${last.answer}`,
            verdict: last.correct,
          }
        : null;

  const prompt = current ? current.item.prompt : '…';
  // Preserve the merged Practice hierarchy and its fraction-aware one-line thresholds.
  const promptLength = prompt.replace(/\$|\\frac\{(\d+)\}\{(\d+)\}/g, '$1$2').length;
  const taskStyle =
    promptLength <= PRACTICE.drill.shortPromptMax
      ? TYPE.questionBig
      : promptLength <= PRACTICE.drill.mediumPromptMax
        ? TYPE.questionMedium
        : TYPE.questionLong;
  const ready = Boolean(current && typed.length > 0 && !typed.endsWith('/'));
  const position = Math.min(answered + 1, session.items.length);
  const progressLabel = t('practice:drill.progress', {
    current: position,
    total: session.items.length,
  });
  function changeTyped(value: string): void {
    const allowed = value
      .replace(drill.input === 'fraction' ? /[^0-9/]/g : /[^0-9]/g, '')
      .slice(0, MAX_TYPED);
    const [whole = '', fraction] = allowed.split('/');
    draft.setText(fraction === undefined || whole.length === 0 ? whole : `${whole}/${fraction}`);
  }
  return (
    <Screen
      title={title}
      subtitle={progressLabel}
      leading={{
        icon: 'close',
        onPress: onClose,
        label: t('practice:end_label'),
        hint: t('practice:drill.end_hint'),
      }}
      sound={<ReadAloudSwitch />}
      footer={
        <ProgressRow
          position={position}
          total={session.items.length}
          closed={answered}
          label={progressLabel}
          hideLabel
        />
      }
    >
      <View style={{ flex: 1, paddingHorizontal: SPACE.lg, gap: SPACE.md }}>
        <Card radius={RADIUS.lg} padding={CARD_PAD.base}>
          <View style={{ alignItems: 'center', gap: SPACE.md }} testID="drill-task">
            <ReadAgain {...(spoken ? { onRead: () => readTask(spoken) } : {})}>
              <MathText
                text={prompt}
                accessibilityRole="header"
                style={[taskStyle, { textAlign: 'center' }]}
              />
            </ReadAgain>
            <View
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                minWidth: DRILL.answerWidth,
                minHeight: DRILL.answerHeight,
                padding: CARD_PAD.snug,
                borderRadius: RADIUS.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: typed ? palette.primaryLt : palette.canvas,
                borderWidth: DRILL.answerBorder,
                borderColor: typed ? palette.primary : palette.hairlineStrong,
              }}
            >
              <Text style={TYPE.drillAnswer}>{typed || '?'}</Text>
            </View>
          </View>
        </Card>
        <View testID="drill-last" style={{ minHeight: DRILL.feedbackHeight }}>
          {shownLast ? (
            <MathText
              text={
                shownLast.verdict === null
                  ? shownLast.text
                  : t(shownLast.verdict ? 'practice:drill.right' : 'practice:drill.was', {
                      task: shownLast.text,
                    })
              }
              style={[TYPE.body, { color: palette.ink2 }]}
            />
          ) : null}
        </View>
      </View>
      <BottomBar>
        <Composer
          value={typed}
          onChangeText={changeTyped}
          editable={Boolean(current)}
          keyboardType="numeric"
          inputMode="numeric"
          maxLength={MAX_TYPED}
          autoFocus
          accessibilityLabel={t('practice:answer.label')}
          onSubmitEditing={submit}
          keys={
            drill.input === 'fraction' ? (
              <KeyRow
                keepsFocus
                label={t('practice:drill.slash')}
                keys={[
                  {
                    id: 'slash',
                    face: '/',
                    label: t('practice:drill.slash'),
                    disabled: !current || typed.length === 0 || typed.includes('/'),
                    onPress: () => changeTyped(`${typed}/`),
                  },
                ]}
              />
            ) : null
          }
          primary={
            <Btn pill variant={ready ? 'primary' : 'quiet'} disabled={!ready} onPress={submit}>
              {t('practice:check')}
            </Btn>
          }
        />
      </BottomBar>
    </Screen>
  );
}
