// "Prüfen", once for every form (issue #310). Before this each board built its own bar with its
// own button (order, match, table, cloze), and the note line had a bigger one built by the screen;
// now an answer form says only WHEN its answer is complete and WHAT to send, and this bar is the
// one place and the one look of the action: pinned at the bottom (`BottomBar`, outside every
// scroll, above the keyboard), a pill over the full width.
//
// Its size is the boards' (md, 48 pt), not the 54 pt of "Weiter": the largest boards the contract
// allows are measured against this bar on 360×740, and 6 pt more pushed a match and an order with
// Buddy's reply into scrolling (walkthrough 38-order-feedback, 39e-match-feedback, #310).
//
// The bar is the app's one input bar (`InputBar`, issue #395, report #388 §9), with "Prüfen" in
// its action slot, as the chat has "Senden" there:
//   · a typed answer brings its own input bar, with the field (issue #365): the same bar as the
//     chat's, at the bottom, never floating under the question. While she types, "Prüfen" stands
//     in it at the pill's end (`CheckInBar`); otherwise across the bar under the pill;
//   · a board (order, match, table, cloze, mark, select-all, the note line) has nothing to type
//     yet, so its input bar comes without the field (`field={false}`), and "Prüfen" stands alone
//     across it — exactly where and how it stood in the bar of its own it had before #395. The
//     field ("Frag zur Aufgabe …") joins it with the question route (#388 step 6).
//
// In voice mode the spoken answer is the main control (the big mic, issue #310 §3.1 "voice slot"):
// it stands in this bar above the input bar, and "Prüfen" steps back to the soft skin — the
// field is still there for typing, but the mic is what voice mode is for.
//
// It waits until the answer is complete. While it waits it says why to a screen reader (the
// form's own hint: "Leg erst alle an ihren Platz"), and a tap on it does nothing — the button
// wears the waiting skin (`Btn`, issue #97).
//
// Two other actions stand in the same place, so nothing about where the bottom of the screen is
// depends on the form (issue #310, the notes of step 3):
//   · `tap` — options answered by a tap on the tile (multiple choice, tapped words). There is no
//     "Prüfen"; in voice mode the spoken answer still has its place here (the voice slot: the
//     mic and "Nochmal vorlesen", before #310 a bar of its own under the options), and without
//     voice the bar is only the screen edge's room;
//   · `bar` — the question's own pinned bar: "Weiter" once it is closed, the pronunciation
//     recorder. The shell places it like "Prüfen", at the bottom.

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bottomRoom, SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { BottomBar } from '../lb/BottomBar.js';
import { InputBar } from '../lb/InputBar.js';

/** "Prüfen": what a form hands to the bar — when its answer may go, how it goes, and why it waits. */
type Check = {
  /** Her answer is complete. */
  ready: boolean;
  /** The question is locked (sending, or answered). */
  disabled: boolean;
  onPress: () => void;
  /** Said while it waits: what is still missing. */
  waitsHint: string;
  /** Voice mode: the big mic, above "Prüfen" (undefined: none). */
  voice?: ReactNode;
  /**
   * The input bar a typed answer is written in (`InputBar`, issue #365), with the keys she types
   * with: right above "Prüfen", in the same pinned bar, like the chat's. Handed what stands at the
   * bar's end while she types: "Prüfen" itself (null while there is nothing to check).
   */
  input?: (checkInBar: ReactNode) => ReactNode;
  /**
   * She is typing in that bar: "Prüfen" stands in the bar itself (`CheckInBar`), as "Senden" does
   * in the chat, and the full-width one steps aside — with the keyboard up on a small phone it
   * would push the bar she types in under the keyboard.
   */
  typing?: boolean;
};

/** The tile is the action; in voice mode the spoken answer has the voice slot. */
type Tap = { tap: true; voice?: ReactNode };

/** The question's own pinned bar ("Weiter", the recorder), in the action's place. */
type OwnBar = { bar: ReactNode };

export type CheckAction = Check | Tap | OwnBar;

export function CheckBar(action: CheckAction) {
  const insets = useSafeAreaInsets();
  if ('bar' in action) return <>{action.bar}</>;
  if ('tap' in action) {
    if (action.voice) return <VoiceSlot voice={action.voice} bar />;
    // Nothing pinned: only the room the screen's edge needs under the options.
    return <View style={{ height: bottomRoom(insets.bottom, SPACE.md) }} />;
  }
  return <CheckButton {...action} />;
}

/** The spoken answer, centred above "Prüfen" — or alone in its bar, for options. */
function VoiceSlot({ voice, bar = false }: { voice: ReactNode; bar?: boolean }) {
  const slot = (
    <View testID="answer-voice" style={{ alignItems: 'center' }}>
      {voice}
    </View>
  );
  return bar ? <BottomBar>{slot}</BottomBar> : slot;
}

function CheckButton(check: Check) {
  const { voice, input, typing, ready } = check;
  const across = <CheckBtn {...check} across />;
  return (
    <BottomBar>
      {voice ? <VoiceSlot voice={voice} /> : null}
      {input ? (
        <>
          {input(typing && ready ? <CheckBtn {...check} /> : null)}
          {typing ? null : across}
        </>
      ) : (
        // A board: the input bar without its field, "Prüfen" its action (#395).
        <InputBar field={false} action={across} />
      )}
    </BottomBar>
  );
}

/**
 * "Prüfen" itself, in one of two places. `across`: over the bar's full width (md, the boards'
 * size), the soft skin in voice mode. Otherwise inside the input bar while she types (issue
 * #365), where the chat's "Senden" is: small, at the pill's end, and it keeps the focus in the
 * field, so a tap never closes the keyboard under her finger before it lands.
 */
function CheckBtn({
  ready,
  disabled,
  onPress,
  waitsHint,
  voice,
  across = false,
}: Check & { across?: boolean }) {
  const { t } = useTranslation('practice');
  return (
    <View testID="answer-action">
      <Btn
        size={across ? 'md' : 'sm'}
        variant={across && voice ? 'soft' : 'primary'}
        pill
        full={across}
        keepsFocus={!across}
        disabled={disabled || !ready}
        onPress={onPress}
        accessibilityHint={ready ? undefined : waitsHint}
      >
        {t('check')}
      </Btn>
    </View>
  );
}
