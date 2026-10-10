// What Buddy tells at the end of the conversation on his home, with its buttons — never as a card
// on top (lib/homeLayout.ts, issue #17): photos not sent yet, a spot or pages he could not read, a
// sheet he could not read at all, the finished practice. Each is a <NoticeBubble>; the violet
// button belongs to the bar on top when there is one (`quiet`).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { acceptMissingPages, clarifyUnclear, retryMaterial } from '../../lib/api/endpoints.js';
import { askAttach } from '../../lib/capture/attachRequest.js';
import { failedTitleKey } from '../../lib/buddy/failedTitle.js';
import { refreshHome, type HomeAct } from '../../lib/buddy/useHomeAct.js';
import type { HomeThumbs, LeftBehind } from '../../lib/buddy/useHomePhotos.js';
import type { CaptureDraft } from '../../lib/capture/draft.js';
import type { HomeLayout } from '../../lib/homeLayout.js';
import { Btn } from '../lb/Btn.js';
import { resultNotice, type Quiet } from './extensions.js';
import { NoticeBubble } from './NoticeBubble.js';
import { WorkingNote } from './WorkingNote.js';

type Notice = NonNullable<BuddyHome['notice']>;
type Now = NonNullable<BuddyHome['now']>;
/** A tap that changes something on the server, then loads the home again. */
type AndReload = (fn: () => Promise<unknown>) => void;

type Props = {
  h: BuddyHome;
  layout: HomeLayout;
  left: LeftBehind;
  thumbs: HomeThumbs;
  busy: boolean;
  /** The violet button belongs to the bar on top when there is one. */
  quiet: Quiet;
  act: HomeAct;
  /** The open question, asked here when the layout says so. */
  decision: ReactElement | null;
};

/** The notices at the end of the conversation, in their order; empty when Buddy has nothing. */
export function homeNotices({ h, layout, left, thumbs, busy, quiet, act, decision }: Props) {
  const andReload: AndReload = (fn) =>
    void act(async () => {
      await fn();
      await refreshHome();
    });
  const missing = h.notice?.type === 'pages_missing' ? h.notice : null;
  const unclear = h.notice?.type === 'unclear_spot' ? h.notice : null;
  const failed = layout.failed && h.now?.type === 'material_failed' ? h.now : null;
  const result = layout.result && h.now?.type === 'practice_result' ? h.now : null;
  // The finished practice is a domain's to tell (components/buddy/extensions.ts).
  const Result = resultNotice.get();
  return [
    left.shown ? <DraftNotice key="draft" left={left} shown={left.shown} quiet={quiet} /> : null,
    unclear ? (
      <UnclearNotice
        key="unclear"
        notice={unclear}
        thumb={thumbs.unclear}
        busy={busy}
        quiet={quiet}
        andReload={andReload}
      />
    ) : null,
    missing ? (
      <PagesNotice
        key="pages"
        notice={missing}
        thumb={thumbs.page}
        busy={busy}
        quiet={quiet}
        andReload={andReload}
      />
    ) : null,
    // A sheet Buddy could not read: said here, with "Nochmal lesen" right at it (issue #17).
    failed ? (
      <FailedNotice
        key="failed"
        now={failed}
        thumb={thumbs.failed}
        busy={busy}
        quiet={quiet}
        andReload={andReload}
      />
    ) : null,
    result && Result ? <Result key="result" now={result} busy={busy} quiet={quiet} /> : null,
    // The open question, and "Buddy is working" said once.
    layout.decisionInline ? decision : null,
    layout.working === 'thread' && h.working ? (
      <WorkingNote key="working" what={h.working} />
    ) : null,
  ].filter((node) => node !== null);
}

/** Photos left from before, not sent yet — or just let go, with "Rückgängig" (issue #82). */
function DraftNotice({
  left,
  shown,
  quiet,
}: {
  left: LeftBehind;
  shown: CaptureDraft;
  quiet: Quiet;
}) {
  const { t } = useTranslation('capture');
  const { draft } = left;
  return (
    <NoticeBubble
      text={
        draft
          ? t('capture:draft.title')
          : t('capture:draft.discarded', { count: shown.photos.length })
      }
      detail={draft ? t('capture:draft.body', { count: draft.photos.length }) : null}
      thumb={draft ? (draft.photos.find((p) => !p.pdf)?.uri ?? null) : null}
    >
      {draft ? (
        <>
          <Btn
            size="sm"
            variant={quiet}
            // The pages from before stand above her text again (issue #519).
            onPress={() => askAttach({ open: null, resume: true })}
          >
            {t('capture:draft.resume')}
          </Btn>
          <Btn size="sm" variant="ghost" onPress={left.letGo}>
            {t('capture:draft.discard')}
          </Btn>
        </>
      ) : (
        <Btn
          size="sm"
          variant="ghost"
          accessibilityLabel={t('capture:draft.undo_label')}
          onPress={left.bringBack}
        >
          {t('capture:draft.undo')}
        </Btn>
      )}
    </NoticeBubble>
  );
}

/** What every notice Buddy asks about gets: its photo, and how its taps run. */
type Told = { thumb: string | null; busy: boolean; quiet: Quiet; andReload: AndReload };
type Asked<N> = Told & { notice: N };

/**
 * One spot Buddy could not read, asked with the readings to tap (issue #164): she is holding the
 * sheet, so the words say which task it is and she only has to say which reading. Never a
 * cut-out of the photo — a box would come from the same reading that could not settle this spot,
 * and a wrong one would show her another task of her own sheet.
 */
