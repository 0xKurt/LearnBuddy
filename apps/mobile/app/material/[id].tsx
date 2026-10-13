// One photographed sheet (docs/architecture.md §Material; ui_kits/app/Extra.jsx `SheetQuestions`):
// its name and pages in the head, the sheet pinned under it with the way into practising it, and
// below that the questions made from it, with how each went the last time — never the solution.
// A question that doesn't fit can be deleted (its ⋯, then a confirmation in the same sheet); the
// sheet is renamed and gets another page from the head's ⋯.
//
// The design's conversation about the sheet and its Composer are not here: the API has no
// conversation that belongs to one sheet (SendMessageRequest carries no material), so there is
// nothing to wire them to.

import type { MaterialItemView, MaterialItemsView } from '@learnbuddy/shared-types/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaterialItemCard } from '../../components/library/MaterialItemCard.js';
import { materialPrimaryOf } from '../../components/library/materialPresentation.js';
import { SheetPages } from '../../components/library/SheetPages.js';
import { useStartMaterial } from '../../components/library/useStartMaterial.js';
import { Btn } from '../../components/lb/Btn.js';
import { Card } from '../../components/lb/Card.js';
import { EmptyState } from '../../components/lb/EmptyState.js';
import { ErrorNote } from '../../components/lb/ErrorNote.js';
import { LbTextInput } from '../../components/lb/LbTextInput.js';
import { ListGroup, Row } from '../../components/lb/ListGroup.js';
import { isGone, LoadFailed } from '../../components/lb/LoadFailed.js';
import { QuestionsSkeleton } from '../../components/lb/Skeletons.js';
import { Screen } from '../../components/lb/Screen.js';
import { Sheet, SHEET_TEXT } from '../../components/lb/Sheet.js';
import { toast } from '../../components/lb/Toast.js';
import { MathText } from '../../components/math/MathText.js';
import { ApiError } from '../../lib/api/client.js';
import { deleteMaterialItem, renameMaterial } from '../../lib/api/endpoints.js';
import { useMaterialItems } from '../../lib/api/libraryQueries.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { MATERIAL_DETAIL } from '../../lib/theme/materialDetail.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { bottomRoom, GUTTER_APP, RHYTHM, SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { attachInChat } from '../../lib/capture/attachRequest.js';

const TITLE_MAX = 120;

/** "Mein Stoff" and Buddy's home show question counts and titles too. */
function refreshAround(id: string): void {
  void queryClient.invalidateQueries({ queryKey: keys.library });
  void queryClient.invalidateQueries({ queryKey: keys.material(id), exact: true });
  void queryClient.invalidateQueries({ queryKey: keys.home });
}

export default function MaterialScreen() {
  const { palette } = useTheme();
  const { t } = useTranslation(['library', 'common']);
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const query = useMaterialItems(id);
  const insets = useSafeAreaInsets();
  const [pulling, setPulling] = useState(false);
  // One change at a time, even on a double tap.
  const acting = useRef(false);
  const { busyId, start } = useStartMaterial(acting);

  // What can be done with one question: its sheet names it, and deleting asks once more in the
  // same sheet. It keeps its question while it slides out.
  const [target, setTarget] = useState<{ item: MaterialItemView; number: number } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
  const changing = deleting || renaming || busyId !== null;

  async function pull() {
    setPulling(true);
    try {
      await query.refetch();
    } finally {
      setPulling(false);
    }
  }

  function openQuestion(item: MaterialItemView, number: number) {
    if (acting.current) return;
    setTarget({ item, number });
    setConfirming(false);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  // A page she forgot: its questions join this sheet once read. The chat's + menu, for this
  // sheet (issue #519).
  const addPage = () => {
    if (material)
      attachInChat({
        open: 'menu',
        link: { completes: material.id, purpose: material.purpose, add: true },
      });
  };

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

  // Back to where she came from; opened by a link, to her material.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  // The sheet is not there any more (404): the way back is what is left, as the main action.
  const sheetGone = !data && query.isError && isGone(query.error);

  let content: ReactNode;
  if (!data || !material) {
    content = query.isError ? (
      <LoadFailed error={query.error} busy={query.isFetching} onRetry={() => void query.refetch()}>
        <Btn variant={sheetGone ? 'primary' : 'ghost'} pill center onPress={back}>
          {t('library:items.back')}
        </Btn>
      </LoadFailed>
    ) : (
      <QuestionsSkeleton label={t('library:items.loading')} />
    );
  } else {
    // Tasks on the sheet that got no questions, because their exercise form is not one
    // Buddy can practise (issue #198). Named here too: this is the screen that lists what
    // the sheet became, so a task missing from it without a word would look done.
    const missed =
      material.not_practicable.length > 0
        ? t('library:not_practicable', {
            count: material.not_practicable.length,
            tasks: material.not_practicable.map((n) => n.task).join(' · '),
          })
        : null;
    // No questions: all deleted, or the photos are not (yet) read — say which.
    const gone = data.items.length === 0 && material.status === 'ready';
    // `toList`: nothing can be done about it on this page — reading it again, deleting it and a
    // new photo are the sheet's actions in her material, so the page leads there (#599).
    let waiting: { title: string; body?: string; toList?: true } | null = null;
    if (data.items.length === 0 && !gone) {
      if (material.status === 'failed')
        waiting = {
          title: t(`library:failure.${material.failure_reason ?? 'model_error'}`),
          // Nothing came of this sheet BECAUSE of these tasks: they are the explanation.
          ...(missed ? { body: missed } : {}),
          toList: true,
        };
      else if (material.status === 'awaiting_upload')
        waiting = {
          title: t('library:incomplete_page.title'),
          body: t('library:incomplete_page.body'),
          toList: true,
        };
      else waiting = { title: t('library:items.reading') };
    }
    // Where these questions came from (issue #259): a corrected test's are NEW tasks for what
    // was marked, a notebook entry's a few for the next morning — said once, quietly.
    const notes = [
      material.source !== 'sheet' ? t(`library:source.${material.source}`) : null,
      missed !== null && waiting?.body !== missed ? missed : null,
    ].filter((note): note is string => note !== null);
    content = (
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={{
          paddingTop: GUTTER_APP,
          // Edge-to-edge: the last card must clear the Android navigation bar.
          paddingBottom: bottomRoom(insets.bottom, MATERIAL_DETAIL.bottomClearance),
          gap: RHYTHM.stack,
          flexGrow: 1,
        }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void pull()} />}
      >
        {notes.length > 0 ? (
          <View style={{ gap: SPACE.sm, paddingHorizontal: GUTTER_APP + SPACE.xs }}>
            {notes.map((note) => (
              <Text key={note} style={[TYPE.meta, { color: palette.ink2 }]}>
                {note}
              </Text>
            ))}
          </View>
        ) : null}
        {gone ? (
          // The empty page brings its own gutter (ui_kits/app/Gaps.jsx:52) and the one thing
          // that fills the sheet again.
          <EmptyState
            page
            title={t('library:items.empty_title')}
            body={t('library:items.empty_body')}
            action={
              <Btn icon="camera" disabled={changing} onPress={addPage}>
                {t('library:add_page')}
              </Btn>
            }
          />
        ) : waiting !== null ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER_APP }}>
            <EmptyState
              title={waiting.title}
              body={waiting.body}
              action={
                waiting.toList ? (
                  <Btn pill center onPress={back}>
                    {t('library:subject.back')}
                  </Btn>
                ) : undefined
              }
            />
          </View>
        ) : (
          <View style={{ gap: RHYTHM.stack, paddingHorizontal: GUTTER_APP }}>
            {data.items.map((item, index) => (
              <MaterialItemCard
                key={item.id}
                item={item}
                number={index + 1}
                disabled={changing}
                onMenu={() => openQuestion(item, index + 1)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  const primary = material ? materialPrimaryOf(material) : null;
  const subtitle = material
    ? [
        material.subject_name,
        material.photo_count > 0 ? t('library:pages', { count: material.photo_count }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <Screen
      // The sheet is the page: its name and "Mathe · 2 Seiten" stand in the head (Extra.jsx:111).
      title={material ? title : t('library:title')}
      subtitle={subtitle || undefined}
      leading={{
        icon: 'back',
        label: t('library:items.back'),
        onPress: back,
      }}
      // Design ui_kits/app/Extra.jsx `SheetQuestions`: with a sheet open Buddy waits for what she
      // wants to do with it; until it is there he thinks (`SystemState` "load-list") — and rests
      // when there is no sheet to wait for (States.jsx "notfound").
      state={material ? 'wait' : sheetGone ? 'idle' : 'think'}
      // What can be done with the sheet itself stands in ⋯ before the places, as a question's
      // "Frage passt nicht" does. The head itself carries the switch and ⋯ and nothing else.
      menu={{
        actions: material
          ? [
              {
                key: 'rename',
                // Signs of their own: the pencil and the camera stand for places further down
                // the same sheet (settings, a new photo), and were there twice (#599).
                icon: 'keyboard',
                // The row reads "Umbenennen" like the places beside it; a screen reader hears
                // what is renamed.
                label: t('library:rename'),
                accessibilityLabel: t('library:rename_label', { title }),
                onPress: openRename,
              },
              ...(material.status === 'ready'
                ? [
                    {
                      key: 'add_page',
                      icon: 'plus' as const,
                      label: t('library:add_page'),
                      onPress: addPage,
                    },
                  ]
                : []),
            ]
          : [],
        canAct: !changing,
      }}
    >
      {material && primary ? (
        <SheetPages count={material.photo_count}>
          {material.status === 'ready' && material.item_count > 0 ? (
            <Btn
              size="sm"
              busy={busyId === material.id}
              disabled={deleting || renaming}
              accessibilityLabel={t(`library:${primary.action}_label`, { title })}
              onPress={() => start(material.id, primary.action === 'speak' ? 'speak' : 'practice')}
            >
              {primary.action === 'practice'
                ? t('library:practice_from')
                : t(`library:${primary.action}`)}
            </Btn>
          ) : null}
        </SheetPages>
      ) : null}
      {content}

      <Sheet
        visible={deleteOpen}
        // The sheet is about this one question; deleting asks once more in the same sheet.
        title={
          confirming || !target
            ? t('library:item_delete_sheet.title')
            : t('library:items.question_label', { number: target.number })
        }
        closeLabel={t(confirming ? 'common:actions.cancel' : 'common:actions.close')}
        onClose={() => setDeleteOpen(false)}
      >
        {target ? (
          <Card tone="lavender">
            <MathText text={target.item.prompt} style={TYPE.body} />
          </Card>
        ) : null}
        {confirming ? (
          <>
            <Text style={[TYPE.body, SHEET_TEXT]}>{t('library:item_delete_sheet.body')}</Text>
            <ErrorNote text={deleteError} />
            <Btn variant="danger" pill full busy={deleting} onPress={() => void confirmDelete()}>
              {t('library:item_delete_sheet.confirm')}
            </Btn>
          </>
        ) : (
          <ListGroup>
            <Row
              icon="trash"
              iconTone="accent"
              destructive
              chevron={false}
              title={t('library:items.delete')}
              accessibilityLabel={
                target ? t('library:items.delete_label', { number: target.number }) : undefined
              }
              onPress={() => setConfirming(true)}
            />
          </ListGroup>
        )}
      </Sheet>

      <Sheet
        visible={renameOpen}
        title={t('library:rename_sheet.title')}
        closeLabel={t('common:actions.cancel')}
        onClose={() => setRenameOpen(false)}
        footer={
          <Btn pill full busy={renaming} disabled={!draftOk} onPress={() => void saveRename()}>
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
