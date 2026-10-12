import { useSheetHandoff } from '../navigation/useSheetHandoff.js';
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
import { Composer } from '../lb/Composer.js';
import { START } from '../../lib/theme/start.js';
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
  onBack?: () => void;
};

export function TopicSheet({ kind, onClose, onBack }: Props) {
  const { t } = useTranslation(['learn', 'common', 'buddy']);
  const { state, start, reset } = useStartTopic();
  const [text, setText] = useState('');
  // The kind shown while the sheet slides away (kind is already null then).
  const [shownKind, setShownKind] = useState<TopicKind>('practice');
  const openKind = useRef<TopicKind | null>(kind);
  const lastKind = useRef(kind);
  const lifetime = useRef(0);
  const handoff = useSheetHandoff({ visible: kind !== null, onClose });
  if (lastKind.current !== kind) {
    lifetime.current += 1;
    lastKind.current = kind;
  }
  openKind.current = kind;
  useEffect(
    () => () => {
      lifetime.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (kind === null) return;
    setShownKind(kind);
    setText('');
    reset();
    // A fresh sheet per opening (reset only clears the shown state).
  }, [kind]);

  const k = kind ?? shownKind;
  const title =
    k === 'practice' ? t('buddy:start_choice.topic_title') : t(`learn:topic.${k}.title`);
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
    const epoch = lifetime.current;
    const session = await start(startedFor, value);
    // Closed meanwhile: the home shows the session to resume instead.
    if (!session || openKind.current !== startedFor || epoch !== lifetime.current) return;
    handoff.begin(() => router.push(`/practice/${session.id}`));
  }

  return (
    <Sheet
      visible={kind !== null}
      title={title}
      closeLabel={t('common:actions.close')}
      onClose={() => {
        if (onBack) handoff.begin(onBack);
        else {
          handoff.cancel();
          onClose();
        }
      }}
      onClosed={handoff.closed}
      footer={
        <Composer
          value={text}
          onChangeText={(next) => {
            setText(next);
            if (state.status === 'not_usable') reset();
          }}
          placeholder={t(`learn:topic.${k}.placeholder`)}
          accessibilityLabel={title}
          editable={!preparing}
          maxLength={MAX_TEXT}
          autoFocus={KIND_EXAMPLES[k] === 0}
          autoCapitalize="sentences"
          rows={k === 'vocab' || k === 'help' ? START.rows.vocabulary : START.rows.normal}
          microphone={
            <MicButton
              tone="quiet"
              voice={voice}
              label={t('common:voice.topic')}
              disabled={preparing}
            />
          }
          primary={
            <Btn
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
        />
      }
    >
      <Text style={TYPE.topicLead}>
        {k === 'practice' ? t('buddy:start_choice.topic_lead') : t(`learn:topic.${k}.hint`)}
      </Text>
      <MicStatus voice={voice} />
      {examples.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <Text style={TYPE.label}>{t('learn:topic.examples')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {examples.map((example) => (
              <Btn
                key={example}
                size="sm"
                variant="outline"
                pill
                label={<Text style={TYPE.topicChip}>{example}</Text>}
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
