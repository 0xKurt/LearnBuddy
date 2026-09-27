// The whole conversation, newest at the bottom, with what each answer changed. Older pages
// and the polled live window are merged by message id (lib/threadMerge.ts), so nothing is
// lost while Buddy writes (audit M-75).

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Conversation } from '../components/buddy/Conversation.js';
import { Btn } from '../components/lb/Btn.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { toast } from '../components/lb/Toast.js';
import { ApiError } from '../lib/api/client.js';
import { getThread, undoAction } from '../lib/api/endpoints.js';
import { keys, queryClient, useHome } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import { mergeThread } from '../lib/threadMerge.js';

export default function History() {
  const { t } = useTranslation('buddy');
  const home = useHome();
  /** Every message seen here: older pages and each live window, once each. */
  const [seen, setSeen] = useState<MessageView[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const live = home.data?.thread;
  useEffect(() => {
    if (live) setSeen((s) => mergeThread(s, live));
  }, [live]);

  if (home.isPending || !home.data) return <LoadingState />;
  const messages = mergeThread(seen, home.data.thread);
  const more = hasMore ?? home.data.thread_has_more;

  async function loadMore() {
    const first = messages[0];
    if (!first) return;
    setLoading(true);
    try {
      const page = await getThread(first.id);
      setSeen((s) => mergeThread(page.messages, s));
      setHasMore(page.has_more);
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      setLoading(false);
    }
  }

  /**
   * "Rückgängig" works here too, for as long as the server offers it (7 days; it checks that
   * nothing changed since) — not only under the newest messages on the home (low
   * p2-undo-unreachable-beyond-last-six).
   */
  async function undo(actionId: string) {
    if (undoing) return;
    setUndoing(true);
    try {
      const next = await undoAction(actionId);
      queryClient.setQueryData(keys.home, next);
      setSeen((s) =>
        s.map((m) => ({
          ...m,
          actions: m.actions.map((a) =>
            a.id === actionId ? { ...a, status: 'undone' as const, undoable: false } : a,
          ),
        })),
      );
    } catch (err) {
      toast.show(messageFor(err), 'error');
      if (err instanceof ApiError && err.code === 'conflict') {
        setSeen((s) =>
          s.map((m) => ({
            ...m,
            actions: m.actions.map((a) => (a.id === actionId ? { ...a, undoable: false } : a)),
          })),
        );
        void home.refetch();
      }
    } finally {
      setUndoing(false);
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
          onUndo={(id) => void undo(id)}
          undoBusy={undoing}
          // No quick answers or "Nochmal senden" here: that is the chat's job; History
          // shows no buttons that cannot be pressed (history-dead-controls).
        />
      </ScrollView>
    </Screen>
  );
}
