// "Anhören": hearing a word or a sentence read aloud in its language (lib/speech/listen.ts) — or
// the tones of an interval she names by ear (issue #445, `tones`). Tapping it again while it plays
// stops it. Both through the one listening hook (`useListenToggle`).
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

import type { HeardTones } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { useListenToggle } from './useListenToggle.js';

type Props = (
  | {
      text: string;
      /** The text's language (ISO 639-1, e.g. "fr"). */
      lang: string;
      /** The same listening, at the slower "langsam" speed — a variant, never a second way. */
      slow?: boolean;
    }
  | {
      /** Tones the app makes (issue #445): what she names by ear. */
      tones: HeardTones;
    }
) & { disabled?: boolean };

export function ListenButton(props: Props) {
  const { t } = useTranslation('practice');
  const { disabled = false } = props;
  const slow = 'text' in props && props.slow === true;
  const { playing, press } = useListenToggle(props);

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
  const off = disabled || ('text' in props && props.text.trim().length === 0);

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
