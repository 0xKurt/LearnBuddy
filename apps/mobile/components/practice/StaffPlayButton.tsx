// „Anhören" für eine Notenzeile (issue #226: „Die kann man sich dann sogar anhören. Ist doch
// cool"). Tippen spielt die Zeile, nochmal tippen hält sie an.
//
// Dieselbe Pille wie `ListenButton`, mit demselben Lautsprecher und an derselben Stelle: dieselbe
// Handlung sieht überall gleich aus (issue #186, Owner 01.10.: „ich weiss auch nicht wieso das
// vom design so anders ist"). Es ist deshalb bewusst KEIN eigenes Bedienelement mit eigener Farbe
// — nur der Inhalt ist anders, ein Ton statt eines Wortes.
//
// Ein zweiter Button wäre `ListenButton` selbst mit anderem Text gewesen; daraus wurde nichts,
// weil der dort hinter `speak()` die Sprachstrecke anspricht (Stimme, Sprache, langsam) und eine
// Notenzeile keine Sprache hat. Gemeinsam ist das, was man sieht; getrennt ist, was klingt.

import type { StaffBars } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { playLine, stopNotes } from '../../lib/music/play.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { toast } from '../lb/Toast.js';

type Props = {
  bars: StaffBars;
  /** Viertel pro Minute — das Tempo steht in den Daten der Zeile. */
  tempo: number;
  disabled?: boolean;
};

/**
 * Eine Notenzeile spielen und anhalten (issue #226): geteilt von dieser Pille in der Karte und der
 * Taste „Anhören" in der Tastenreihe unter der Zeile, die sie schreibt (`StaffKeys`, issue #310) —
 * dasselbe Spielen, dasselbe Anhalten beim Verlassen, derselbe Satz, wenn kein Ton kommt.
 */
export function useStaffPlay(
  bars: StaffBars,
  tempo: number,
): { playing: boolean; press: () => void } {
  const { t } = useTranslation('practice');
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Beim Verlassen der Frage mitten im Ton: still werden, nicht weiterspielen.
  const playingRef = useRef(false);
  playingRef.current = playing;
  useEffect(
    () => () => {
      if (playingRef.current) stopNotes();
    },
    [],
  );

  function press(): void {
    if (playing) {
      stopNotes();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    playLine(bars, tempo, (why) => {
      if (!mounted.current) return;
      setPlaying(false);
      // Kein Ton zu hören (kein Audio erlaubt, Player blockiert): sagen statt schweigen.
      if (why === 'error') toast.show(t('staff.no_sound'), 'info');
    });
  }
  return { playing, press };
}

/**
 * Die Pille in der Karte, rechts neben der gelesenen Zeile (issue #275): nur der Lautsprecher, in
 * voller Breite ihrer Spalte — dieselbe Pille, dieselbe Farbe, dasselbe Zeichen wie „Anhören",
 * ohne das Wort, das der Screenreader weiter hört.
 */
export function StaffPlayButton({ bars, tempo, disabled = false }: Props) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  const { playing, press } = useStaffPlay(bars, tempo);

  const off = disabled || bars.length === 0;
  // Was draufsteht, ist auch der Zustand: niemals die Farbe allein.
  const label = playing ? t('staff.play_stop') : t('staff.play');
  return (
    // Der Name für den Walkthrough sitzt auf dem Rahmen: `Btn` nimmt keine testID, und das
    // soll es auch nicht — ein Knopf ist über seine Beschriftung zu finden.
    <View testID="staff-play">
      <Btn
        size="sm"
        pill
        variant="soft"
        full
        compact
        label={
          <View style={{ alignItems: 'center' }}>
            <Icon
              name={playing ? 'stop' : 'speak'}
              size={24}
              color={off ? palette.ink2 : palette.primaryDk}
            />
          </View>
        }
        onPress={press}
        disabled={off}
        accessibilityLabel={label}
        {...(playing ? {} : { accessibilityHint: t('staff.play_hint') })}
      >
        {label}
      </Btn>
    </View>
  );
}
