// What Buddy tells at the end of the conversation on his home, with its buttons — never as a card
// on top (lib/homeLayout.ts, issue #17): photos not sent yet, the open question, and what a domain
// tells there (`homeNoticeSlot`: the learning domain's sheets Buddy could not read, the finished
// practice, "Buddy is working" — components/learn/HomeNotices.tsx). Each is the thread's one card
// (`ChatCard`, design components/practice/PracticeReady.jsx); the violet button belongs to the bar
// on top when there is one (`quiet`): then the card's main action is the paper one.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { askAttach } from '../../lib/capture/attachRequest.js';
import { refreshHome, type HomeAct } from '../../lib/buddy/useHomeAct.js';
import type { LeftBehind } from '../../lib/buddy/useHomePhotos.js';
import type { CaptureDraft } from '../../lib/capture/draft.js';
import type { Timed } from '../../lib/buddy/homeThread.js';
import type { HomeLayout } from '../../lib/homeLayout.js';
import { slot } from '../../lib/registry.js';
import { ChatCard } from './ChatCard.js';
import { quietVariant, type Quiet } from './extensions.js';

/** A tap that changes something on the server, then loads the home again. */
export type AndReload = (fn: () => Promise<unknown>) => void;

type Props = {
  h: BuddyHome;
  layout: HomeLayout;
  left: LeftBehind;
  busy: boolean;
  /** The violet button belongs to the bar on top when there is one. */
  quiet: Quiet;
  act: HomeAct;
  /** The open question (`DecisionCard`), asked here when the layout says so. */
  decision: ReactElement | null;
};

/** What a domain's notices are told with. */
type NoticeParts = Pick<Props, 'h' | 'layout' | 'busy' | 'quiet'> & {
  andReload: AndReload;
};

/**
 * What a domain tells at the end of the conversation (issue #107): its notices before the open
 * question, each with the moment it belongs to (null: it is about now), and the one line after it.
 */
export type DomainNotices = {
  told(parts: NoticeParts): Timed<ReactElement>[];
  after(parts: NoticeParts): ReactElement | null;
};

export const homeNoticeSlot = slot<DomainNotices>('Notizen im Gespräch');

/**
 * The notices of the conversation, in their order, each with the moment it belongs to (issue
 * #630): the finished practice when it ended, the check-in after a test when the test day was
 * over — they stand there in the thread (`placeByTime`), not under what was said since. What is
 * about now (photos not sent, a sheet Buddy could not read, "Buddy is working") has no moment and
 * stands at the end. Empty when Buddy has nothing.
 */
export function homeNotices({ h, layout, left, busy, quiet, act, decision }: Props) {
  const andReload: AndReload = (fn) =>
    void act(async () => {
      await fn();
      await refreshHome();
    });
  const domain = homeNoticeSlot.get();
  const parts: NoticeParts = { h, layout, busy, quiet, andReload };
  const now = (node: ReactElement | null): Timed<ReactElement>[] =>
    node ? [{ item: node, at: null }] : [];
  // The open question: the check-in after a test stands where the test day was over.
  const asked = layout.decisionInline ? decision : null;
  return [
    ...now(
      left.shown ? <DraftNotice key="draft" left={left} shown={left.shown} quiet={quiet} /> : null,
    ),
    ...(domain?.told(parts) ?? []),
    // It follows the bar on top like every card here: one violet button on the screen.
    ...(asked
      ? [
          {
            item: asked,
            at:
              asked.key === 'decision' && h.decision?.type === 'how_did_it_go'
                ? (h.decision.asked_at ?? null)
                : null,
          },
        ]
      : []),
    ...now(domain?.after(parts) ?? null),
  ];
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
