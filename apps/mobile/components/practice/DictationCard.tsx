// The Diktat question (issue #242): the card IS the play control.
//
// A Diktat has no text to read — the word must not be on the screen — so an ordinary question
// card would be one line over an empty middle, with the way to hear the word as a small pill
// under it (the gap #286 names). Here the one thing she does first stands in the card, large
// and centred: "Anhören". The slower pass is the quiet pill beside it, as everywhere else
// (`HearText`). The card takes the room the conversation does not need yet and gives it back as
// soon as there is a reply to show (`minHeight`, measured by the screen).
//
// The playback is the Hörverstehen chain (`useHearText`): the app asks the server for the audio
// of this question and plays it; the word itself never reaches the phone before she answered.

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { useHearText } from './HearText.js';

type Props = {
  sessionId: string;
  itemId: string;
  /** The fixed line the server wrote ("Hör zu und schreib das Wort."). */
  prompt: string;
  /** She has already heard it: the big button says "Nochmal hören" and steps back. */
  heard: boolean;
  onHeard: () => void;
  disabled?: boolean;
  /** The room the screen grants the card while the conversation is still empty. */
  minHeight?: number;
  /**
   * There is a conversation under the card: it shrinks to one row — "Nochmal hören" and
   * "Langsam" — so the replies sit directly under it, with no empty block in the card and no
   * bubble pushed half under its edge (orchestrator review of #286).
   */
  compact?: boolean;
};

export function DictationCard({
  sessionId,
  itemId,
  prompt,
  heard,
  onHeard,
  disabled = false,
  minHeight,
  compact = false,
}: Props) {
  const { t } = useTranslation('practice');
  const { playing, play, loading, fetching } = useHearText(sessionId, itemId, onHeard);
  const grown = !compact && minHeight !== undefined && minHeight > 0;

  const mainLabel =
    playing === 'normal'
      ? t('listen.stop')
      : loading('normal')
        ? t('listen.loading')
        : heard
          ? t('dictation.again')
          : t('dictation.play');

  if (compact) {
    return (
      <Card tone="lavender" padding={SPACE.md} radius={24}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACE.sm,
          }}
        >
          <Btn
            size="md"
            pill
            variant="outline"
            icon={playing === 'normal' ? 'stop' : 'speak'}
            busy={loading('normal')}
            disabled={disabled || (fetching && !loading('normal'))}
            onPress={() => void play('normal')}
            accessibilityLabel={mainLabel}
            {...(playing === 'normal' ? {} : { accessibilityHint: t('dictation.play_hint') })}
          >
            {mainLabel}
          </Btn>
          <Btn
            size="sm"
            pill
            variant="ghost"
            {...(playing === 'slow' ? { icon: 'stop' as const } : {})}
            busy={loading('slow')}
            disabled={disabled || (fetching && !loading('slow'))}
            onPress={() => void play('slow')}
            accessibilityLabel={playing === 'slow' ? t('listen.stop') : t('speak.listen_slow')}
          >
            {playing === 'slow' ? t('listen.stop') : t('speak.listen_slow_short')}
          </Btn>
        </View>
      </Card>
    );
  }

  return (
    <Card tone="lavender" padding={18} radius={24} style={grown ? { minHeight } : null}>
      {/* One centred group — the line and the way to hear it — in the middle of the room the
          card was given, so the space reads as the place to listen, not as a gap. No topic line:
          the run's title above already says it, and a second grey label is noise (#286). */}
      <View
        style={[
          { alignItems: 'center', justifyContent: 'center', gap: SPACE.lg },
          grown ? { flexGrow: 1 } : { paddingVertical: SPACE.sm },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[
            TYPE.title,
            { fontSize: 21, lineHeight: 29, fontWeight: '500', textAlign: 'center' },
          ]}
        >
          {prompt}
        </Text>
        {/* A column, never a row that wraps: "Nochmal hören" and "Langsam" do not fit side by
            side on 360 pt, and a pair that breaks differently per state looks ragged (#286). */}
        <View style={{ alignItems: 'center', gap: SPACE.xs }}>
          {/* The first thing she does is hear it: the one filled button on the screen until she
              has. After that it steps back to an outline, so "Prüfen" is the strong one — and it
              stays clearly a button on the lavender card, which the soft fill did not. */}
          <Btn
            size="lg"
            pill
            variant={heard ? 'outline' : 'primary'}
            icon={playing === 'normal' ? 'stop' : 'speak'}
            busy={loading('normal')}
            disabled={disabled || (fetching && !loading('normal'))}
            onPress={() => void play('normal')}
            accessibilityLabel={mainLabel}
            {...(playing === 'normal' ? {} : { accessibilityHint: t('dictation.play_hint') })}
          >
            {mainLabel}
          </Btn>
          <Btn
            size="sm"
            pill
            variant="ghost"
            {...(playing === 'slow' ? { icon: 'stop' as const } : {})}
            busy={loading('slow')}
            disabled={disabled || (fetching && !loading('slow'))}
            onPress={() => void play('slow')}
            accessibilityLabel={playing === 'slow' ? t('listen.stop') : t('speak.listen_slow')}
          >
            {playing === 'slow' ? t('listen.stop') : t('speak.listen_slow')}
          </Btn>
        </View>
      </View>
    </Card>
  );
}