function UnclearNotice({
  notice,
  thumb,
  busy,
  quiet,
  andReload,
}: Asked<Extract<Notice, { type: 'unclear_spot' }>>) {
  const { t } = useTranslation('buddy');
  const { spot } = notice;
  return (
    <NoticeBubble
      text={
        notice.photo_count > 1
          ? t('buddy:now.unclear_title', { page: notice.page, about: spot.about })
          : t('buddy:now.unclear_title_single', { about: spot.about })
      }
      detail={
        spot.status === 'answered'
          ? t('buddy:now.unclear_writing', { reading: spot.answer ?? '' })
          : [spot.task, t('buddy:now.unclear_pick')].join('\n')
      }
      thumb={thumb}
    >
      {/* Her answer is one of the readings the server offered, by its own alias — and
          "weiß ich nicht" is always there, so the ask is never a wall. */}
      {spot.status === 'open'
        ? spot.readings.map((r) => (
            <Btn
              key={r.ref}
              size="sm"
              variant={quiet}
              disabled={busy}
              accessibilityLabel={t('buddy:now.unclear_reading_label', { reading: r.text })}
              onPress={() => andReload(() => clarifyUnclear(notice.material_id, spot.ref, r.ref))}
            >
              {r.text}
            </Btn>
          ))
        : null}
      {spot.status === 'open' ? (
        <Btn
          size="sm"
          variant="ghost"
          disabled={busy}
          onPress={() => andReload(() => clarifyUnclear(notice.material_id, spot.ref, null))}
        >
          {t('buddy:now.unclear_unknown')}
        </Btn>
      ) : null}
    </NoticeBubble>
  );
}

/** Pages Buddy could not read completely: take them again, or "OK" without them. */
function PagesNotice({
  notice,
  thumb,
  busy,
  quiet,
  andReload,
}: Asked<Extract<Notice, { type: 'pages_missing' }>>) {
  const { t } = useTranslation('buddy');
  const several = notice.photo_count > 1;
  return (
    <NoticeBubble
      text={
        several
          ? t('buddy:now.pages_title', { count: notice.pages.length })
          : t('buddy:now.pages_title_single')
      }
      detail={[
        ...notice.pages.map((p) =>
          several
            ? t('buddy:now.pages_line', {
                page: p.page,
                problem: t(`buddy:now.pages_problem.${p.problem ?? 'other'}`),
              })
            : t(`buddy:now.pages_problem.${p.problem ?? 'other'}`),
        ),
        notice.title
          ? t('buddy:now.pages_rest', { title: notice.title })
          : t('buddy:now.pages_rest_untitled'),
      ].join('\n')}
      thumb={thumb}
    >
      {/* A photo of something else is not worth taking again: then only "OK". */}
      {notice.pages.some((p) => p.problem !== 'not_material') ? (
        <Btn
          size="sm"
          variant={quiet}
          disabled={busy}
          onPress={() =>
            askAttach({
              open: 'camera',
              link: {
                completes: notice.material_id,
                ...(several ? { pages: notice.pages.map((p) => p.page).join(', ') } : {}),
              },
            })
          }
        >
          {t('buddy:now.pages_retake', { count: several ? notice.pages.length : 1 })}
        </Btn>
      ) : null}
      <Btn
        size="sm"
        variant="ghost"
        disabled={busy}
        onPress={() => andReload(() => acceptMissingPages(notice.material_id))}
      >
        {t('buddy:now.pages_ok')}
      </Btn>
    </NoticeBubble>
  );
}

/** A sheet Buddy could not read: read it again when that can help, or a new photo. */
function FailedNotice({
  now,
  thumb,
  busy,
  quiet,
  andReload,
}: Told & { now: Extract<Now, { type: 'material_failed' }> }) {
  const { t } = useTranslation('buddy');
  return (
    <NoticeBubble
      text={t(`buddy:${failedTitleKey(now)}`, { title: now.title })}
      detail={t(`buddy:now.failed_${now.reason ?? 'model_error'}`)}
      thumb={thumb}
    >
      {now.retryable ? (
        <Btn
          size="sm"
          variant={quiet}
          disabled={busy}
          onPress={() => andReload(() => retryMaterial(now.material_id))}
        >
          {t('buddy:now.failed_retry')}
        </Btn>
      ) : null}
      <Btn
        size="sm"
        variant={now.retryable ? 'ghost' : quiet}
        disabled={busy}
        // The same purpose (homework stays homework) and, for a page, the same sheet (M-18).
        onPress={() =>
          askAttach({
            open: 'camera',
            link: { purpose: now.purpose ?? 'study', completes: now.completes ?? null },
          })
        }
      >
        {t('buddy:now.failed_new_photo')}
      </Btn>
    </NoticeBubble>
  );
}

/** "Ansehen": the full view of a finished practice — in its notice, or with Buddy's greeting. */
export function ResultViewBtn({
  sessionId,
  busy,
  quiet,
}: {
  sessionId: string;
  busy: boolean;
  quiet: Quiet;
}) {
  const { t } = useTranslation('buddy');
  return (
    <Btn
      size="sm"
      variant={quiet}
      disabled={busy}
      onPress={() => router.push(`/practice/${sessionId}`)}
    >
      {t('buddy:now.result_view')}
    </Btn>
  );
}
