// One photographed sheet (docs/architecture.md §Material): the questions made
// from it, with how each went the last time — never the solution. A question
// that doesn't fit can be deleted (explicit tap, then a confirm sheet), and
// the sheet can be renamed. Opened from its card in "Mein Stoff".

import type { MaterialItemView, MaterialItemsView } from '@learnbuddy/shared-types/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { MaterialItemCard } from '../../components/library/MaterialItemCard.js';
import { Btn } from '../../components/lb/Btn.js';
import { Card } from '../../components/lb/Card.js';
import { EmptyState } from '../../components/lb/EmptyState.js';
import { LbTextInput } from '../../components/lb/LbTextInput.js';
import { LoadingState } from '../../components/lb/LoadingState.js';
import { Screen } from '../../components/lb/Screen.js';
import { Sheet } from '../../components/lb/Sheet.js';
import { toast } from '../../components/lb/Toast.js';
import { MathText } from '../../components/math/MathText.js';
import { ApiError } from '../../lib/api/client.js';
import { deleteMaterialItem, renameMaterial } from '../../lib/api/endpoints.js';
import { keys, queryClient, useMaterialItems } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';

const TITLE_MAX = 120;

/** "Mein Stoff" and Buddy's home show question counts and titles too. */
function refreshAround(id: string): void {
  void queryClient.invalidateQueries({ queryKey: keys.library });
  void queryClient.invalidateQueries({ queryKey: keys.material(id), exact: true });
  void queryClient.invalidateQueries({ queryKey: keys.home });
}

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View accessibilityLiveRegion="polite">
      <Card tone="blush" padding={14} radius={18}>
        <Text style={TYPE.body}>{text}</Text>
      </Card>
    </View>
  );
}

