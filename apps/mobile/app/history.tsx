// The whole conversation, newest at the bottom, with what each answer changed. Older pages
// and the polled live window are merged by message id (lib/threadMerge.ts), so nothing is
// lost while Buddy writes (audit M-75). A virtualised list of days (lib/dayGroups.ts): only
// the days on screen are drawn, however long the history gets (gaps.md #22).

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { FlashList } from '@shopify/flash-list';
import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Conversation, DayLine } from '../components/buddy/Conversation.js';
import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { ChatSkeleton } from '../components/lb/Skeletons.js';
import { Screen } from '../components/lb/Screen.js';
import { toast } from '../components/lb/Toast.js';
import { ApiError } from '../lib/api/client.js';
import { getThread, undoAction } from '../lib/api/endpoints.js';
import { setHome, useHome } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import { dayGroups } from '../lib/dayGroups.js';
import { SPACE } from '../lib/theme/space.js';
import { mergeThread } from '../lib/threadMerge.js';

export default function History() {
  const { t } = useTranslation('buddy');
  const insets = useSafeAreaInsets();
  const home = useHome();
  /** Every message seen here: older pages and each live window, once each. */
  const [seen, setSeen] = useState<MessageView[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const live = home.data?.thread;
  useEffect(() => {
    if (live) setSeen((s) => mergeThread(s, live));
  }, [live]);

  // A failed background refresh keeps what is on screen; the error state is only
  // for a thread that never loaded (same shape as app/memory.tsx).
  if (!home.data)
    return (
      <Screen back title={t('thread.title')}>
        {home.error ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              title={messageFor(home.error)}
              action={
                <Btn pill center onPress={() => void home.refetch()}>
                  {t('common:actions.retry')}
                </Btn>
              }
            />
          </View>
        ) : (
          <ChatSkeleton label={t('common:loading')} rows={6} />
        )}
      </Screen>
    );
  const messages = mergeThread(seen, home.data.thread);
  const more = hasMore ?? home.data.thread_has_more;

  async function refresh() {
    setRefreshing(true);
    try {
      await home.refetch();
    } finally {
      setRefreshing(false);
    }
  }

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
      // The same rule as every fresh home: an undone settings change reaches the settings (#398).
      setHome(next);
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
      <FlashList
        testID="scroll-thread"
        data={dayGroups(messages)}
        keyExtractor={(g) => g.day}
        extraData={{ undoing, loading, more }}
        // A chat: it opens at the newest message; older pages load above without a jump.
        maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
        // Edge-to-edge: the newest message must clear the Android gesture/3-button bar.
        contentContainerStyle={{ padding: SPACE.lg, paddingBottom: insets.bottom + SPACE.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListEmptyComponent={
          <EmptyState orb title={t('thread.empty_title')} body={t('thread.empty_body')} />
        }
        ListHeaderComponent={
          more ? (
            <View style={{ alignItems: 'center', marginBottom: SPACE.lg }}>
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
          ) : null
        }
        renderItem={({ item: g }) => (
          // sm between days like between turns: the same scale as the chat (issue #51).
          <View style={{ gap: SPACE.sm, marginBottom: SPACE.sm }}>
            {g.todayLine ? <DayLine day={g.day} /> : null}
            <Conversation
              messages={g.messages}
              pending={null}
              busy
              showActions
              onUndo={(id) => void undo(id)}
              undoBusy={undoing}
              // No quick answers or "Nochmal senden" here: that is the chat's job; History
              // shows no buttons that cannot be pressed (history-dead-controls).
            />
          </View>
        )}
      />
    </Screen>
  );
}
