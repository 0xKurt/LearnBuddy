// Lernkarten (issue #147, Stufe 2): one word at a time, the card turns over, and SHE says
// whether she knew it.
//
// The screen is built like every practice screen, in the same places (issue #384, report #388
// §9 "the bar per form"): the header with the round ✕ (`EndButton`), where she is (the progress
// row), the one thing in front of her (the card), the conversation under it once she asks, and
// the one input bar at the bottom (`CheckBar` `own`). Its field is her question to the tutor
// ("Frag zur Aufgabe …", `POST …/ask`: never graded, never a rating); its action is the card's:
// "Umdrehen" where "Prüfen" stands on a board, then "Noch nicht" / "Wusste ich" across under the
// pill, where a typed answer's "Prüfen" stands. No answer field, no "Tipp", no "Lösung zeigen":
// there is nothing to grade here.
//
// Two decisions that are deliberate and would be easy to undo by accident:
//
//   · "Wusste ich" and "Noch nicht" are the SAME weight on screen — both the soft pill, side
//     by side, neither the primary. Making the pleasant one primary would nudge her towards
//     claiming she knew it, and that is exactly the bias the server's rating already has to
//     guard against (apps/api/src/modules/practice/fsrs.ts RATING). The app must not add to
//     it. For the same reason neither carries a tick or a cross: nothing here was right.
//   · The card is turned over by the `<Btn>` in the bar, not by tapping the card. One way to
//     do it, at the thumb, where every other action of the app lives (CLAUDE.md rule 13).
//   · A question she asks is about the card in front of her; its reply stands under the card,
//     and the next card starts without it (the conversation is the card's, like a question's).
//
// The end of a pass says what happened and nothing more: she went through her words. No count
// of how many she knew — that number would be her own estimate dressed up as a result
// (rule 5), and a count of what is still to come is not hers to carry either (rule 6).

