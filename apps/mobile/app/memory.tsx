// "Was Buddy über dich weiß" (docs/architecture.md §Core loop "Keep context",
// §API GET/PATCH /buddy/memory; docs/privacy.md). Everything Buddy keeps,
// with its source — the learner's own words — split into what stays and what
// ends by itself. Every entry can be changed or removed; the API checks the
// version (stale or gone → message and reload). Nothing is shown as changed
// before the API confirmed it.

import type { MemoryView, UpdateMemoryRequest } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { Sheet } from '../components/lb/Sheet.js';
import { toast } from '../components/lb/Toast.js';
import { MemoryItem } from '../components/memory/MemoryItem.js';
import { useRevealInput } from '../components/settings/useRevealInput.js';
import { ApiError } from '../lib/api/client.js';
import { updateMemory } from '../lib/api/endpoints.js';
import { keys, queryClient, useMemory } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

/** Temporary situations always carry an end; they expire by themselves. */
const isTemporary = (m: MemoryView) => m.kind === 'constraint' || m.valid_until !== null;

export default function MemoryScreen() {
  const { t } = useTranslation(['memory', 'common']);
  const memory = useMemory();
  const { scroll, content, reveal } = useRevealInput();
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
                <Btn center onPress={() => void refresh()}>
                  {t('common:actions.retry')}
                </Btn>
              }
            />
          </View>
        ) : (
          <LoadingState label={t('common:loading')} />
        )}
      </Screen>
    );
  }

  const items = memory.data.memories;
  const lasting = items.filter((m) => !isTemporary(m));
  const temporary = items.filter(isTemporary);

  const renderItem = (m: MemoryView, temp: boolean) => (
    <MemoryItem
      key={m.id}
      memory={m}
      temporary={temp}
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
      onInputFocus={reveal}
    />
  );

  return (
    <Screen back title={title}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
        >
          <View ref={content} style={{ gap: 28 }}>
            <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('memory:intro')}</Text>

            {items.length === 0 ? (
              <Card tone="lavender" padding={20} radius={22}>
                <View style={{ gap: 8 }}>
                  <Text accessibilityRole="header" style={TYPE.title}>
                    {t('memory:empty_title')}
                  </Text>
                  <Text style={TYPE.body}>{t('memory:empty_body')}</Text>
                </View>
              </Card>
            ) : null}

            {lasting.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Text accessibilityRole="header" style={TYPE.title}>
                  {t('memory:lasting')}
                </Text>
                {lasting.map((m) => renderItem(m, false))}
              </View>
            ) : null}

            {temporary.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Text accessibilityRole="header" style={TYPE.title}>
                  {t('memory:temporary')}
                </Text>
                <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('memory:temporary_hint')}</Text>
                {temporary.map((m) => renderItem(m, true))}
              </View>
            ) : null}
          </View>
        </ScrollView>
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
        <Btn variant="danger" full onPress={confirmRemove}>
          {t('memory:confirm_cta')}
        </Btn>
      </Sheet>
    </Screen>
  );
}
