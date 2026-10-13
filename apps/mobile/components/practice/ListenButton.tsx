// The one listen control of the app's practice (issue #311 step 2): "Anhören" for a word, a
// sentence, a card's face, the tones of an interval, a drawn note line, a Hörtext and a Diktat.
// Where the sound comes from is `useListen`'s; how the control looks and what it says is decided
// here, once (issue #186, owner 01.10.: "ich weiss auch nicht wieso das vom design so anders ist"):
//
//   · the same states everywhere — ready ("Anhören", or "Nochmal hören" once she heard it),
//     loading ("Lädt …", a recording on its way), playing ("Anhalten"); a sound that could not be
//     made is said by the one playback state (`usePlayback`) and the control is ready again. The
//     state is in the words and the icon, never in the colour alone;
//   · the same chip with the speaker (design ui_kits/app/Flows.jsx:120, `Chip icon="sound"`) — a
//     full button only where hearing IS the question (the Diktat card names its size and
//     variant), the speaker alone as a quiet round button where a column beside a note line has
//     no room for words;
//   · `slow` is NOT a second way to listen: it is the same one, slower, sharing its state. So it is
//     the chip beside its sibling without the speaker, labelled with the modifier alone
//     ("Langsam") while a screen reader hears the whole action ("Langsam anhören").
//
// It renders a fragment: the caller's row or column decides where the pair stands.

import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { Chip } from '../lb/Chip.js';
import { IconBtn } from '../lb/IconBtn.js';
import { type ListenSource, type Pass, sourceKind, useListen } from './useListen.js';

type Props = {
  source: ListenSource;
  /** The slower pass beside it, as the quiet pill. */
  slow?: boolean;
  /** She heard it before in this run: "Nochmal hören". */
  heard?: boolean;
  /**
   * A full button instead of the chip, in this size and variant: only where hearing is the
   * question itself (the Diktat card).
   */
  size?: 'md' | 'lg';
  variant?: 'secondary' | 'primary';
  /** The speaker alone, a quiet round button (beside a note line, issue #275). */
  speakerOnly?: boolean;
  /** What the screen reader hears it does, where the source alone does not say it. */
  hint?: string;
  disabled?: boolean;
};

const HINT = {
  text: 'listen.hint_words',
  tones: 'listen.hint_tones',
  item: 'listen.hint',
} as const;

export function ListenButton({
  source,
  slow = false,
  heard = false,
  size = 'md',
  variant,
  speakerOnly = false,
  hint,
  disabled = false,
}: Props) {
  const { t } = useTranslation('practice');
  const { state, play, fetching } = useListen(source);
  /** Nothing to hear: no words, or a line without a note. */
  const nothing =
    'text' in source
      ? source.text.trim().length === 0
      : 'tones' in source && source.tones.bars.length === 0;

  /** A running pass stays tappable — tapping it is how she stops it; a loading one waits. */
  const off = (pass: Pass): boolean =>
    state(pass) === 'loading' || (state(pass) === 'ready' && (disabled || nothing || fetching));
  const busyLabel = (pass: Pass): string | null =>
    state(pass) === 'playing'
      ? t('listen.stop')
      : state(pass) === 'loading'
        ? t('listen.loading')
        : null;

  const main = busyLabel('normal') ?? (heard ? t('listen.again') : t('listen.play'));
  const mainIcon = state('normal') === 'playing' ? 'stop' : 'speak';
  const mainHint =
    state('normal') === 'playing' ? {} : { accessibilityHint: hint ?? t(HINT[sourceKind(source)]) };

  return (
    <>
      {speakerOnly ? (
        <IconBtn
          icon={mainIcon}
          tone="quiet"
          busy={state('normal') === 'loading'}
          disabled={off('normal')}
          onPress={() => play('normal')}
          accessibilityLabel={main}
          {...mainHint}
        />
      ) : variant ? (
        <Btn
          size={size}
          pill
          variant={variant}
          icon={mainIcon}
          busy={state('normal') === 'loading'}
          disabled={off('normal')}
          onPress={() => play('normal')}
          accessibilityLabel={main}
          {...mainHint}
        >
          {main}
        </Btn>
      ) : (
        <Chip
          icon={mainIcon}
          disabled={off('normal')}
          onPress={() => play('normal')}
          accessibilityLabel={main}
          {...mainHint}
        >
          {main}
        </Chip>
      )}
      {slow ? (
        <Chip
          {...(state('slow') === 'playing' ? { icon: 'stop' as const } : {})}
          disabled={off('slow')}
          onPress={() => play('slow')}
          accessibilityLabel={busyLabel('slow') ?? t('listen.slow_label')}
        >
          {busyLabel('slow') ?? t('listen.slow')}
        </Chip>
      ) : null}
    </>
  );
}
