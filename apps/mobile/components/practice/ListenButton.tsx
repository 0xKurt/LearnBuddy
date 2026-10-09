// The one listen control of the app's practice (issue #311 step 2): "Anhören" for a word, a
// sentence, a card's face, the tones of an interval, a drawn note line, a Hörtext and a Diktat.
// Where the sound comes from is `useListen`'s; how the control looks and what it says is decided
// here, once (issue #186, owner 01.10.: "ich weiss auch nicht wieso das vom design so anders ist"):
//
//   · the same states everywhere — ready ("Anhören", or "Nochmal hören" once she heard it),
//     loading ("Lädt …", a recording on its way), playing ("Anhalten"); a sound that could not be
//     made is said by the one playback state (`usePlayback`) and the control is ready again. The
//     state is in the words and the icon, never in the colour alone;
//   · the same small soft pill with the speaker — larger only where hearing IS the question (the
//     Diktat card), the speaker alone only where a column beside a note line has no room for words;
//   · `slow` is NOT a second way to listen: it is the same one, slower, sharing its state. So it is
//     the quieter ghost pill beside its sibling, without the speaker, labelled with the modifier
//     alone ("Langsam") while a screen reader hears the whole action ("Langsam anhören").
//
// It renders a fragment: the caller's row or column decides where the pair stands.

import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { type ListenSource, type Pass, sourceKind, useListen } from './useListen.js';

type Props = {
  source: ListenSource;
  /** The slower pass beside it, as the quiet pill. */
  slow?: boolean;
  /** She heard it before in this run: "Nochmal hören". */
  heard?: boolean;
  /** Larger only where hearing is the question itself (the Diktat card). */
  size?: 'sm' | 'md' | 'lg';
  variant?: 'soft' | 'outline' | 'primary';
  /** The speaker alone, the full width of its column (beside a note line, issue #275). */
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
  size = 'sm',
  variant = 'soft',
  speakerOnly = false,
  hint,
  disabled = false,
}: Props) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  const { state, play, fetching } = useListen(source);
  /** Nothing to hear: no words, or a line without a note. */
  const nothing =
    'text' in source
      ? source.text.trim().length === 0
      : 'tones' in source && source.tones.bars.length === 0;

  /** A running pass stays tappable — tapping it is how she stops it. */
  const off = (pass: Pass): boolean => state(pass) === 'ready' && (disabled || nothing || fetching);
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
      <Btn
        size={size}
        pill
        variant={variant}
        {...(speakerOnly
          ? {
              full: true,
              compact: true,
              label: (
                <View style={{ alignItems: 'center' }}>
                  <Icon
                    name={mainIcon}
                    size={24}
                    color={off('normal') ? palette.ink2 : palette.primaryDk}
                  />
                </View>
              ),
            }
          : { icon: mainIcon })}
        busy={state('normal') === 'loading'}
        disabled={off('normal')}
        onPress={() => play('normal')}
        accessibilityLabel={main}
        {...mainHint}
      >
        {main}
      </Btn>
      {slow ? (
        <Btn
          size="sm"
          pill
          variant="ghost"
          {...(state('slow') === 'playing' ? { icon: 'stop' as const } : {})}
          busy={state('slow') === 'loading'}
          disabled={off('slow')}
          onPress={() => play('slow')}
          accessibilityLabel={busyLabel('slow') ?? t('listen.slow_label')}
        >
          {busyLabel('slow') ?? t('listen.slow')}
        </Btn>
      ) : null}
    </>
  );
}
