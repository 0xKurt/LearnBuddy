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
// In voice mode the spoken answer is the main control (the big mic, issue #310 §3.1 "voice slot"):
// it stands in this bar right above "Prüfen", and "Prüfen" steps back to the soft skin — the
// field is still there for typing, but the mic is what voice mode is for.
//
// It waits until the answer is complete. While it waits it says why to a screen reader (the
// form's own hint: "Leg erst alle an ihren Platz"), and a tap on it does nothing — the button
// wears the waiting skin (`Btn`, issue #97).

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Btn } from '../lb/Btn.js';
import { BottomBar } from './BottomBar.js';

/** What a form hands to the bar: when its answer may go, how it goes, and why it waits. */
export type CheckAction = {
  /** Her answer is complete. */
  ready: boolean;
  /** The question is locked (sending, or answered). */
  disabled: boolean;
  onPress: () => void;
  /** Said while it waits: what is still missing. */
  waitsHint: string;
  /** Voice mode: the big mic, above "Prüfen" (undefined: none). */
  voice?: ReactNode;
};

export function CheckBar({ ready, disabled, onPress, waitsHint, voice }: CheckAction) {
  const { t } = useTranslation('practice');
  return (
    <BottomBar>
      {voice ? (
        <View testID="answer-voice" style={{ alignItems: 'center' }}>
          {voice}
        </View>
      ) : null}
      <View testID="answer-action">
        <Btn
          size="md"
          variant={voice ? 'soft' : 'primary'}
          pill
          full
          disabled={disabled || !ready}
          onPress={onPress}
          accessibilityHint={ready ? undefined : waitsHint}
        >
          {t('check')}
        </Btn>
      </View>
    </BottomBar>
  );
}
