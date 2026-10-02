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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';

import { announce } from '../../lib/announce.js';
import { useDraft } from '../../lib/drafts.js';
import { newId } from '../../lib/api/client.js';
import { answerDrill, startDrill } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { haptic } from '../../lib/haptics.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn, MAX_FONT_SCALE } from '../lb/Btn.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { EmptyState } from '../lb/EmptyState.js';
import { Icon } from '../lb/Icon.js';
import { Rise } from '../lb/Motion.js';
import { Screen } from '../lb/Screen.js';
import { toast } from '../lb/Toast.js';
import { MathText } from '../math/MathText.js';
import { BottomBar } from './BottomBar.js';
import { ProgressRow } from './Question.js';

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
 * The round's name on ONE line (issue #287: a title that wraps pushes everything down), and
 * what stands to its right. Screen's own header allows two lines, which a name like "Plus bis
 * 100 ohne Übergang" next to "Beenden" needs on a 360 pt phone.
 */
function RoundHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.sm,
        minHeight: 52,
      }}
    >
      <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.title, { flex: 1 }]}>
        {title}
      </Text>
      {right}
    </View>
  );
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
      <Screen>
        <RoundHeader title={title} />
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.lg }}>
          {finished ? (
            <View style={{ alignItems: 'center', gap: SPACE.lg }}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <BuddyOrb size={88} />
              </View>
              <Rise slow delay={160}>
                <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
                  {t('practice:drill.done_title')}
                </Text>
              </Rise>
              {drill.summary ? (
                <Rise slow delay={320}>
                  <Text
                    testID="drill-line"
                    style={[TYPE.body, { textAlign: 'center', color: palette.ink2 }]}
                  >
                    {drill.summary.group.kind === 'range'
                      ? t(`practice:drill.line.${drill.summary.line}_range`, { what: title })
                      : t(`practice:drill.line.${drill.summary.line}_${drill.summary.group.kind}`, {
                          n: drill.summary.group.n,
                        })}
                  </Text>
                </Rise>
              ) : null}
            </View>
          ) : (
            <EmptyState title={t('practice:ended')} />
          )}
        </View>
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
    <Screen>
      <RoundHeader
        title={title}
        right={
          <Btn
            variant="outline"
            size="sm"
            pill
            onPress={onClose}
            accessibilityHint={t('practice:drill.end_hint')}
          >
            {t('practice:end')}
          </Btn>
        }
      />
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
        <View
          style={{
            flex: 1,
            borderRadius: 28,
            backgroundColor: palette.lavender,
            paddingHorizontal: SPACE.xl,
            paddingVertical: SPACE.lg,
          }}
        >
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'center', gap: SPACE.lg }} testID="drill-task">
            <MathText
              text={prompt}
              accessibilityRole="header"
              style={[
                TYPE.display,
                { fontSize: size, lineHeight: Math.round(size * 1.2), textAlign: 'center' },
              ]}
            />
            <View
              accessible
              accessibilityLabel={t('practice:drill.typed', { value: typed || '–' })}
              accessibilityLiveRegion="polite"
              style={{
                minWidth: 144,
                height: 72,
                paddingHorizontal: SPACE.xl,
                borderRadius: 20,
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
                    paddingVertical: SPACE.xs + 2, // optical: a pill of 36 pt with 15 pt text
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
        </View>
        <View style={{ gap: SPACE.sm }} testID="drill-pad">
          {ROWS.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: SPACE.sm }}>
              {row
                // Whole numbers have no "/": the 0 takes its place and the row stays whole
                // (issue #287: no ragged gap in a grid).
                .filter((key) => key !== 'slash' || drill.input === 'fraction')
                .map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => press(key)}
                    disabled={!current}
                    accessibilityRole="button"
                    accessibilityLabel={
                      key === 'back'
                        ? t('practice:drill.delete')
                        : key === 'slash'
                          ? t('practice:drill.slash')
                          : key
                    }
                    style={{ flex: key === '0' && drill.input !== 'fraction' ? 2 : 1 }}
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          // Above the 44 pt floor: these are hit dozens of times a minute.
                          height: TOUCH + SPACE.sm,
                          borderRadius: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: pressed ? palette.primaryLt : palette.paper,
                          ...SHADOW.soft,
                        }}
                      >
                        <Text
                          maxFontSizeMultiplier={MAX_FONT_SCALE}
                          style={{
                            fontSize: key === 'back' ? 22 : 26,
                            fontWeight: '500',
                            color: key === 'back' ? palette.ink2 : palette.ink,
                          }}
                        >
                          {key === 'back' ? '⌫' : key === 'slash' ? '/' : key}
                        </Text>
                      </View>
                    )}
                  </Pressable>
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
