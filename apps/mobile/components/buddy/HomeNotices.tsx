// What Buddy tells at the end of the conversation on his home, with its buttons — never as a card
// on top (lib/homeLayout.ts, issue #17): photos not sent yet, a spot or pages he could not read, a
// sheet he could not read at all, the finished practice. Each is the thread's one card (`ChatCard`,
// design components/practice/PracticeReady.jsx); the violet button belongs to the bar on top when
// there is one (`quiet`): then the card's main action is the paper one.

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
import { CardChoices, ChatCard, type CardAction } from './ChatCard.js';
import { quietVariant, resultNotice, type Quiet } from './extensions.js';
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
  /** The open question (`DecisionCard`), asked here when the layout says so. */
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
    // It follows the bar on top like every card here: one violet button on the screen.
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
  if (!draft)
    return (
      <ChatCard
        live
        icon="camera"
        title={t('capture:draft.discarded', { count: shown.photos.length })}
        secondary={{
          label: t('capture:draft.undo'),
          accessibilityLabel: t('capture:draft.undo_label'),
          onPress: left.bringBack,
        }}
      />
    );
  return (
    <ChatCard
      live
      icon="camera"
      thumb={draft.photos.find((p) => !p.pdf)?.uri ?? null}
      title={t('capture:draft.title')}
      detail={t('capture:draft.body', { count: draft.photos.length })}
      primary={{
        label: t('capture:draft.resume'),
        variant: quietVariant(quiet),
        // The pages from before stand above her text again (issue #519).
        onPress: () => askAttach({ open: null, resume: true }),
      }}
      secondary={{ label: t('capture:draft.discard'), onPress: left.letGo }}
    />
  );
}

/** What every notice Buddy asks about gets: its photo, and how its taps run. */
type Told = { thumb: string | null; busy: boolean; quiet: Quiet; andReload: AndReload };
type Asked<N> = Told & { notice: N };

/**
 * One spot Buddy could not read, asked with the readings to tap (issue #164): she is holding the
 * sheet, so the words say which task it is and she only has to say which reading. Never a
 * cut-out of the photo — a box would come from the same reading that could not settle this spot,
 * and a wrong one would show her another task of her own sheet. The readings are the card's
 * answers (design components/buddy/Cards.jsx:61, paper pills); "weiß ich nicht" is always there,
 * so the ask is never a wall.
 */
function UnclearNotice({
  notice,
  thumb,
  busy,
  andReload,
}: Asked<Extract<Notice, { type: 'unclear_spot' }>>) {
  const { t } = useTranslation('buddy');
  const { spot } = notice;
  return (
    <ChatCard
      live
      tone="warn"
      icon="file"
      thumb={thumb}
      title={
        notice.photo_count > 1
          ? t('buddy:now.unclear_title', { page: notice.page, about: spot.about })
          : t('buddy:now.unclear_title_single', { about: spot.about })
      }
      detail={
        spot.status === 'answered'
          ? t('buddy:now.unclear_writing', { reading: spot.answer ?? '' })
          : [spot.task, t('buddy:now.unclear_pick')].join('\n')
      }
    >
      {spot.status === 'open' ? (
        <CardChoices>
          {/* Her answer is one of the readings the server offered, by its own alias. */}
          {spot.readings.map((r) => (
            <Btn
              key={r.ref}
              size="sm"
              variant="secondary"
              disabled={busy}
              accessibilityLabel={t('buddy:now.unclear_reading_label', { reading: r.text })}
              onPress={() => andReload(() => clarifyUnclear(notice.material_id, spot.ref, r.ref))}
            >
              {r.text}
            </Btn>
          ))}
          <Btn
            size="sm"
            variant="ghost"
            disabled={busy}
            onPress={() => andReload(() => clarifyUnclear(notice.material_id, spot.ref, null))}
          >
            {t('buddy:now.unclear_unknown')}
          </Btn>
        </CardChoices>
      ) : null}
    </ChatCard>
  );
}

/** Pages Buddy could not read completely: take them again, or "Passt so" without them. */
function PagesNotice({
  notice,
  thumb,
  busy,
  quiet,
  andReload,
}: Asked<Extract<Notice, { type: 'pages_missing' }>>) {
  const { t } = useTranslation('buddy');
  const several = notice.photo_count > 1;
  // A photo of something else is not worth taking again: then only "Passt so".
  const retake = notice.pages.some((p) => p.problem !== 'not_material');
  return (
    <ChatCard
      live
      tone="warn"
      icon="file"
      thumb={thumb}
      title={
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
      primary={
        retake
          ? {
              label: t('buddy:now.pages_retake', { count: several ? notice.pages.length : 1 }),
              variant: quietVariant(quiet),
              disabled: busy,
              onPress: () =>
                askAttach({
                  open: 'camera',
                  link: {
                    completes: notice.material_id,
                    ...(several ? { pages: notice.pages.map((p) => p.page).join(', ') } : {}),
                  },
                }),
            }
          : null
      }
      secondary={{
        label: t('buddy:now.pages_ok'),
        disabled: busy,
        onPress: () => andReload(() => acceptMissingPages(notice.material_id)),
      }}
    />
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
  const newPhoto: CardAction = {
    label: t('buddy:now.failed_new_photo'),
    disabled: busy,
    // The same purpose (homework stays homework) and, for a page, the same sheet (M-18).
    onPress: () =>
      askAttach({
        open: 'camera',
        link: { purpose: now.purpose ?? 'study', completes: now.completes ?? null },
      }),
  };
  return (
    <ChatCard
      live
      tone="warn"
      icon="file"
      thumb={thumb}
      title={t(`buddy:${failedTitleKey(now)}`, { title: now.title })}
      detail={t(`buddy:now.failed_${now.reason ?? 'model_error'}`)}
      primary={
        now.retryable
          ? {
              label: t('buddy:now.failed_retry'),
              variant: quietVariant(quiet),
              disabled: busy,
              onPress: () => andReload(() => retryMaterial(now.material_id)),
            }
          : { ...newPhoto, variant: quietVariant(quiet) }
      }
      secondary={now.retryable ? newPhoto : null}
    />
  );
}

/**
 * The finished practice with Buddy's greeting that names it: the thread's one card
 * (ui_kits/app/Flows.jsx `after`), with "Ansehen" into the full view. No detail — the greeting
 * above it has said how it went, and the card does not say it again (issue #195).
 */
export function ResultView({
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
    <ChatCard
      tone="accent"
      icon="check"
      title={t('buddy:now.result_title')}
      primary={{
        label: t('buddy:now.result_view'),
        variant: quietVariant(quiet),
        disabled: busy,
        onPress: () => router.push(`/practice/${sessionId}`),
      }}
    />
  );
}
