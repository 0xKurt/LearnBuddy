// The whole conversation, newest at the bottom, with what each answer changed.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Conversation } from '../components/buddy/Conversation.js';
import { Btn } from '../components/lb/Btn.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { toast } from '../components/lb/Toast.js';
import { getThread } from '../lib/api/endpoints.js';
import { useHome } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';

export default function History() {
  const { t } = useTranslation('buddy');
  const home = useHome();
  const [older, setOlder] = useState<MessageView[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  if (home.isPending || !home.data) return <LoadingState />;
  const messages = [...older, ...home.data.thread];
  const more = hasMore ?? home.data.thread_has_more;

  async function loadMore() {
    const first = messages[0];
    if (!first) return;
    setLoading(true);
    try {
      const page = await getThread(first.id);
      setOlder((o) => [...page.messages, ...o]);
      setHasMore(page.has_more);
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen back title={t('thread.title')}>
      <ScrollView testID="scroll-thread" contentContainerStyle={{ padding: 16, gap: 16 }}>
        {more ? (
          <View style={{ alignItems: 'center' }}>
            <Btn
              variant="outline"
              size="sm"
              pill
              center
              onPress={() => void loadMore()}
              disabled={loading}
            >
              {t('thread.load_more')}
            </Btn>
          </View>
        ) : null}
        <Conversation
          messages={messages}
          pending={null}
          busy
          showActions
          onOption={() => undefined}
          onResend={() => undefined}
        />
      </ScrollView>
    </Screen>
  );
}
