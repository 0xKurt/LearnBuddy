// The Hörtext of a listening question: play it, play it again, play it slower (issue #210).
//
// Two pills in the row under the question — the same pair as "Anhören / Langsam" over a
// vocabulary word (`ListenButton`), because it is the same action and the app says the same
// thing the same way (issue #186). What is different is where the sound comes from: the text
// is the source of every answer, so it is not on the phone. The app asks for the AUDIO of this
// question (`POST /practice/sessions/:id/listen`) and plays what comes back.
//
// There is no local cache of the recording, and that is deliberate twice over: the audio IS
// the text in another form, so a file of it lying in the phone's cache directory would be the
// solution kept on the device — and it is not needed, because the server serves every replay
// after the first from the cache every spoken sentence already uses. So: fetch, play, delete
// (`naturalAudio.ts` does the same for Buddy's voice).
//
// There is no limit on how often she may listen. A class test plays the text twice; this is
// practice, and a replay she is refused teaches nothing but panic. The slower pass is the same
// recording read more slowly, not a second kind of listening — hence the quieter ghost pill.

import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { listenToItem } from '../../lib/api/endpoints.js';
import { audioUri, releaseAudio } from '../../lib/speech/naturalAudio.js';
import { playAudio } from '../../lib/speech/naturalPlayer.js';
import { usePlayback } from '../../lib/speech/usePlayback.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';

type Props = {
  sessionId: string;
  itemId: string;
  /** She has already heard this recording in this run: the question is about the same text. */
  heard: boolean;
  /** Called the moment sound really starts, so the next question says "nochmal". */
  onHeard: () => void;
  disabled?: boolean;
};

/** A pass of the recording: the normal speed, or the slower one. */
export type Pass = 'normal' | 'slow';

/**
 * Fetching and playing one question's recording (issue #210), shared by the two pills below and
 * the Diktat card (issue #242, `DictationCard.tsx`): the same request, the same "nothing kept on
 * the phone", the same stop-on-leave. Tapping the pass that runs stops it; the other one switches.
 */
export function useHearText(sessionId: string, itemId: string, onHeard: () => void) {
  const { t } = useTranslation('practice');
  // `busy`: which pass is being fetched or playing; `playing`: which one really sounds. Leaving
  // the question (or the screen) stops the text mid-sentence: the next question's text must not
  // play over this one, and nothing of hers keeps sounding after she left. A recording that
  // arrived and still did not play is said (`listen.failed`), instead of leaving her waiting for
  // a text she is supposed to answer questions about; a failed fetch says why.
  const { busy, playing, toggle } = usePlayback<Pass>({ text: t('listen.failed'), tone: 'error' });

  /**
   * Tapping the pill that is running means "stop"; tapping the other one switches passes, so
   * "Langsam" while the normal speed plays does what it says.
   */
  function play(pass: Pass): void {
    toggle(pass, async ({ live, started, ended }) => {
      const audio = await listenToItem(sessionId, {
        item_id: itemId,
        ...(pass === 'slow' ? { slow: true } : {}),
      });
      const uri = audioUri(audio.audio_base64, audio.mime);
      if (!live()) {
        releaseAudio(uri);
        return null;
      }
      return playAudio(uri, {
        onStart: () => {
          if (!live()) return;
          started();
          onHeard();
        },
        onProgress: () => undefined,
        onEnd: (why) => {
          releaseAudio(uri);
          ended(why);
        },
      }).stop;
    });
  }

  /** Fetching, not yet sounding: the pill shows its spinner. */
  const loading = (pass: Pass): boolean => busy === pass && playing === null;
  /** Something is being fetched: the other pill waits. */
  const fetching = busy !== null && playing === null;
  return { busy, playing, play, loading, fetching };
}

export function HearText({ sessionId, itemId, heard, onHeard, disabled = false }: Props) {
  const { t } = useTranslation('practice');
  const { busy, playing, play } = useHearText(sessionId, itemId, onHeard);

  // What stands on the pills, and what a screen reader hears. The state is in the words, never
  // in the colour alone: while something plays, both say "Anhalten".
  const label = (pass: Pass): string =>
    playing === pass || (busy === pass && playing === null)
      ? t(playing === pass ? 'listen.stop' : 'listen.loading')
      : pass === 'slow'
        ? t('speak.listen_slow_short')
        : heard
          ? t('listen.again')
          : t('listen.play');

  const off = disabled || (busy !== null && playing === null);

  return (
    <>
      <Btn
        size="sm"
        pill
        variant="soft"
        {...(playing === 'normal' ? { icon: 'stop' as const } : { icon: 'speak' as const })}
        busy={busy === 'normal' && playing === null}
        disabled={off && busy !== 'normal'}
        onPress={() => play('normal')}
        accessibilityLabel={playing === 'normal' ? t('listen.stop') : t('listen.play')}
        {...(playing === 'normal' ? {} : { accessibilityHint: t('listen.hint') })}
      >
        {label('normal')}
      </Btn>
      {/* The slower pass: the same listening, so it is the quieter pill without the icon. */}
      <Btn
        size="sm"
        pill
        variant="ghost"
        {...(playing === 'slow' ? { icon: 'stop' as const } : {})}
        busy={busy === 'slow' && playing === null}
        disabled={off && busy !== 'slow'}
        onPress={() => play('slow')}
        accessibilityLabel={playing === 'slow' ? t('listen.stop') : t('speak.listen_slow')}
      >
        {label('slow')}
      </Btn>
    </>
  );
}

/**
 * The words of the Hörtext, once the question is closed (issue #210). This is the whole point
 * of the form's order: she hears it, answers, and only then reads what was said — so the text
 * arrives from the server at the same moment the solution does (`listen_transcript`), never
 * before. A text she can now read is also a text she can listen to again while reading, which
 * is what the pills above the card keep doing.
 */
export function HeardTextCard({ text }: { text: string }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <Card tone="sky" padding={20} radius={24}>
      <Text style={[TYPE.body, { color: palette.ink2, fontWeight: '600' }]}>
        {t('listen.transcript_title')}
      </Text>
      <Text style={[TYPE.body, { marginTop: 4 }]}>{text}</Text>
    </Card>
  );
}
