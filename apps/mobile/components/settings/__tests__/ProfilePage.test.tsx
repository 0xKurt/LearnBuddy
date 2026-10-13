// requires live verification in Claude Code session — the learner request and the subject
// registry are the edges held here; the real Expo focus/Back and server payloads are exercised
// by tests/web/redesign-profile-view.spec.ts. The save's fences are LearnerSave.test.tsx.
import { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as endpoints from '../../../lib/api/endpoints.js';
import { keys, queryClient } from '../../../lib/api/queries.js';
import { renderInApp } from '../../../testing/render.js';
import { ProfilePage } from '../ProfilePage.js';
const subjects = vi.hoisted(() => ({ reads: vi.fn(), enabled: true }));
vi.mock('../../buddy/extensions.js', () => ({
  profileSubjects: {
    get: () =>
      subjects.enabled
        ? ({ onOpenSubject }: { onOpenSubject: (id: string) => void }) => {
            subjects.reads();
            return (
              <button onClick={() => onOpenSubject('22222222-2222-4222-8222-222222222222')}>
                Mathe: Brüche
              </button>
            );
          }
        : null,
  },
}));
const learner = LearnerView.parse({
  id: '11111111-1111-4111-8111-111111111111',
  relation: 'child',
  display_name: 'Mia',
  birth_date: '2013-01-01',
  is_minor: true,
  level: 'school',
  grade: 6,
  locale: 'de',
  curriculum_region: 'he',
  version: 2,
  own_consent_due: false,
});
const account = {
  id: '44444444-4444-4444-8444-444444444444',
  locale: 'de' as const,
  pin_set: true,
  deletion_due_at: null,
  deletion_running: false,
  consent_current: true,
};
function Page({
  active = true,
  onSubject = vi.fn(),
}: {
  active?: boolean;
  onSubject?: (id: string) => void;
}) {
  return (
    <ProfilePage learner={learner} account={account} active={active} onOpenSubject={onSubject} />
  );
}
beforeEach(() => {
  queryClient.setQueryData(
    keys.me,
    MeResponse.parse({
      account,
      learner,
      consent_version: 'v1',
      capabilities: { model: true, push: false },
    }),
  );
  subjects.enabled = true;
  subjects.reads.mockClear();
});
afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

it('shows the design’s rows — name, class, Bundesland — and no row the design does not have', () => {
  renderInApp(<Page />);
  expect(screen.getByText('Über dich')).toBeTruthy();
  expect(screen.getByText('Name')).toBeTruthy();
  expect(screen.getByText('Klasse')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Bundesland, Hessen' })).toBeTruthy();
  // With a class the level has no row of its own; the language lives in the settings.
  expect(screen.queryByText('Lernbereich')).toBeNull();
  expect(screen.queryByText('Sprache')).toBeNull();
  expect(screen.getByRole('button', { name: 'Abmelden' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Konto löschen' })).toBeTruthy();
});

it('corrects the Bundesland in the shared choice sheet with one versioned save, without a sub-page', async () => {
  const update = vi
    .spyOn(endpoints, 'updateLearner')
    .mockResolvedValue({ ...learner, curriculum_region: 'by', version: 3 });
  renderInApp(<Page />);
  fireEvent.click(screen.getByRole('button', { name: 'Bundesland, Hessen' }));
  expect(await screen.findByText('In welchem Bundesland geht dein Kind zur Schule?')).toBeTruthy();
  expect((await screen.findByRole('radio', { name: 'Hessen' })).getAttribute('aria-checked')).toBe(
    'true',
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('radio', { name: 'Bayern' }));
  });
  expect(update).toHaveBeenCalledWith({ curriculum_region: 'by', version: 2 });
  await waitFor(() =>
    expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner?.curriculum_region).toBe('by'),
  );
});

it('says a failed correction on the page and keeps what the server has', async () => {
  vi.spyOn(endpoints, 'updateLearner').mockRejectedValue(new Error('offline'));
  renderInApp(<Page />);
  fireEvent.click(screen.getByRole('button', { name: 'Bundesland, Hessen' }));
  await act(async () => {
    fireEvent.click(await screen.findByRole('radio', { name: 'Bayern' }));
  });
  await waitFor(() =>
    expect(screen.getByText("Da ist was schiefgegangen. Versuch's gleich nochmal.")).toBeTruthy(),
  );
  expect(screen.getByRole('button', { name: 'Bundesland, Hessen' })).toBeTruthy();
});

it('unmounts subject controls while hidden, keeps the page usable without a registered subject slot and navigates the exact ID', () => {
  const onSubject = vi.fn();
  const view = renderInApp(<Page onSubject={onSubject} />);
  expect(subjects.reads).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Mathe: Brüche' }));
  expect(onSubject).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  view.rerender(<Page active={false} />);
  expect(screen.queryByRole('button', { name: 'Mathe: Brüche' })).toBeNull();
  subjects.enabled = false;
  view.rerender(<Page />);
  expect(screen.getByRole('button', { name: 'Bundesland, Hessen' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
