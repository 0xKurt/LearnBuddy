// After practice: "Die wackligen nochmal üben" – one tap prepares new
// questions on the topics that didn't sit yet (POST /practice/topic, kind
// practice) and opens them in place of the finished session.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { StartStatus } from '../learn/StartStatus.js';
import { useStartTopic } from '../learn/useStartTopic.js';
import { Btn } from '../lb/Btn.js';

export function AgainButton({ title, topics }: { title: string; topics: readonly string[] }) {
  const { t } = useTranslation(['practice', 'common']);
  const { state, start } = useStartTopic();
  const preparing = state.status === 'preparing';
  const what = t('practice:again.topic', { topics: topics.join(', ') });

  async function go(): Promise<void> {
    // The finished session's title tells the model which subject the topics belong to.
    const session = await start('practice', title.trim() ? `${what} (${title.trim()})` : what);
    if (session) router.replace(`/practice/${session.id}`);
  }

  return (
    <View style={{ gap: 8 }}>
      <StartStatus state={state} />
      {state.status === 'not_usable' ? null : (
        <Btn
          size="lg"
          variant="soft"
          icon="practice"
          full
          disabled={preparing}
          onPress={() => void go()}
        >
          {state.status === 'failed' ? t('common:actions.retry') : t('practice:again.shaky')}
        </Btn>
      )}
    </View>
  );
}
