// What the learning domain tells at the end of the conversation on Buddy's home (components/buddy/
// HomeNotices.tsx `homeNoticeSlot`, issue #107): a spot or pages Buddy could not read, a sheet he
// could not read at all, the finished practice — and "Buddy is working" after the open question.
// Each is the thread's one card (`ChatCard`, design components/practice/PracticeReady.jsx); the
// violet button belongs to the bar on top when there is one (`quiet`): then the card's main
// action is the paper one.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { clarifyUnclear } from '../../lib/api/endpoints.js';
import { acceptMissingPages, retryMaterial } from '../../lib/api/learningEndpoints.js';
import { failedTitleKey } from '../../lib/learning/failedTitle.js';
import { useHomeThumbs } from '../../lib/learning/homePhotos.js';
import { askAttach } from '../../lib/capture/attachRequest.js';
import { CardChoices, ChatCard, type CardAction } from '../buddy/ChatCard.js';
import { quietVariant, type Quiet } from '../buddy/extensions.js';
import type { AndReload, DomainNotices } from '../buddy/HomeNotices.js';
import { WorkingNote } from '../buddy/WorkingNote.js';
import { Btn } from '../lb/Btn.js';
import { ResultNotice } from './ResultNotice.js';

type Notice = NonNullable<BuddyHome['notice']>;
type Now = NonNullable<BuddyHome['now']>;

export const learningNotices: DomainNotices = {
  told({ h, layout, busy, quiet, andReload }) {
    const missing = h.notice?.type === 'pages_missing' ? h.notice : null;
    const unclear = h.notice?.type === 'unclear_spot' ? h.notice : null;
    const failed = layout.failed && h.now?.type === 'material_failed' ? h.now : null;
    const result = layout.result && h.now?.type === 'practice_result' ? h.now : null;
    const told = { busy, quiet, andReload };
    return [
      unclear
        ? {
            item: <UnclearNotice key="unclear" notice={unclear} {...told} />,
            at: null,
          }
        : null,
      missing
        ? {
            item: <PagesNotice key="pages" notice={missing} {...told} />,
            at: null,
          }
        : null,
      // A sheet Buddy could not read: said here, with "Nochmal lesen" right at it (issue #17).
      failed
        ? {
            item: <FailedNotice key="failed" now={failed} {...told} />,
            at: null,
          }
        : null,
      // The finished practice stands where it ended (issue #630).
      result
        ? {
            item: <ResultNotice key="result" now={result} busy={busy} quiet={quiet} />,
            at: result.finished_at ?? null,
          }
        : null,
    ].filter((n) => n !== null);
  },
  // "Buddy is working", said once: in the reading bar when it says the same thing, else here.
  after: ({ h, layout }) =>
    layout.working === 'thread' && h.working ? (
      <WorkingNote key="working" what={h.working} />
    ) : null,
};

/** What every notice Buddy asks about gets: how its taps run. Its photo the home found. */
type Told = { busy: boolean; quiet: Quiet; andReload: AndReload };
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
  busy,
  andReload,
}: Asked<Extract<Notice, { type: 'unclear_spot' }>>) {
  const { t } = useTranslation('buddy');
  const thumb = useHomeThumbs().unclear;
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
  busy,
  quiet,
  andReload,
}: Asked<Extract<Notice, { type: 'pages_missing' }>>) {
  const { t } = useTranslation('buddy');
  const thumb = useHomeThumbs().page;
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
  busy,
  quiet,
  andReload,
}: Told & { now: Extract<Now, { type: 'material_failed' }> }) {
  const { t } = useTranslation('buddy');
  const thumb = useHomeThumbs().failed;
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
