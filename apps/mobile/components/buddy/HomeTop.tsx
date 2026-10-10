// What matters now on Buddy's home lies on top, over the greeting and the ways to start: at most
// one slim bar (≤ ~64 pt, issue #17) and the system's own notes. It never pushes anything down,
// and she can close it (only on this phone, components/buddy/TopOverlay.tsx).

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { seedSession } from '../../lib/api/queries.js';
import { askAttach } from '../../lib/capture/attachRequest.js';
import { skipStep, startStep, undoAction } from '../../lib/api/endpoints.js';
import type { HomeAct } from '../../lib/buddy/useHomeAct.js';
import type { HomeLayout } from '../../lib/homeLayout.js';
import { SPACE } from '../../lib/theme/space.js';
import { Banner } from '../lb/Banner.js';
import { CaptureBar, ReadingBar, ReadyBar, ResumeBar } from './SlimBar.js';
import { CLOSE_INSET, TopOverlay } from './TopOverlay.js';

type Props = {
  h: BuddyHome;
  layout: HomeLayout;
  /** The key of what lies on top, unless she closed it on this phone (lib/homeLayout.ts topKey). */
  openCard: string | null;
  busy: boolean;
  act: HomeAct;
  /** The photos of the sheet being read, while they are on the phone. */
  readingPages: readonly string[];
  /** "Kein Foto nötig": the receipt of the photo ask the capture bar carries (issue #94). */
  captureUndo: MessageView['actions'][number] | null;
  onClose: (key: string) => void;
  /** How tall it is; it is drawn over the conversation (issue #190). Must be stable. */
  onHeight: (height: number) => void;
};

export function HomeTop({ openCard, onClose, onHeight, ...bar }: Props) {
  const { t } = useTranslation('buddy');
  if (!openCard) return null;
  const { system } = bar.h;
  const notes = [
    !system.model ? (
      <Banner key="model" tone="warning">
        {t('buddy:system.no_model')}
      </Banner>
    ) : null,
    system.scheduler === 'stale' ? (
      <Banner key="scheduler" tone="warning">
        {t('buddy:system.scheduler_stale')}
      </Banner>
    ) : null,
  ].filter((node) => node !== null);
  const slim = slimBar(bar);
  // The slim bar first (the close button sits in its corner), then what the system says. Only
  // system notes: the first one leaves room for the close button.
  const top = slim
    ? [slim, ...notes]
    : notes.map((n, i) =>
        i === 0 ? (
          <View key={`inset-${n.key ?? i}`} style={{ paddingRight: CLOSE_INSET + SPACE.lg }}>
            {n}
          </View>
        ) : (
          n
        ),
      );
  if (top.length === 0) return null;
  return (
    <TopOverlay
      id={openCard}
      closeLabel={t('buddy:card.close')}
      onClose={() => onClose(openCard)}
      onHeight={onHeight}
    >
      {top}
    </TopOverlay>
  );
}

/** The one slim bar the layout puts on top, or none. */
function slimBar({
  h,
  layout,
  busy,
  act,
  readingPages,
  captureUndo,
}: Omit<Props, 'openCard' | 'onClose' | 'onHeight'>): ReactElement | null {
  const now = h.now;
  if (layout.bar === null || now === null) return null;
  const startPrepared = (stepId: string) =>
    void act(async () => {
      const { session_id, session } = await startStep(stepId);
      if (session) seedSession(session);
      router.push(`/practice/${session_id}`);
    });
  const skipPrepared = (stepId: string) => void act(() => skipStep(stepId));
  if (layout.bar === 'resume' && now.type === 'resume_practice') {
    return (
      <ResumeBar
        key="now"
        card={now}
        busy={busy}
        titleInset={CLOSE_INSET}
        onResume={(id) => router.push(`/practice/${id}`)}
      />
    );
  }
  if (layout.bar === 'ready' && now.type === 'practice_ready') {
    return (
      <ReadyBar
        key="now"
        card={now}
        busy={busy}
        titleInset={CLOSE_INSET}
        onStart={startPrepared}
        onSkip={skipPrepared}
      />
    );
  }
  // The practice prepared after a result: the bar's job (the result is in the thread).
  if (layout.bar === 'next' && now.type === 'practice_result' && now.next) {
    return (
      <ReadyBar
        key="now"
        card={{ type: 'practice_ready', ...now.next }}
        busy={busy}
        titleInset={CLOSE_INSET}
        onStart={startPrepared}
        onSkip={skipPrepared}
      />
    );
  }
  if (layout.bar === 'capture' && now.type === 'capture_needed') {
    const link = {
      stepId: now.step_id ?? null,
      goalId: now.goal?.id ?? null,
      // The forgotten back joins the sheet it was forgotten from instead of becoming a
      // second one (issue #118) — the same way the library's own "Seite hinzufügen" takes.
      ...(now.completes ? { completes: now.completes, add: true } : {}),
    };
    return (
      <CaptureBar
        key="now"
        card={now}
        busy={busy}
        titleInset={CLOSE_INSET}
        // "Foto machen": the camera at once, the photo lands in the chat's bar (issue #519).
        onPress={() => askAttach({ open: 'camera', link })}
        onNoPhoto={captureUndo ? () => void act(() => undoAction(captureUndo.id)) : null}
      />
    );
  }
  if (layout.bar === 'reading' && now.type === 'material_processing') {
    return (
      <ReadingBar
        key="now"
        card={now}
        pages={readingPages}
        preparing={layout.working === 'bar'}
        titleInset={CLOSE_INSET}
      />
    );
  }
  return null;
}
