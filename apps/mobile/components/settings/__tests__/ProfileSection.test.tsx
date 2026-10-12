// requires live verification in Claude Code session
import { LibraryView, LearnerView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as endpoints from '../../../lib/api/endpoints.js';
import { keys, queryClient } from '../../../lib/api/queries.js';
import * as locale from '../../../lib/i18n/index.js';
import { renderInApp } from '../../../testing/render.js';
import { ProfileSection } from '../ProfileSection.js';
import { ProfileLibrarySubjects } from '../../library/ProfileLibrarySubjects.js';
const subjectSlot = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../buddy/extensions.js', () => ({
  profileSubjects: { get: () => (subjectSlot.enabled ? ProfileLibrarySubjects : null) },
}));
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { useFolds } from '../folds.js';
import { router } from 'expo-router';
import { toast } from '../../lb/Toast.js';

const library = vi.hoisted(() => ({ data: undefined as LibraryView | undefined, reads: vi.fn() }));
vi.mock('../../../lib/api/libraryQueries.js', () => ({
  useLibrary: () => {
    library.reads();
    return { data: library.data, error: null, refetch: vi.fn() };
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
beforeEach(() => {
  subjectSlot.enabled = true;
  cacheLearner(learner);
  useFolds.setState({ open: null, blurredAt: 0 });
  library.data = { subjects: [], unsorted: [] };
  library.reads.mockClear();
});
function ThemeControl() {
  const { name, choose } = useTheme();
  return (
    <button
      data-testid="theme-control"
      data-theme={name}
      onClick={() => choose({ family: 'ocean' })}
    >
      Change theme
    </button>
  );
}
it('preserves the open profile editors across actual theme remount and explicit close', async () => {
  renderInApp(
    <>
      <ProfileSection learner={learner} />
      <ThemeControl />
    </>,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
  expect(screen.getByRole('button', { name: /Sprache, Deutsch/ })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Change theme' }));
  await waitFor(() =>
    expect(screen.getByTestId('theme-control').getAttribute('data-theme')).toMatch(/^ocean/),
  );
  expect(screen.getByRole('button', { name: /Sprache, Deutsch/ })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  await waitFor(() => expect(screen.queryByRole('radio', { name: 'English' })).toBeNull());
  expect(useFolds.getState().open).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
  expect(screen.getByRole('button', { name: /Sprache, Deutsch/ })).toBeDefined();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});
it('mounts subjects only while open and closes the sheet before actual subject navigation', async () => {
  const subjectId = '22222222-2222-4222-8222-222222222222';
  library.data = LibraryView.parse({
    subjects: [{ id: subjectId, name: 'Mathe', kind: 'math', topics: ['Brüche'], materials: [] }],
    unsorted: [],
  });
  const push = vi.spyOn(router, 'push').mockImplementation(() => {
    expect(useFolds.getState().open).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mathe:/ })).toBeNull();
  });
  renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  expect(library.reads).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
  expect(library.reads).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^Mathe:/ }));
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith({ pathname: '/subject/[id]', params: { id: subjectId } }),
  );
  expect(push).toHaveBeenCalledTimes(1);
});
afterEach(() => {
  vi.useRealTimers();
  queryClient.clear();
  vi.restoreAllMocks();
});
it('keeps latest-version PATCH, duplicate suppression and confirmed-only locale application in the Profile sheet', async () => {
  queryClient.setQueryData(
    keys.me,
    MeResponse.parse({
      account: null,
      learner: { ...learner, version: 7 },
      consent_version: 'v1',
      capabilities: { model: true, push: false },
    }),
  );
  let resolve!: (next: LearnerView) => void;
  const update = vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  expect(screen.queryByRole('radio', { name: 'English' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
  fireEvent.click(screen.getByRole('button', { name: /Sprache, Deutsch/ }));
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  expect(update).toHaveBeenCalledWith({ locale: 'en', version: 7 });
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: 'Français', hidden: true }));
  expect(update).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ...learner, locale: 'en', version: 8 }));
  await waitFor(() => expect(apply).toHaveBeenCalledWith('en'));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner?.version).toBe(8);
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  expect(screen.queryByRole('radio', { name: 'English' })).toBeNull();
  expect(screen.getByRole('button', { name: /Sprache, Deutsch/ })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
});

it('keeps the confirmed locale after a failed save and permits an explicit retry', async () => {
  const update = vi
    .spyOn(endpoints, 'updateLearner')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ...learner, locale: 'en', version: learner.version + 1 });
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
  fireEvent.click(screen.getByRole('button', { name: /Sprache, Deutsch/ }));
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'Deutsch' }).getAttribute('aria-checked')).toBe(
      'true',
    ),
  );
  expect(apply).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByText("Da ist was schiefgegangen. Versuch's gleich nochmal.")).toBeDefined(),
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  await waitFor(() => expect(apply).toHaveBeenCalledWith('en'));
  expect(update).toHaveBeenCalledTimes(2);
});

it.each(['unmount', 'identity'] as const)(
  'cancels a pending subject handoff on %s',
  async (change) => {
    const subjectId = '22222222-2222-4222-8222-222222222222';
    library.data = LibraryView.parse({
      subjects: [{ id: subjectId, name: 'Mathe', kind: 'math', topics: ['Brüche'], materials: [] }],
      unsorted: [],
    });
    const push = vi.spyOn(router, 'push').mockImplementation(() => undefined);
    const view = renderInApp(<ProfileSection learner={learner} />);
    await act(async () => {});
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
    fireEvent.click(screen.getByRole('button', { name: /^Mathe:/ }));
    expect(useFolds.getState().open).toBeNull();
    expect(push).not.toHaveBeenCalled();
    if (change === 'unmount') view.unmount();
    else
      view.rerender(
        <ProfileSection learner={{ ...learner, id: '33333333-3333-4333-8333-333333333333' }} />,
      );
    act(() => vi.runAllTimers());
    expect(push).not.toHaveBeenCalled();
  },
);

