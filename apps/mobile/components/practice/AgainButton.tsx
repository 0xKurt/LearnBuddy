// After practice, one tap for more (POST /practice/topic, kind practice),
// opened in place of the finished session:
// - shaky: "Die wackligen nochmal üben" – new questions on what didn't sit yet;
// - harder: everything sat – "Mehr davon, etwas schwerer" (the old app's
//   "10 ähnliche Aufgaben", as questions Buddy writes).

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { StartStatus } from '../learn/StartStatus.js';
import { useStartTopic } from '../learn/useStartTopic.js';
import { Btn } from '../lb/Btn.js';

export function AgainButton({
  title,
  topics,
  kind = 'shaky',
}: {
  title: string;
  topics: readonly string[];
  kind?: 'shaky' | 'harder';
}) {
  const { t } = useTranslation(['practice', 'common']);
  const { state, start } = useStartTopic();
  const preparing = state.status === 'preparing';
  const what = t(kind === 'harder' ? 'practice:again.harder_topic' : 'practice:again.topic', {
    topics: topics.join(', '),
  });

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
          pill
          icon="practice"
          full
          disabled={preparing}
          onPress={() => void go()}
        >
          {state.status === 'failed'
            ? t('common:actions.retry')
            : kind === 'harder'
              ? t('practice:again.harder')
              : t('practice:again.shaky')}
        </Btn>
      )}
    </View>
  );
}
