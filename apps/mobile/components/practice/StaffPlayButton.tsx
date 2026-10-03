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
  /**
   * Nur der Lautsprecher, in voller Breite ihrer Zelle: auf der Schreibfläche steht der Knopf in
   * einer Reihe aus sechs gleich breiten Tasten (issue #275), und „Anhören" passt auf ein Sechstel
   * von 328 pt nicht. Dieselbe Pille, dieselbe Farbe, dasselbe Zeichen — nur ohne das Wort, das
   * der Screenreader weiter hört.
   */
  iconOnly?: boolean;
};

export function StaffPlayButton({ bars, tempo, disabled = false, iconOnly = false }: Props) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
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
        {...(iconOnly
          ? {
              full: true,
              compact: true,
              label: (
                <View style={{ alignItems: 'center' }}>
                  <Icon
                    name={playing ? 'stop' : 'speak'}
                    size={24}
                    color={off ? palette.ink2 : palette.primaryDk}
                  />
                </View>
              ),
            }
          : { icon: playing ? 'stop' : 'speak' })}
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
