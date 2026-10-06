// Kopfrechnen-Schnellrunde (issue #243): one task, big; a digit pad; "Prüfen". That is all.
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
// Minimalism (#224): no settings, no instructions, no timer, no score.

import type { SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

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
import { PadKey } from '../lb/PadKey.js';
import { Btn, MAX_FONT_SCALE } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { EndButton } from '../lb/EndButton.js';
import { Icon } from '../lb/Icon.js';
import { Screen } from '../lb/Screen.js';
import { toast } from '../lb/Toast.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { ReadAgain } from '../lb/ReadAgain.js';
import { BottomBar } from '../lb/BottomBar.js';
import { HeadActions } from './HeadActions.js';
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

/** The pad's keys, row by row. `slash` only for fractions; elsewhere the place stays empty. */
const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['slash', '0', 'back'],
] as const;
type Key = (typeof ROWS)[number][number];

/** What she typed, appended to: one "/" at most, never first, never a leading zero run. */
function typedWith(typed: string, key: Key): string {
  if (key === 'back') return typed.slice(0, -1);
  if (typed.length >= MAX_TYPED) return typed;
  if (key === 'slash') return typed.length === 0 || typed.includes('/') ? typed : `${typed}/`;
  return `${typed}${key}`;
}

/**
 * A task as it is read aloud: it is math through and through ("7 · 8", "56 : 7"), so it is read as
 * math — "sieben mal acht", never the dot as a symbol (#434). A task already written with $…$
 * (a fraction) reads as it is.
 */