import type { CardRecall, SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { announce } from '../../lib/announce.js';
import { recordCard } from '../../lib/api/endpoints.js';
import { useDraft } from '../../lib/drafts.js';
import { haptic } from '../../lib/haptics.js';
import { messageFor } from '../../lib/errors.js';
import { isForeign } from '../../lib/i18n/index.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { EndButton } from '../lb/EndButton.js';
import { ReadAgain } from '../lb/ReadAgain.js';
import { Rise } from '../lb/Motion.js';
import { Screen } from '../lb/Screen.js';
import { toast } from '../lb/Toast.js';
import { BottomBar } from '../lb/BottomBar.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { CheckBar } from './CheckBar.js';
import { HeadActions } from './HeadActions.js';
import { ItemThread } from './ItemThread.js';
import { PassEnd } from './PassEnd.js';
import { ListenButton } from './ListenButton.js';
import { ProgressRow } from './Question.js';
import { useQuestionVoice } from './useQuestionVoice.js';

type Props = {
  session: SessionView;
  title: string;
  /** The pass as the server now holds it (the screen keeps no state of its own about it). */
  onChange: (next: SessionView) => Promise<void>;
  /** The round ✕: back to Buddy; the cards she has done stay done. */
  onClose: () => void;
  /**
   * Her question about the card on its way (`pending`), and "Merk ich mir für nachher" for an
   * off-topic one — the practice screen's, which sends it (`AskRoute`).
   */
  asked: { pending: string | null; onKeep: (turnId: string) => Promise<void> };
};

/**
 * How large a word stands on the card. A single word gets the headline size; a phrase steps
 * down so it still fits a 360×740 screen without the card having to scroll (rule 16).
 */
function faceStyle(text: string) {
  if (text.length <= 22) return TYPE.display;
  if (text.length <= 60) return TYPE.prompt;
  return TYPE.body;
}

export function CardPass({ session, title, onChange, onClose, asked }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  /**
   * Which card is showing its back. Keyed on the card, so the next one starts face up; kept like
   * a draft (`useDraft`), because the theme switch rebuilds the screen and a turned card stood
   * face up again, its answer gone (walkthrough of #384).
   */
  const turnedDraft = useDraft(`session.${session.id}.turned`);
  const turned = turnedDraft.text || null;
  const setTurned = (itemId: string | null) => turnedDraft.setText(itemId ?? '');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  const open = session.items.filter((i) => i.status === 'open');
  const current: SessionItemView | undefined =
    session.items.find((i) => i.item.id === session.current_item_id) ?? open[0];
  const done = session.items.length - open.length;

  // Vorlesen (#434): the front of a card is read when it comes up, a tap on it reads it again;
  // nothing listens (she rates herself, there is no spoken answer). The back is never read
  // unasked — it is what she tries to remember.
  const words = useSpokenWords();
  const facing = current && turned !== current.item.id ? current.item : null;
  const readFront = useQuestionVoice(facing, words, t, { listens: false });

  // The back of a card is a change on screen a screen reader must hear, not see.
  const showing = current && turned === current.item.id ? current.answer : null;
  useEffect(() => {
    if (showing) announce(`${t('practice:cards.back_label')}: ${showing}`);
  }, [showing]);

  async function rate(itemId: string, recall: CardRecall): Promise<void> {
    if (working.current) return;
    working.current = true;
    haptic.tap();
    setBusy(true);
    try {
      await onChange(await recordCard(session.id, itemId, recall));
      // The next card starts face up; this one is done either way.
      setTurned(null);
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  // ─────────────── the end of the pass ───────────────

  if (!current) {
    const finished = session.status === 'finished';
    return (
      <Screen title={title}>
        <PassEnd
          finished={finished}
          title={t('practice:cards.done_title')}
          line={t('practice:cards.done_body')}
        />
        <BottomBar>
          <Btn size="lg" pill full onPress={onClose}>
            {t('practice:back_to_buddy')}
          </Btn>
        </BottomBar>
      </Screen>
    );
  }

  // ─────────────── one card ───────────────

  const front = current.item.prompt;
  // The server sends the back of every open card in a pass; without it there is nothing to
  // turn over, so the card stays face up rather than showing an empty side.
  const back = current.answer;
  const faceUp = turned !== current.item.id || back === null;
  // Her questions about this card and the tutor's replies; the next card starts without them.
  const turns = session.turns.filter((turn) => turn.item_id === current.item.id);
  const talking = turns.length > 0 || asked.pending !== null;

  const rating = (recall: CardRecall, label: string, hint: string) => (
    <View style={{ flex: 1 }}>
      <Btn
        size="md"
        variant="soft"
        pill
        full
        busy={busy}
        onPress={() => void rate(current.item.id, recall)}
        accessibilityHint={hint}
      >
        {label}
      </Btn>
    </View>
  );

  return (
    // The practice screens' header (issue #334.1, #384): the run's name on one line and the round ✕.
    <Screen
      title={title}
      right={
        <HeadActions>
          <EndButton
            onPress={onClose}
            label={t('practice:cards.end_label')}
            hint={t('practice:cards.end_hint')}
          />
        </HeadActions>
      }
    >
      <View style={{ flex: 1, paddingHorizontal: SPACE.lg, gap: SPACE.md }}>
        <ProgressRow
          position={done + 1}
          total={session.items.length}
          closed={done}
          label={t('practice:cards.progress', {
            current: done + 1,
            total: session.items.length,
          })}
        />
        {/* What this run is, said once — the same quiet line homework and a test get. */}
        <Text style={[TYPE.small, { color: palette.primaryDk, fontWeight: '500' }]}>
          {t('practice:cards.note')}
        </Text>
        {/* The card in the middle while it is alone; at the top once a conversation follows it. */}
        <View
          style={{ flexGrow: talking ? 0 : 1, flexShrink: 0, justifyContent: 'center' }}
          testID="card"
        >
          <Card tone="lavender" padding={SPACE.xl} radius={24}>
            <View style={{ gap: SPACE.lg, alignItems: 'center' }}>
              <ReadAgain onRead={() => readFront(current.item)}>
                <Text
                  accessibilityRole="header"
                  numberOfLines={3}
                  style={[faceStyle(front), { textAlign: 'center' }]}
                >
                  {front}
                </Text>
              </ReadAgain>
              {isForeign(current.item.prompt_lang) ? (
                // A `<Btn>` sits at the start of its line unless it is `full` or `center`;
                // under a centred word that reads as a stray. The wrapper centres it without
                // changing the button (CLAUDE.md rule 13: it stays the shared component).
                <View style={{ alignSelf: 'center' }}>
                  <ListenButton text={front} lang={current.item.prompt_lang} disabled={busy} />
                </View>
              ) : null}
              {!faceUp && back !== null ? (
                <Rise style={{ alignSelf: 'stretch', alignItems: 'center', gap: SPACE.lg }}>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      alignSelf: 'stretch',
                      height: 1,
                      backgroundColor: palette.lavenderDeep,
                    }}
                  />
                  <Text
                    numberOfLines={3}
                    style={[faceStyle(back), { textAlign: 'center', color: palette.primaryDk }]}
                  >
                    {back}
                  </Text>
                  {isForeign(current.item.lang) ? (
                    <View style={{ alignSelf: 'center' }}>
                      <ListenButton text={back} lang={current.item.lang} disabled={busy} />
                    </View>
                  ) : null}
                </Rise>
              ) : null}
            </View>
          </Card>
        </View>
        {talking ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: SPACE.sm }}>
            <ItemThread
              turns={turns}
              pending={asked.pending}
              asking
              later={{ onKeep: (turnId) => void asked.onKeep(turnId), disabled: busy }}
            />
          </ScrollView>
        ) : null}
      </View>
      {/* The one input bar (#384): her question in the field, the card's action where "Prüfen"
          stands. Equal weight for the two answers on purpose: the screen must not make one of
          them the easy one. */}
      <CheckBar
        own={
          faceUp
            ? {
                inBar: (
                  <Btn
                    size="sm"
                    pill
                    keepsFocus
                    disabled={busy || back === null}
                    onPress={() => {
                      haptic.select();
                      setTurned(current.item.id);
                    }}
                    accessibilityHint={t('practice:cards.turn_hint')}
                  >
                    {t('practice:cards.turn')}
                  </Btn>
                ),
                across: null,
              }
            : {
                inBar: null,
                across: (
                  <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                    {rating(
                      'not_yet',
                      t('practice:cards.not_yet'),
                      t('practice:cards.not_yet_hint'),
                    )}
                    {rating('knew_it', t('practice:cards.knew'), t('practice:cards.knew_hint'))}
                  </View>
                ),
              }
        }
      />
    </Screen>
  );
}