it('allows only one exact subject handoff while a close delay is pending', async () => {
  const subjectId = '22222222-2222-4222-8222-222222222222';
  library.data = LibraryView.parse({
    subjects: [{ id: subjectId, name: 'Mathe', kind: 'math', topics: ['Brüche'], materials: [] }],
    unsorted: [],
  });
  const push = vi.spyOn(router, 'push').mockImplementation(() => undefined);
  renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  vi.useFakeTimers();
  for (let tap = 0; tap < 2; tap++) {
    fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
    fireEvent.click(screen.getByRole('button', { name: /^Mathe:/ }));
  }
  act(() => vi.runAllTimers());
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith({ pathname: '/subject/[id]', params: { id: subjectId } });
});

function cacheLearner(next: LearnerView) {
  queryClient.setQueryData(
    keys.me,
    MeResponse.parse({
      account: null,
      learner: next,
      consent_version: 'v1',
      capabilities: { model: true, push: false },
    }),
  );
}

function openLanguage() {
  fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
  fireEvent.click(screen.getByRole('button', { name: /Sprache, Deutsch/ }));
}

function closeLanguage() {
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
}

it('rejects an older same-learner save response and locale after a newer confirmed cache view', async () => {
  cacheLearner({ ...learner, version: 7 });
  let resolve!: (next: LearnerView) => void;
  vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  openLanguage();
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  closeLanguage();
  // A later completed shared save/refetch has already supplied the authoritative view.
  cacheLearner({ ...learner, locale: 'fr', version: 9 });
  await act(async () => resolve({ ...learner, locale: 'en', version: 8 }));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner).toMatchObject({
    id: learner.id,
    locale: 'fr',
    version: 9,
  });
  expect(apply).not.toHaveBeenCalled();
});

it('preserves a replacement learner cache when the previous learner save completes', async () => {
  cacheLearner(learner);
  let resolve!: (next: LearnerView) => void;
  vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  const view = renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  openLanguage();
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  const replacement = { ...learner, id: '33333333-3333-4333-8333-333333333333', version: 1 };
  cacheLearner(replacement);
  view.rerender(<ProfileSection learner={replacement} />);
  await act(async () => resolve({ ...learner, locale: 'en', version: 3 }));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner).toMatchObject(replacement);
  expect(apply).not.toHaveBeenCalled();
});

it('keeps a reopened editor free of the previous save failure while retaining its duplicate lock', async () => {
  cacheLearner(learner);
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  let reject!: (error: Error) => void;
  const update = vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((_done, fail) => {
        reject = fail;
      }),
  );
  renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  openLanguage();
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  closeLanguage();
  openLanguage();
  fireEvent.click(screen.getByRole('radio', { name: 'Français', hidden: true }));
  expect(update).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('offline')));
  expect(screen.queryByText("Da ist was schiefgegangen. Versuch's gleich nochmal.")).toBeNull();
  const retry = screen.getByRole('radio', { name: 'English' });
  expect(retry.getAttribute('aria-disabled')).not.toBe('true');
  update.mockResolvedValueOnce({ ...learner, locale: 'en', version: 3 });
  fireEvent.click(retry);
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner?.locale).toBe('en');
  expect(apply).toHaveBeenCalledWith('en');
});

it('accepts a valid same-learner confirmed save after close when no newer view supersedes it', async () => {
  cacheLearner(learner);
  let resolve!: (next: LearnerView) => void;
  vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  openLanguage();
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  closeLanguage();
  await act(async () => resolve({ ...learner, locale: 'en', version: 3 }));
  expect(queryClient.getQueryData<MeResponse>(keys.me)?.learner).toMatchObject({
    id: learner.id,
    locale: 'en',
    version: 3,
  });
  expect(apply).toHaveBeenCalledWith('en');
});

it('does not apply a delayed save or success feedback after the authoritative cache is cleared', async () => {
  let resolve!: (next: LearnerView) => void;
  vi.spyOn(endpoints, 'updateLearner').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const apply = vi.spyOn(locale, 'applyLocale').mockImplementation(() => undefined);
  const show = vi.spyOn(toast, 'show').mockImplementation(() => undefined);
  renderInApp(<ProfileSection learner={learner} />);
  await act(async () => {});
  openLanguage();
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  queryClient.clear();
  await act(async () => resolve({ ...learner, locale: 'en', version: 3 }));
  expect(queryClient.getQueryData(keys.me)).toBeUndefined();
  expect(apply).not.toHaveBeenCalled();
  expect(show).not.toHaveBeenCalled();
});

it.each(['cleared', 'replacement'] as const)(
  'does not start a profile save from a %s learner cache',
  async (state) => {
    const update = vi.spyOn(endpoints, 'updateLearner');
    renderInApp(<ProfileSection learner={learner} />);
    await act(async () => {});
    openLanguage();
    if (state === 'cleared') queryClient.clear();
    else cacheLearner({ ...learner, id: '33333333-3333-4333-8333-333333333333', version: 9 });
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(update).not.toHaveBeenCalled();
  },
);

it('keeps the factual editor usable when the learning subject slot is empty', async () => {
  subjectSlot.enabled = false;
  renderInApp(<ProfileSection learner={learner} />);
  fireEvent.click(screen.getByRole('button', { name: 'Dein Profil, Mia' }));
  expect(screen.getByRole('button', { name: /Sprache, Deutsch/ })).toBeTruthy();
  expect(library.reads).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
