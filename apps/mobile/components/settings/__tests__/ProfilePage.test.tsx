// requires live verification in Claude Code session — actual learner request/registry edges
// are held here; the real Expo focus/Back and server payloads are exercised by browser flows.
import { LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import * as endpoints from '../../../lib/api/endpoints.js';
import { keys, queryClient } from '../../../lib/api/queries.js';
import * as locale from '../../../lib/i18n/index.js';
import { renderInApp } from '../../../testing/render.js';
import { ProfilePage, type ProfileEditor } from '../ProfilePage.js';
import { toast } from '../../lb/Toast.js';
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
function cache(next: LearnerView) {
  queryClient.setQueryData(
    keys.me,
    MeResponse.parse({
      account,
      learner: next,
      consent_version: 'v1',
      capabilities: { model: true, push: false },
    }),
  );
}
function Page({
  person = learner,
  active = true,
  initial = 'language' as ProfileEditor,
  onSubject = vi.fn(),
}: {
  person?: LearnerView;
  active?: boolean;
  initial?: ProfileEditor;
  onSubject?: (id: string) => void;
}) {
  const [editor, setEditor] = useState(initial);
  return (
    <ProfilePage
      learner={person}
      account={account}
      editor={editor}
      active={active}
      onEdit={setEditor}
      onOpenSubject={onSubject}
    />
  );
}
beforeEach(() => {
  cache(learner);
  subjects.enabled = true;
  subjects.reads.mockClear();
});
afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.clear();
  vi.restoreAllMocks();
});
async function choose(name = 'English') {
  await act(async () => {
    fireEvent.click(screen.getByRole('radio', { name }));
  });
}
it('uses the latest cached version, prevents duplicate saves and applies only confirmed locale', async () => {
  cache({ ...learner, version: 7 });
  let resolve!: (v: LearnerView) => void;
  const update = vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  renderInApp(<Page />);
  await choose();
  expect(update).toHaveBeenCalledWith({ locale: 'en', version: 7 });
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: 'Français', hidden: true }));
  expect(update).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ...learner, locale: 'en', version: 8 }));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner?.version).toBe(8);
  expect(apply).toHaveBeenCalledWith('en');
});
it('keeps confirmed locale on failure and permits explicit retry', async () => {
  const update = vi
    .spyOn(endpoints, 'updateLearner')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ...learner, locale: 'en', version: 3 });
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  renderInApp(<Page />);
  await choose();
  await waitFor(() =>
    expect(screen.getByText("Da ist was schiefgegangen. Versuch's gleich nochmal.")).toBeTruthy(),
  );
  expect(screen.getByRole('radio', { name: 'Deutsch' }).getAttribute('aria-checked')).toBe('true');
  expect(apply).not.toHaveBeenCalled();
  await choose();
  await waitFor(() => expect(apply).toHaveBeenCalledWith('en'));
  expect(update).toHaveBeenCalledTimes(2);
});
it.each(['resolve', 'reject'] as const)(
  'invalidates old local %s feedback across leave and return',
  async (kind) => {
    let resolve!: (v: LearnerView) => void;
    let reject!: (v: Error) => void;
    vi.spyOn(endpoints, 'updateLearner').mockImplementation(
      () =>
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
    );
    const show = vi.spyOn(toast, 'show').mockImplementation(() => undefined);
    const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
    const view = renderInApp(<Page />);
    await choose();
    view.rerender(<Page active={false} />);
    expect(screen.queryByRole('radio')).toBeNull();
    view.rerender(<Page />);
    await act(async () =>
      kind === 'resolve'
        ? resolve({ ...learner, locale: 'en', version: 3 })
        : reject(new Error('offline')),
    );
    expect(show).not.toHaveBeenCalled();
    expect(screen.queryByText("Da ist was schiefgegangen. Versuch's gleich nochmal.")).toBeNull();
    if (kind === 'resolve') {
      expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner?.locale).toBe('en');
      expect(apply).toHaveBeenCalledWith('en');
    }
  },
);
it('rejects older confirmed responses after a newer authoritative view', async () => {
  let resolve!: (v: LearnerView) => void;
  vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  renderInApp(<Page />);
  await choose();
  cache({ ...learner, locale: 'fr', version: 9 });
  await act(async () => resolve({ ...learner, locale: 'en', version: 3 }));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner?.locale).toBe('fr');
  expect(apply).not.toHaveBeenCalled();
});
it.each(['clear', 'replace'] as const)(
  'does not restore/apply a delayed response after cache %s',
  async (kind) => {
    let resolve!: (v: LearnerView) => void;
    vi.spyOn(endpoints, 'updateLearner').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
    const show = vi.spyOn(toast, 'show').mockImplementation(() => undefined);
    renderInApp(<Page />);
    await choose();
    if (kind === 'clear') queryClient.clear();
    else cache({ ...learner, id: '33333333-3333-4333-8333-333333333333', version: 1 });
    await act(async () => resolve({ ...learner, locale: 'en', version: 3 }));
    expect(apply).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
    if (kind === 'clear') expect(queryClient.getQueryData(keys.me)).toBeUndefined();
    else expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner?.id).not.toBe(learner.id);
  },
);
it.each(['clear', 'replace'] as const)('does not start a save from %s cache', async (kind) => {
  const update = vi.spyOn(endpoints, 'updateLearner');
  renderInApp(<Page />);
  if (kind === 'clear') queryClient.clear();
  else cache({ ...learner, id: '33333333-3333-4333-8333-333333333333' });
  await choose();
  expect(update).not.toHaveBeenCalled();
});
it('unmounts subject controls while hidden, keeps factual page usable without a registered subject slot and navigates exact ID directly', () => {
  const onSubject = vi.fn();
  const view = renderInApp(<Page initial={null} onSubject={onSubject} />);
  expect(subjects.reads).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Mathe: Brüche' }));
  expect(onSubject).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  view.rerender(<Page initial={null} active={false} />);
  expect(screen.queryByRole('button', { name: 'Mathe: Brüche' })).toBeNull();
  subjects.enabled = false;
  view.rerender(<Page initial={null} />);
  expect(screen.getByRole('button', { name: 'Sprache, Deutsch' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('keeps a held old route save locked across a newly mounted editor instance', async () => {
  let resolve!: (v: LearnerView) => void;
  const update = vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  const old = renderInApp(<Page />);
  await choose();
  old.unmount();
  renderInApp(<Page />);
  await choose('Français');
  expect(update).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ...learner, locale: 'en', version: 3 }));
});

it('rejects a held save after the real Me Query is cleared and recreated with the same learner IDs', async () => {
  let finish!: (next: LearnerView) => void;
  vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  renderInApp(<Page />);
  await choose();
  queryClient.clear();
  cache(learner);
  await act(async () => finish({ ...learner, locale: 'en', version: 3 }));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner?.locale).toBe('de');
  expect(apply).not.toHaveBeenCalled();
});

it('attempts the existing transport while offline and exposes its failure for explicit retry', async () => {
  const request = vi
    .spyOn(endpoints, 'updateLearner')
    .mockRejectedValue(new Error('offline transport'));
  onlineManager.setOnline(false);
  renderInApp(<Page />);
  await choose();
  expect(request).toHaveBeenCalledWith({ locale: 'en', version: learner.version });
  expect(screen.getByRole('radio', { name: 'Deutsch' }).getAttribute('aria-disabled')).not.toBe(
    'true',
  );
});