export default function MaterialScreen() {
  const { t } = useTranslation(['library', 'common']);
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const query = useMaterialItems(id);
  const [pulling, setPulling] = useState(false);
  // One change at a time, even on a double tap.
  const acting = useRef(false);

  // Delete one question. The sheet keeps its question while it slides out.
  const [target, setTarget] = useState<{ item: MaterialItemView; number: number } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Rename the sheet.
  const [renameOpen, setRenameOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const data = query.data;
  const material = data?.material;
  const title = material?.title ?? t('library:untitled');

  async function pull() {
    setPulling(true);
    try {
      await query.refetch();
    } finally {
      setPulling(false);
    }
  }

  function askDelete(item: MaterialItemView, number: number) {
    if (acting.current) return;
    setTarget({ item, number });
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    const current = target;
    if (!current || acting.current) return;
    acting.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMaterialItem(id, current.item.id);
      setDeleteOpen(false);
      queryClient.setQueryData<MaterialItemsView>(keys.materialItems(id), (v) => {
        if (!v) return v;
        const items = v.items.filter((x) => x.id !== current.item.id);
        return { material: { ...v.material, item_count: items.length }, items };
      });
      refreshAround(id);
      toast.show(t('library:item_deleted'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_found') {
        // Already gone (or the whole sheet was deleted elsewhere): show what is true now.
        setDeleteOpen(false);
        void query.refetch();
        refreshAround(id);
        toast.show(messageFor(err));
      } else {
        // Shown in the sheet: a toast would sit behind it.
        setDeleteError(messageFor(err));
      }
    } finally {
      acting.current = false;
      setDeleting(false);
    }
  }

  function openRename() {
    if (acting.current || !material) return;
    setDraft(material.title ?? '');
    setRenameError(null);
    setRenameOpen(true);
  }

  const trimmed = draft.trim();
  const draftOk = trimmed.length > 0 && trimmed.length <= TITLE_MAX;

  async function saveRename() {
    if (acting.current) return;
    if (!draftOk) {
      setRenameError(t('library:rename_sheet.empty'));
      return;
    }
    acting.current = true;
    setRenaming(true);
    setRenameError(null);
    try {
      const updated = await renameMaterial(id, trimmed);
      setRenameOpen(false);
      queryClient.setQueryData<MaterialItemsView>(
        keys.materialItems(id),
        (v) => v && { ...v, material: updated },
      );
      refreshAround(id);
      toast.show(t('library:renamed'));
    } catch (err) {
      setRenameError(messageFor(err));
      if (err instanceof ApiError && err.code === 'not_found') refreshAround(id);
    } finally {
      acting.current = false;
      setRenaming(false);
    }
  }

  let content: ReactNode;
  if (!data || !material) {
    content = query.isError ? (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          title={messageFor(query.error)}
          action={
            <View style={{ gap: 10, alignItems: 'center' }}>
              <Btn pill center onPress={() => void query.refetch()}>
                {t('common:actions.retry')}
              </Btn>
              <Btn
                variant="ghost"
                pill
                center
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))}
              >
                {t('library:items.back')}
              </Btn>
            </View>
          }
        />
      </View>
    ) : (
      <LoadingState label={t('library:items.loading')} />
    );
  } else {
    // No questions: all deleted, or the photos are not (yet) read — say which.
    let empty: { title: string; body?: string } | null = null;
    if (data.items.length === 0) {
      if (material.status === 'ready')
        empty = { title: t('library:items.empty_title'), body: t('library:items.empty_body') };
      else if (material.status === 'failed')
        empty = { title: t(`library:failure.${material.failure_reason ?? 'model_error'}`) };
      else if (material.status === 'awaiting_upload')
        empty = { title: t('library:incomplete_hint') };
      else empty = { title: t('library:items.reading') };
    }
    content = (
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
      >
        <View style={{ gap: 6, marginBottom: 8, paddingHorizontal: 4 }}>
          <Text accessibilityRole="header" style={[TYPE.display, { fontSize: 28, lineHeight: 34 }]}>
            {title}
          </Text>
          <Text style={[TYPE.body, { color: LB.ink2 }]}>
            {[material.subject_name, t('library:questions', { count: data.items.length })]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {material.status === 'ready' ? (
            // A page she forgot: its questions join this sheet once read.
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <Btn
                size="sm"
                variant="soft"
                pill
                icon="camera"
                disabled={deleting || renaming}
                onPress={() =>
                  router.push({
                    pathname: '/capture',
                    params: { completes: material.id, purpose: material.purpose, add: '1' },
                  })
                }
              >
                {t('library:add_page')}
              </Btn>
            </View>
          ) : null}
        </View>
        {empty !== null ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState orb title={empty.title} body={empty.body} />
          </View>
        ) : (
          data.items.map((item, index) => (
            <MaterialItemCard
              key={item.id}
              item={item}
              number={index + 1}
              disabled={deleting || renaming}
              onDelete={() => askDelete(item, index + 1)}
            />
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <Screen
      back
      right={
        material ? (
          <Btn
            size="sm"
            variant="outline"
            pill
            disabled={deleting || renaming}
            onPress={openRename}
            accessibilityLabel={t('library:rename_label', { title })}
          >
            {t('library:rename')}
          </Btn>
        ) : undefined
      }
    >
      {content}

      <Sheet
        visible={deleteOpen}
        title={t('library:item_delete_sheet.title')}
        closeLabel={t('common:actions.cancel')}
        onClose={() => setDeleteOpen(false)}
      >
        {target ? (
          <Card tone="lavender" padding={16} radius={18}>
            <MathText text={target.item.prompt} style={TYPE.body} />
          </Card>
        ) : null}
        <Text style={TYPE.body}>{t('library:item_delete_sheet.body')}</Text>
        <ErrorNote text={deleteError} />
        <Btn variant="danger" pill full disabled={deleting} onPress={() => void confirmDelete()}>
          {t('library:item_delete_sheet.confirm')}
        </Btn>
      </Sheet>

      <Sheet
        visible={renameOpen}
        title={t('library:rename_sheet.title')}
        closeLabel={t('common:actions.cancel')}
        onClose={() => setRenameOpen(false)}
        footer={
          <Btn pill full disabled={renaming || !draftOk} onPress={() => void saveRename()}>
            {t('common:actions.save')}
          </Btn>
        }
      >
        <LbTextInput
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            setRenameError(null);
          }}
          placeholder={t('library:rename_sheet.placeholder')}
          accessibilityLabel={t('library:rename_sheet.label')}
          maxLength={TITLE_MAX}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void saveRename()}
          error={renameError !== null}
        />
        <ErrorNote text={renameError} />
      </Sheet>
    </Screen>
  );
}
