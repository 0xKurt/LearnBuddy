// "Erklär mir was", "Üben", typed vocabulary, sentences to say, a typed
// homework task: one sheet, a title and hint per kind, one field, a few
// one-tap examples and "Los geht's". The CTA is pinned under the field, above
// the keyboard (Sheet footer). On success the sheet closes and the session opens.
// The mic next to the field: saying it instead of typing. What she said lands in the field and
// she starts it herself, as in the chat composer (issue #386: no voice-first path beside it).

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { mergeTranscript } from '../../lib/speech/spoken.js';
import { TYPE } from '../../lib/theme/type.js';
import { SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { LbTextInput } from '../lb/LbTextInput.js';
import { Sheet } from '../lb/Sheet.js';
import { MicButton, MicStatus } from '../voice/MicButton.js';
import { useVoiceInput } from '../voice/useVoiceInput.js';
import { KIND_EXAMPLES } from './kinds.js';
import { StartStatus } from './StartStatus.js';
import { useStartTopic, type TopicKind } from './useStartTopic.js';

/** StartTopicRequest.text allows at most 3000 characters. */
const MAX_TEXT = 3000;

type Props = {
  /** The open sheet's kind; null = closed. */
  kind: TopicKind | null;
  onClose: () => void;
};

export function TopicSheet({ kind, onClose }: Props) {
  const { t } = useTranslation(['learn', 'common']);
  const { state, start, reset } = useStartTopic();
  const [text, setText] = useState('');
  // The kind shown while the sheet slides away (kind is already null then).
  const [shownKind, setShownKind] = useState<TopicKind>('practice');
  const openKind = useRef<TopicKind | null>(kind);
  openKind.current = kind;

  useEffect(() => {
    if (kind === null) return;
    setShownKind(kind);
    setText('');
    reset();
    // A fresh sheet per opening (reset only clears the shown state).
  }, [kind]);

  const k = kind ?? shownKind;
  const preparing = state.status === 'preparing';
  const canSubmit = !preparing && text.trim().length >= 2;
  const examples = Array.from({ length: KIND_EXAMPLES[k] }, (_, i) =>
    t(`learn:topic.${k}.ex_${i + 1}`),
  );

  const latest = useRef(text);
  latest.current = text;
  const voice = useVoiceInput({
    purpose: 'message',
    lang: null,
    onText: (said) => {
      setText(mergeTranscript(latest.current, said, 'append', MAX_TEXT));
      reset();
    },
  });

  async function submit(value: string = text): Promise<void> {
    if (preparing || value.trim().length < 2) return;
    const startedFor = k;
    const session = await start(startedFor, value);
    // Closed meanwhile: the home shows the session to resume instead.
    if (!session || openKind.current !== startedFor) return;
    onClose();
    router.push(`/practice/${session.id}`);
  }

  return (
    <Sheet
      visible={kind !== null}
      title={t(`learn:topic.${k}.title`)}
      closeLabel={t('common:actions.close')}
      onClose={onClose}
      footer={
        <Btn
          size="lg"
          full
          // Never a tap without an answer (issue #66): the button says it is working.
          busy={state.status === 'preparing'}
          disabled={!canSubmit}
          onPress={() => void submit()}
        >
          {state.status === 'preparing'
            ? t('learn:topic.preparing')
            : state.status === 'failed'
              ? t('common:actions.retry')
              : t('learn:topic.submit')}
        </Btn>
      }
    >
      <Text style={TYPE.small}>{t(`learn:topic.${k}.hint`)}</Text>
      <MicStatus voice={voice} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
        <View style={{ flex: 1 }}>
          <LbTextInput
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (state.status === 'not_usable') reset();
            }}
            placeholder={t(`learn:topic.${k}.placeholder`)}
            accessibilityLabel={t(`learn:topic.${k}.title`)}
            editable={!preparing}
            multiline
            maxLength={MAX_TEXT}
            autoFocus={KIND_EXAMPLES[k] === 0}
            autoCapitalize="sentences"
            // A list of words or a task wants a few lines from the start.
            rows={k === 'vocab' || k === 'help' ? 4 : 2}
          />
        </View>
        <MicButton voice={voice} label={t('common:voice.topic')} disabled={preparing} />
      </View>
      {examples.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <Text style={TYPE.label}>{t('learn:topic.examples')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {examples.map((example) => (
              <Btn
                key={example}
                size="sm"
                variant="soft"
                disabled={preparing}
                accessibilityHint={t('learn:topic.example_hint')}
                onPress={() => {
                  setText(example);
                  reset();
                }}
              >
                {example}
              </Btn>
            ))}
          </View>
        </View>
      ) : null}
      <StartStatus state={state} />
    </Sheet>
  );
}
