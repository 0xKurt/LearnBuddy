// "Was Buddy über dich weiß" (docs/architecture.md §Core loop "Keep context",
// §API GET/PATCH /buddy/memory; docs/privacy.md). Everything Buddy keeps,
// with its source — the learner's own words — split into what stays and what
// ends by itself. Every entry can be changed or removed; the API checks the
// version (stale or gone → message and reload). Nothing is shown as changed
// before the API confirmed it.

import type { MemoryView, UpdateMemoryRequest } from '@learnbuddy/shared-types/contracts';
import { FlashList } from '@shopify/flash-list';
import { useRef, useState } from 'react';
import { Keyboard, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { LoadFailed } from '../components/lb/LoadFailed.js';
import { Rise, useListEntrance } from '../components/lb/Motion.js';
import { MemorySkeleton } from '../components/lb/Skeletons.js';
import { Screen } from '../components/lb/Screen.js';
import { toast } from '../components/lb/Toast.js';
import type { ToastAction } from '../lib/toast.js';
import { MemoryItem } from '../components/memory/MemoryItem.js';
import { ApiError } from '../lib/api/client.js';
import { updateMemory } from '../lib/api/endpoints.js';
import { keys, queryClient, useMemory } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { LIBRARY } from '../lib/theme/library.js';
import { GUTTER_APP, SPACE } from '../lib/theme/space.js';
import { useAnnounce } from '../lib/announce.js';
import { MEMORY } from '../lib/theme/memory.js';
import { Sheet, SHEET_TEXT } from '../components/lb/Sheet.js';
import { SafeguardingReply } from '../components/buddy/SafeguardingReply.js';
import { safeguardingReply } from '../lib/safeguarding.js';

/** Temporary situations always carry an end; they expire by themselves. */
const isTemporary = (m: MemoryView) => m.kind === 'constraint' || m.valid_until !== null;

/** One row of the (virtualised) list. */
type Row =
  | { type: 'intro' | 'empty' | 'lasting' | 'temporary' | 'temporary_hint'; key: string }
  | { type: 'memory'; key: string; memory: MemoryView; temporary: boolean };

function rowsOf(memories: MemoryView[]): Row[] {
  const lasting = memories.filter((m) => !isTemporary(m));
  const temporary = memories.filter(isTemporary);
  const entries = (list: MemoryView[], temp: boolean): Row[] =>
    list.map((m) => ({ type: 'memory', key: m.id, memory: m, temporary: temp }));
  return [
    { type: 'intro', key: 'intro' },
    ...(memories.length === 0 ? [{ type: 'empty', key: 'empty' } as const] : []),
    ...(lasting.length > 0
      ? [{ type: 'lasting', key: 'lasting' } as const, ...entries(lasting, false)]
      : []),
    ...(temporary.length > 0
      ? [
          { type: 'temporary', key: 'temporary' } as const,
          { type: 'temporary_hint', key: 'temporary_hint' } as const,
          ...entries(temporary, true),
        ]
      : []),
  ];
}

export default function MemoryScreen() {
  const { palette } = useTheme();
  const { t } = useTranslation(['memory', 'common']);
  const memory = useMemory();
  const insets = useSafeAreaInsets();
  const entering = useListEntrance(memory.data !== undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [help, setHelp] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    try {
      await memory.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  async function change(
    m: MemoryView,
    body: UpdateMemoryRequest,
    done: string,
    undo?: ToastAction,
  ) {
    // A ref, not state: a double tap must not send a second PATCH (it would hit "not found").
    if (inFlight.current) return;
    inFlight.current = true;
    setSavingId(m.id);
    try {
      await updateMemory(m.id, body);
      // An edit replaces the entry (new id, "von dir geändert"): show the stored state.
      void queryClient.invalidateQueries({ queryKey: keys.home });
      await queryClient.invalidateQueries({ queryKey: keys.memory });
      setEditingId(null);
      toast.show(done, 'info', undo ? { action: undo } : {});
    } catch (err) {
      const reply = safeguardingReply(err);
      if (reply !== null) {
        Keyboard.dismiss();
        setHelp(reply);
        return;
      }
      toast.show(messageFor(err), 'error');
      if (err instanceof ApiError && (err.code === 'stale' || err.code === 'not_found')) {
        setEditingId(null);
        await memory.refetch();
      }
    } finally {
      inFlight.current = false;
      setSavingId(null);
    }
  }

  /**
   * Removed at once from its sheet, with the way back in the toast (ui_kits/app/More.jsx:42,
   * docs/UX-PRINCIPLES.md "undo over confirmation"). The offer is real, not decoration: the
   * server takes a fresh removal back (UNRETRACT_WINDOW_MINUTES, issue #133 position 12). A
   * removal that has stood longer than that answers 404, and the message below says so plainly.
   */
  function remove(m: MemoryView) {
    void change(m, { retract: true, version: m.version }, t('memory:removed'), {
      label: t('common:actions.undo'),
      run: () => void undoRemove(m.id, m.version + 1),
    });
  }

  async function undoRemove(id: string, version: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await updateMemory(id, { unretract: true, version });
      void queryClient.invalidateQueries({ queryKey: keys.home });
      await queryClient.invalidateQueries({ queryKey: keys.memory });
      toast.show(t('memory:removed_undone'));
    } catch (err) {
      toast.show(messageFor(err), 'error');
      await memory.refetch();
    } finally {
      inFlight.current = false;
    }
  }

  const title = t('memory:title');
  // Nothing kept is one quiet line in the page, not a state of its own (ui_kits/app/More.jsx:37);
  // a screen reader still hears that the list is empty.
  useAnnounce(memory.data?.memories.length === 0 ? t('memory:empty_title') : null);

  if (!memory.data) {
    return (
      <Screen back title={title} state="think">
        {memory.error ? (
          <LoadFailed error={memory.error} onRetry={() => void refresh()} />
        ) : (
          <MemorySkeleton label={t('common:loading')} />
        )}
      </Screen>
    );
  }

  const rows = rowsOf(memory.data.memories);

  const heading = (text: string) => (
    <Text accessibilityRole="header" style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>
      {text}
    </Text>
  );
  /** The page's quiet running text (More.jsx `Lead`: 16/23, second ink, 4 in from the edge). */
  const lead = (text: string, below: number) => (
    <Text
      style={[
        TYPE.paragraph,
        { color: palette.ink2, paddingHorizontal: SPACE.xs, marginBottom: below },
      ]}
    >
      {text}
    </Text>
  );

  const renderRow = (row: Row, index: number) => {
    switch (row.type) {
      // The page's rhythm (More.jsx `Body`): 24 between its parts, 8 from a label to its card.
      case 'intro':
        return lead(t('memory:intro'), SPACE.xl);
      case 'empty':
        return lead(t('memory:empty_body'), 0);
      case 'lasting':
        return <View style={{ marginBottom: SPACE.sm }}>{heading(t('memory:lasting'))}</View>;
      case 'temporary':
        return (
          <View style={{ marginTop: SPACE.xl, marginBottom: SPACE.xs }}>
            {heading(t('memory:temporary'))}
          </View>
        );
      case 'temporary_hint':
        return lead(t('memory:temporary_hint'), SPACE.sm);
      case 'memory': {
        const m = row.memory;
        return (
          <Rise animate={entering(index)} index={index}>
            <MemoryItem
              memory={m}
              groupStart={rows[index - 1]?.type !== 'memory'}
              groupEnd={rows[index + 1]?.type !== 'memory'}
              temporary={row.temporary}
              editing={editingId === m.id && help === null}
              draft={draft}
              saving={savingId === m.id}
              locked={savingId !== null}
              onDraft={setDraft}
              onEdit={() => {
                setEditingId(m.id);
                setDraft(m.statement);
              }}
              onCancel={() => setEditingId(null)}
              onSave={() =>
                void change(m, { statement: draft.trim(), version: m.version }, t('memory:saved'))
              }
              onRemove={() => remove(m)}
            />
          </Rise>
        );
      }
    }
  };

  return (
    <Screen back title={title}>
      <View style={{ flex: 1 }}>
        {/* Only what is on screen is drawn (gaps.md #22). */}
        <FlashList
          testID="scroll-list"
          data={rows}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.type}
          extraData={{ editingId, draft, savingId, help }}
          contentContainerStyle={{
            paddingHorizontal: GUTTER_APP,
            paddingTop: LIBRARY.pageTop,
            paddingBottom: insets.bottom + MEMORY.bottomRoom,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          renderItem={({ item, index }) => renderRow(item, index)}
        />
      </View>
      <Sheet
        visible={help !== null}
        closeLabel={t('common:actions.close')}
        onClose={() => setHelp(null)}
      >
        <View style={SHEET_TEXT}>{help !== null ? <SafeguardingReply text={help} /> : null}</View>
      </Sheet>
    </Screen>
  );
}
