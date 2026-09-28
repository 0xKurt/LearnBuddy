// "Was Buddy über dich weiß" (docs/architecture.md §Core loop "Keep context",
// §API GET/PATCH /buddy/memory; docs/privacy.md). Everything Buddy keeps,
// with its source — the learner's own words — split into what stays and what
// ends by itself. Every entry can be changed or removed; the API checks the
// version (stale or gone → message and reload). Nothing is shown as changed
// before the API confirmed it.

import type { MemoryView, UpdateMemoryRequest } from '@learnbuddy/shared-types/contracts';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { Rise, useListEntrance } from '../components/lb/Motion.js';
import { MemorySkeleton } from '../components/lb/Skeletons.js';
import { Screen } from '../components/lb/Screen.js';
import { Sheet } from '../components/lb/Sheet.js';
import { toast } from '../components/lb/Toast.js';
import { MemoryItem } from '../components/memory/MemoryItem.js';
import { ApiError } from '../lib/api/client.js';
import { updateMemory } from '../lib/api/endpoints.js';
import { keys, queryClient, useMemory } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

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

/** A field that got the focus is scrolled to near the top once the keyboard is up. */
const AFTER_KEYBOARD_MS = 280;

export default function MemoryScreen() {
  const { t } = useTranslation(['memory', 'common']);
  const memory = useMemory();
  const insets = useSafeAreaInsets();
  const list = useRef<FlashListRef<Row>>(null);
  const entering = useListEntrance(memory.data !== undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const inFlight = useRef(false);
  // Kept while the sheet slides out, so its text does not vanish mid-animation.
  const [removeTarget, setRemoveTarget] = useState<MemoryView | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await memory.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  async function change(m: MemoryView, body: UpdateMemoryRequest, done: string) {
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
      toast.show(done);
    } catch (err) {
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

  function confirmRemove() {
    const m = removeTarget;
    setRemoveOpen(false);
    if (m) void change(m, { retract: true, version: m.version }, t('memory:removed'));
  }

  const title = t('memory:title');

  if (!memory.data) {
    return (
      <Screen back title={title}>
        {memory.error ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              title={messageFor(memory.error)}
              action={
                <Btn pill center onPress={() => void refresh()}>
                  {t('common:actions.retry')}
                </Btn>
              }
            />
          </View>
        ) : (
          <MemorySkeleton label={t('common:loading')} />
        )}
      </Screen>
    );
  }

  const rows = rowsOf(memory.data.memories);

  /** Keeps the field she is typing in above the keyboard. */
  const reveal = (index: number) => {
    setTimeout(() => {
      void list.current?.scrollToIndex({ index, animated: true, viewOffset: -12 });
    }, AFTER_KEYBOARD_MS);
  };

  const heading = (text: string) => (
    <Text accessibilityRole="header" style={[TYPE.title, { paddingHorizontal: 4 }]}>
      {text}
    </Text>
  );

  const renderRow = (row: Row, index: number) => {
    switch (row.type) {
      case 'intro':
        return (
          <Text style={[TYPE.body, { color: LB.ink2, paddingHorizontal: 4, marginBottom: 28 }]}>
            {t('memory:intro')}
          </Text>
        );
      case 'empty':
        // The one shared empty state, not a bespoke card (same action → same component).
        return <EmptyState orb title={t('memory:empty_title')} body={t('memory:empty_body')} />;
      case 'lasting':
        return <View style={{ marginBottom: 12 }}>{heading(t('memory:lasting'))}</View>;
      case 'temporary':
        return (
          <View style={{ marginTop: 16, marginBottom: 12 }}>{heading(t('memory:temporary'))}</View>
        );
      case 'temporary_hint':
        return (
          <Text style={[TYPE.body, { color: LB.ink2, paddingHorizontal: 4, marginBottom: 12 }]}>
            {t('memory:temporary_hint')}
          </Text>
        );
      case 'memory': {
        const m = row.memory;
        return (
          <Rise animate={entering(index)} index={index} style={{ marginBottom: 12 }}>
            <MemoryItem
              memory={m}
              temporary={row.temporary}
              editing={editingId === m.id}
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
              onRemove={() => {
                setRemoveTarget(m);
                setRemoveOpen(true);
              }}
              onInputFocus={() => reveal(index)}
            />
          </Rise>
        );
      }
    }
  };

  return (
    <Screen back title={title}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Only what is on screen is drawn (gaps.md #22). */}
        <FlashList
          ref={list}
          testID="scroll-list"
          data={rows}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.type}
          extraData={{ editingId, draft, savingId }}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          renderItem={({ item, index }) => renderRow(item, index)}
        />
      </KeyboardAvoidingView>

      <Sheet
        visible={removeOpen}
        title={t('memory:confirm_title')}
        closeLabel={t('common:actions.cancel')}
        onClose={() => setRemoveOpen(false)}
      >
        {removeTarget ? (
          <Text style={TYPE.body}>
            {t('memory:confirm_body', { statement: removeTarget.statement })}
          </Text>
        ) : null}
        <Btn variant="danger" pill full onPress={confirmRemove}>
          {t('memory:confirm_cta')}
        </Btn>
      </Sheet>
    </Screen>
  );
}
