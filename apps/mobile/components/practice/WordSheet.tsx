// One word on its own (issue #83): she taps a word she got wrong and practises just that —
// hear it, hear it slowly, read the tip, say it and see what came out. Nothing here counts
// towards the question: the sentence keeps its attempts and its state, and nothing is stored.
//
// The sheet closes with a visible button, like every sheet (CLAUDE.md rule 14).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { BusyIndicator } from '../lb/BusyIndicator.js';
import { speakWord } from '../../lib/api/endpoints.js';
import { messageFor } from '../../lib/errors.js';
import { useRecording, type Recording } from '../../lib/speech/record.js';
import { stop as stopListening } from '../../lib/speech/listen.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useMounted } from '../../lib/useMounted.js';
import { Btn } from '../lb/Btn.js';
import { Sheet, SHEET_TEXT } from '../lb/Sheet.js';
import { ListenButton } from './ListenButton.js';

export type SpokenWord = { text: string; ok: boolean; tip: string | null };

type Props = {
  /** The word she tapped; null keeps the sheet closed. */
  word: SpokenWord | null;
  sessionId: string;
  itemId: string;
  /** The language of the sentence, for reading the word aloud. */
  lang: string;
  onClose: () => void;
};

export function WordSheet(props: Props) {
  const { word, sessionId, itemId, lang } = props;
  // Closing or changing the actual question/word owns a fresh attempt. A pending request
  // belongs to the old body, including when the same word is opened again.
  return word ? (
    <WordAttempt
      key={JSON.stringify([sessionId, itemId, lang, word.text])}
      {...props}
      word={word}
    />
  ) : null;
}

function WordAttempt({
  word,
  sessionId,
  itemId,
  lang,
  onClose,
}: Omit<Props, 'word'> & { word: SpokenWord }) {
  const mounted = useMounted();
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  /** What came back for the try she just made; null before the first one. */
  const [tried, setTried] = useState<{ ok: boolean; heard: string; tip: string | null } | null>(
    null,
  );
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function judge(r: Recording, text: string): Promise<void> {
    setSending(true);
    setProblem(null);
    try {
      const res = await speakWord(sessionId, {
        item_id: itemId,
        word: text,
        mime: r.mime,
        audio_base64: r.base64,
      });
      if (mounted.current) setTried({ ok: res.ok, heard: res.heard, tip: res.tip });
    } catch (err) {
      if (mounted.current) setProblem(messageFor(err));
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  const rec = useRecording({
    onRecorded: (r) => {
      void judge(r, word.text);
    },
    onFailed: () => setProblem(t('practice:speak.problem.failed')),
  });

  function close(): void {
    void rec.cancel();
    setTried(null);
    setProblem(null);
    onClose();
  }

  const recording = rec.phase === 'recording';
  const busy = sending || rec.phase === 'starting' || rec.phase === 'stopping';
  const tip = tried?.tip ?? word.tip;

  return (
    <Sheet visible title={word.text} closeLabel={t('common:actions.close')} onClose={close}>
      <View style={{ gap: SPACE.md }}>
        <Text style={[TYPE.meta, SHEET_TEXT]}>{t('practice:speak.word_hint')}</Text>
        <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <ListenButton source={{ text: word.text, lang }} slow disabled={recording} />
        </View>

        {tip ? <Text style={[TYPE.body, SHEET_TEXT]}>{tip}</Text> : null}

        {sending ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('practice:speak.listening')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
          >
            <BusyIndicator color={palette.primary} />
            <Text style={[TYPE.body, { color: palette.ink2 }]}>
              {t('practice:speak.listening')}
            </Text>
          </View>
        ) : null}
        {problem ? (
          <Text accessibilityRole="alert" style={[TYPE.body, SHEET_TEXT, { color: palette.ink2 }]}>
            {problem}
          </Text>
        ) : null}
        {tried && !sending ? (
          <View accessibilityLiveRegion="polite" style={[SHEET_TEXT, { gap: SPACE.xs }]}>
            <Text
              style={[
                TYPE.body,
                { ...TYPE.title, color: tried.ok ? palette.successText : palette.warningText },
              ]}
            >
              {t(tried.ok ? 'practice:speak.word_good' : 'practice:speak.word_again')}
            </Text>
            {tried.heard ? (
              <Text style={TYPE.meta}>{t('practice:speak.heard', { text: tried.heard })}</Text>
            ) : null}
          </View>
        ) : null}

        <Btn
          size="lg"
          full
          pill
          icon={recording ? 'stop' : 'mic'}
          busy={busy && !recording}
          onPress={() => {
            if (recording) {
              void rec.stop();
              return;
            }
            setProblem(null);
            setTried(null);
            // Buddy's voice must not end up in her recording.
            stopListening();
            void rec.start();
          }}
        >
          {t(recording ? 'practice:speak.record_stop' : 'practice:speak.word_say')}
        </Btn>
      </View>
    </Sheet>
  );
}
