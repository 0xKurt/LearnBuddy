// The learning domain's slim bar on top of Buddy's home (components/buddy/HomeTop.tsx `homeBar`,
// issue #107): a practice to go on with, one that is ready or prepared next after a result, the
// photo Buddy waits for, the sheet being read. Which one the layout puts there is the domain's
// rule too (lib/learning/homeLayout.ts).

import { router } from 'expo-router';

import { skipStep, undoAction } from '../../lib/api/endpoints.js';
import { startStep } from '../../lib/api/learningEndpoints.js';
import { seedSession } from '../../lib/api/sessionQueries.js';
import { askAttach } from '../../lib/capture/attachRequest.js';
import { useHomeThumbs } from '../../lib/learning/homeScope.js';
import type { BarProps } from '../buddy/HomeTop.js';
import { CaptureBar, ReadingBar, ReadyBar, ResumeBar } from './SlimBar.js';

export function HomeBar({ h, layout, busy, act, captureUndo, titleInset }: BarProps) {
  const now = h.now;
  // The photos of the sheet being read, while they are on the phone (they arrived).
  const readingPages = useHomeThumbs().reading;
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
        card={now}
        busy={busy}
        titleInset={titleInset}
        onResume={(id) => router.push(`/practice/${id}`)}
      />
    );
  }
  if (layout.bar === 'ready' && now.type === 'practice_ready') {
    return (
      <ReadyBar
        card={now}
        busy={busy}
        titleInset={titleInset}
        onStart={startPrepared}
        onSkip={skipPrepared}
      />
    );
  }
  // The practice prepared after a result: the bar's job (the result is in the thread).
  if (layout.bar === 'next' && now.type === 'practice_result' && now.next) {
    return (
      <ReadyBar
        card={{ type: 'practice_ready', ...now.next }}
        busy={busy}
        titleInset={titleInset}
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
        card={now}
        busy={busy}
        titleInset={titleInset}
        // "Foto machen": the camera at once, the photo lands in the chat's bar (issue #519).
        onPress={() => askAttach({ open: 'menu', link })}
        onNoPhoto={captureUndo ? () => void act(() => undoAction(captureUndo.id)) : null}
      />
    );
  }
  if (layout.bar === 'reading' && now.type === 'material_processing') {
    return (
      <ReadingBar
        card={now}
        pages={readingPages}
        preparing={layout.working === 'bar'}
        titleInset={titleInset}
      />
    );
  }
  return null;
}