function asMath(item: SessionItemView['item']): SessionItemView['item'] {
  return item.prompt.includes('$') ? item : { ...item, prompt: `$${item.prompt}$` };
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
  // Vorlesen (#434): the task is read when it appears, a tap on it reads it again; a round has no
  // spoken answer, so nothing listens.
  const words = useSpokenWords();
  const spoken = current ? asMath(current.item) : null;
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

  function press(key: Key): void {
    haptic.select();
    draft.setText((v) => typedWith(v, key));
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

  // A keyboard (the browser, a tablet's) types on the same pad.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key as Key);
      else if (e.key === '/' && drill.input === 'fraction') press('slash');
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') submitRef.current();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drill.input]);

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
      <Screen title={title}>
        <PassEnd
          finished={finished}
          title={t('practice:drill.done_title')}
          line={
            !drill.summary
              ? null
              : drill.summary.group.kind === 'range'
                ? t(`practice:drill.line.${drill.summary.line}_range`, { what: title })
                : t(`practice:drill.line.${drill.summary.line}_${drill.summary.group.kind}`, {
                    n: drill.summary.group.n,
                  })
          }
          lineTestID="drill-line"
        />
        <BottomBar>
          {finished ? (
            <Btn size="lg" pill full busy={again} onPress={() => void oneMore()}>
              {t('practice:drill.again')}
            </Btn>
          ) : null}
          <Btn size="lg" pill full variant={finished ? 'ghost' : 'primary'} onPress={onClose}>
            {t('practice:back_to_buddy')}
          </Btn>
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

  // How big the task stands: as big as fits one line of a 360 pt phone (rule 16).
  const taskSize = (text: string) => {
    const len = text.replace(/\$|\\frac\{(\d+)\}\{(\d+)\}/g, '$1$2').length;
    return len <= 7 ? 56 : len <= 11 ? 44 : 34;
  };
  const prompt = current ? current.item.prompt : '…';
  const size = taskSize(prompt);

  return (
    // The practice screens' header (issue #334.1): the round's name on one line and the round ✕.
    <Screen
      title={title}
      right={
        <HeadActions>
          <EndButton
            onPress={onClose}
            label={t('practice:end_label')}
            hint={t('practice:drill.end_hint')}
          />
        </HeadActions>
      }
    >
      <View style={{ flex: 1, paddingHorizontal: SPACE.lg, gap: SPACE.md }}>
        <ProgressRow
          position={Math.min(answered + 1, session.items.length)}
          total={session.items.length}
          closed={answered}
          label={t('practice:drill.progress', {
            current: Math.min(answered + 1, session.items.length),
            total: session.items.length,
          })}
        />
        {/* The one thing in front of her, and it takes the room there is: no dead gap between
            the task and the pad (issue #286 point 1). */}
        <Card
          tone="lavender"
          // The question card's shape (`QuestionCard`): the task IS the question here.
          radius={24}
          style={{ flex: 1, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.lg }}
        >
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'center', gap: SPACE.lg }} testID="drill-task">
            <ReadAgain {...(spoken ? { onRead: () => readTask(spoken) } : {})}>
              <MathText
                text={prompt}
                accessibilityRole="header"
                style={[
                  TYPE.display,
                  // token-exempt: the line follows the task's own size (`taskSize`), 1.2 of it
                  { fontSize: size, lineHeight: Math.round(size * 1.2), textAlign: 'center' },
                ]}
              />
            </ReadAgain>
            <View
              accessible
              accessibilityLabel={t('practice:drill.typed', { value: typed || '–' })}
              accessibilityLiveRegion="polite"
              style={{
                minWidth: 144,
                height: 72,
                paddingHorizontal: SPACE.xl,
                borderRadius: SPACE.lg,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.paper,
                borderWidth: 2,
                borderColor: typed ? palette.primary : palette.lavenderDeep,
              }}
            >
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  // token-exempt: her answer read at a glance mid-round, as large as a short task
                  fontSize: 40,
                  fontWeight: '700',
                  letterSpacing: 1,
                  color: typed ? palette.ink : palette.lavenderDeep,
                }}
              >
                {typed || '?'}
              </Text>
            </View>
          </View>
          {/* The task she answered last, as one quiet pill at the card's foot. Always the same
              height, so nothing jumps when it fills; words and a mark, never colour alone. */}
          <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
            <View
              testID="drill-last"
              style={{
                minHeight: 36,
                justifyContent: 'center',
              }}
            >
              {shownLast ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.sm,
                    paddingHorizontal: SPACE.md,
                    // token-exempt: optical, a pill of 36 pt around 15 pt text, fully rounded
                    paddingVertical: SPACE.xs + 2,
                    // token-exempt: half the pill's 36 pt height
                    borderRadius: 18,
                    backgroundColor: shownLast.verdict === true ? palette.mint : palette.paper,
                  }}
                >
                  {shownLast.verdict === true ? (
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Icon name="check" size={16} color={palette.successText} />
                    </View>
                  ) : null}
                  {shownLast.verdict !== null ? (
                    <Text
                      style={[
                        TYPE.small,
                        {
                          color:
                            shownLast.verdict === true ? palette.successText : palette.primaryDk,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {shownLast.verdict === true
                        ? t('practice:drill.right_short')
                        : t('practice:drill.was_short')}
                    </Text>
                  ) : null}
                  <MathText
                    text={shownLast.text}
                    style={[
                      TYPE.small,
                      {
                        color:
                          shownLast.verdict === true
                            ? palette.successText
                            : shownLast.verdict === null
                              ? palette.ink2
                              : palette.ink,
                        fontWeight: '600',
                      },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </Card>
        <View style={{ gap: SPACE.sm }} testID="drill-pad">
          {ROWS.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: SPACE.sm }}>
              {row
                // Whole numbers have no "/": the 0 takes its place and the row stays whole
                // (issue #287: no ragged gap in a grid).
                .filter((key) => key !== 'slash' || drill.input === 'fraction')
                .map((key) => (
                  <PadKey
                    key={key}
                    sign={key === 'back' ? '⌫' : key === 'slash' ? '/' : key}
                    onPress={() => press(key)}
                    disabled={!current}
                    quiet={key === 'back'}
                    accessibilityLabel={
                      key === 'back'
                        ? t('practice:drill.delete')
                        : key === 'slash'
                          ? t('practice:drill.slash')
                          : key
                    }
                    span={key === '0' && drill.input !== 'fraction' ? 2 : 1}
                  />
                ))}
            </View>
          ))}
        </View>
      </View>
      <BottomBar>
        <Btn
          size="lg"
          pill
          full
          disabled={!current || typed.length === 0 || typed.endsWith('/')}
          onPress={submit}
        >
          {t('practice:check')}
        </Btn>
      </BottomBar>
    </Screen>
  );
}
