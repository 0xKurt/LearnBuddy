// "Anhören": hearing a word or a sentence read aloud in its language
// (lib/speech/listen.ts). Tapping it again while it plays stops it.
//
// Its shape and its rank are decided here, once (issue #186). It is the same small soft
// pill the app already uses for "read this aloud" ("Nochmal vorlesen" over a question), so
// the same action looks the same wherever it stands — before this, the pronunciation bar
// drew it as an outlined box and the question above it as a pill, and the owner asked
// "ich weiss auch nicht wieso das vom design so anders ist" (01.10.).
//
// `slow` is NOT a second way to listen: it is this one, slower. So it renders as the
// quieter ghost pill beside its sibling, without the speaker icon and labelled with the
// modifier alone ("Langsam") — while a screen reader still hears the whole action
// ("Langsam anhören"). Two equal-rank buttons made her sort out every time which of the
// two mattered.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { speak, stop, type ListenEnd } from '../../lib/speech/listen.js';
import { Btn } from '../lb/Btn.js';
import { toast } from '../lb/Toast.js';

type Props = {
  text: string;
  /** The text's language (ISO 639-1, e.g. "fr"). */
  lang: string;
  /** The same listening, at the slower "langsam" speed — a variant, never a second way. */
  slow?: boolean;
  disabled?: boolean;
};

export function ListenButton({ text, lang, slow = false, disabled = false }: Props) {
  const { t } = useTranslation('practice');
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Stop reading when this button goes away mid-sentence (next question, leaving).
  const playingRef = useRef(false);
  playingRef.current = playing;
  useEffect(
    () => () => {
      if (playingRef.current) stop();
    },
    [],
  );

  function onEnd(why: ListenEnd): void {
    if (!mounted.current) return;
    setPlaying(false);
    if (why === 'error') toast.show(t('speak.no_voice'), 'info');
  }

  function press(): void {
    if (playing) {
      stop();
      return;
    }
    setPlaying(true);
    void speak(text, lang, { slow, onEnd });
  }

  // What stands on it, and what a screen reader hears. While it plays, both say "Anhalten":
  // the label is the state, never the colour alone.
  const label = playing
    ? t('speak.listen_stop')
    : slow
      ? t('speak.listen_slow_short')
      : t('speak.listen');
  const spoken = playing
    ? t('speak.listen_stop')
    : slow
      ? t('speak.listen_slow')
      : t('speak.listen');
  const off = disabled || text.trim().length === 0;

  return (
    <Btn
      size="sm"
      pill
      variant={slow ? 'ghost' : 'soft'}
      // The speaker belongs to the action; its slower variant does not repeat the icon.
      {...(playing ? { icon: 'stop' as const } : slow ? {} : { icon: 'speak' as const })}
      onPress={press}
      disabled={off}
      accessibilityLabel={spoken}
      {...(playing ? {} : { accessibilityHint: t('speak.listen_hint') })}
    >
      {label}
    </Btn>
  );
}
