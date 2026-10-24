// One word on its own (issue #83): she taps a word she got wrong and practises just that —
// hear it, hear it slowly, read the tip, say it and see what came out. Nothing here counts
// towards the question: the sentence keeps its attempts and its state, and nothing is stored.
//
// The sheet closes with a visible button, like every sheet (CLAUDE.md rule 14).

import { PronunciationStatus } from './PronunciationStatus.js';
import {
  pronunciationKey,
  type PronunciationPlan,
  type SpeakWordResponse,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { speakWord } from '../../lib/api/learningEndpoints.js';
import { messageFor } from '../../lib/errors.js';
import { useLocalPronunciation } from '../../lib/speech/usePronunciation.js';
import { pronunciationSubmission } from '../../lib/speech/pronunciation.js';
import { type Recording } from '../../lib/speech/record.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useMounted } from '../../lib/useMounted.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useMicRecorder } from '../voice/useMicRecorder.js';
import { Sheet, SHEET_TEXT } from '../lb/Sheet.js';
import { ListenButton } from './ListenButton.js';

export type SpokenWord = { text: string; ok: boolean; tip: string | null };

type Props = {
  /** The word she tapped; null keeps the sheet closed. */
  word: SpokenWord | null;
  plan?: PronunciationPlan | null;
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
  plan,
}: Omit<Props, 'word'> & { word: SpokenWord }) {
  const mounted = useMounted();
  const { palette } = useTheme();
  const { t } = useTranslation(['practice', 'common']);
  /** What came back for the try she just made; null before the first one. */
  const [tried, setTried] = useState<SpeakWordResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const recordedLocally = useRef(false);
  const checking = useRef<AbortController | null>(null);
  useEffect(() => () => checking.current?.abort(), []);
  const target = plan?.words.find(
    (w) => pronunciationKey(w.expected) === pronunciationKey(word.text),
  );
  const { local, pack } = useLocalPronunciation(target ? plan?.language : undefined);

  async function judge(r: Recording, text: string): Promise<void> {
    if (!mounted.current) return;
    const controller = new AbortController();
    checking.current = controller;
    setSending(true);
    setProblem(null);
    try {
      const target = plan?.words.find(
        (w) => pronunciationKey(w.expected) === pronunciationKey(text),
      );
      const wordPlan = plan && target ? { ...plan, words: [{ ...target, expected: text }] } : null;
      const submission = await pronunciationSubmission(
        { pronunciation_plan: wordPlan },
        { mime: r.mime, audio_base64: r.base64 },
        recordedLocally.current,
        controller.signal,
      );
      if (!mounted.current || controller.signal.aborted) return;
      const res = await speakWord(sessionId, {
        item_id: itemId,
        word: text,
        ...submission,
      });
      if (mounted.current) setTried(res);
    } catch (err) {
      if (mounted.current) setProblem(messageFor(err));
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  const rec = useMicRecorder({
    onRecorded: (r) => {
      void judge(r, word.text);
    },
  });

  function close(): void {
    checking.current?.abort();
    void rec.cancel();
    setTried(null);
    setProblem(null);
    onClose();
  }

  const recording = rec.phase === 'recording';
  /** The fixed help answer stands alone: nothing was judged (#785, CLAUDE.md rule 18). */
  const helpAlone = tried?.help != null && !tried.audible;
  const tip = helpAlone || tried?.audible === false ? null : (tried?.tip ?? word.tip);

  return (
    <Sheet visible title={word.text} closeLabel={t('common:actions.close')} onClose={close}>
      <View style={{ gap: SPACE.md }}>
        <Text style={[TYPE.meta, SHEET_TEXT]}>{t('practice:speak.word_hint')}</Text>
        <View style={SHEET_TEXT}>
          <PronunciationStatus local={local} pack={pack} />
        </View>
        <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <ListenButton source={{ text: word.text, lang }} slow disabled={recording} />
        </View>

        {tip ? <Text style={[TYPE.body, SHEET_TEXT]}>{tip}</Text> : null}
        {helpAlone && !sending ? (
          <Text accessibilityLiveRegion="polite" style={[TYPE.body, SHEET_TEXT]}>
            {tried?.help}
          </Text>
        ) : null}

        {problem ? (
          <Text accessibilityRole="alert" style={[TYPE.body, SHEET_TEXT, { color: palette.ink2 }]}>
            {problem}
          </Text>
        ) : null}
        {tried && !helpAlone && !sending ? (
          <View accessibilityLiveRegion="polite" style={[SHEET_TEXT, { gap: SPACE.xs }]}>
            <Text
              style={[
                TYPE.body,
                {
                  ...TYPE.title,
                  color: !tried.audible
                    ? palette.ink2
                    : tried.ok
                      ? palette.successText
                      : palette.warningText,
                },
              ]}
            >
              {t(
                !tried.audible
                  ? 'practice:speak.uncertain'
                  : tried.ok
                    ? 'practice:speak.word_good'
                    : 'practice:speak.word_again',
              )}
            </Text>
            {tried.heard ? (
              <Text style={TYPE.meta}>{t('practice:speak.heard', { text: tried.heard })}</Text>
            ) : null}
            {tried.help ? <Text style={TYPE.body}>{tried.help}</Text> : null}
          </View>
        ) : null}

        <View style={SHEET_TEXT}>
          <MicStatus voice={rec.voice} />
        </View>
        <MicButton
          voice={rec.voice}
          presentation="recorder"
          label={t('practice:speak.word_say')}
          busy={sending}
          busyLabel={t('practice:speak.listening')}
          onPress={() => {
            if (recording) {
              void rec.stop();
              return;
            }
            setProblem(null);
            setTried(null);
            // Buddy's voice must not end up in her recording.
            recordedLocally.current = local;
            void rec.start();
          }}
        />
      </View>
    </Sheet>
  );
}
