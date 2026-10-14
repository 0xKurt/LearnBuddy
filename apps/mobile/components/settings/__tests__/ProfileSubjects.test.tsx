// requires live verification in Claude Code session
import { LibraryView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { ProfileLibrarySubjects as ProfileSubjects } from '../../library/ProfileLibrarySubjects.js';
const state = vi.hoisted(() => ({
  data: undefined as LibraryView | undefined,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock('../../../lib/api/libraryQueries.js', () => ({ useLibrary: () => state }));
afterEach(() => {
  state.data = undefined;
  state.error = null;
  state.refetch.mockReset();
});
it('opens only actual nonempty subjects and never invents enrolment or workload', () => {
  state.data = LibraryView.parse({
    subjects: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Mathe',
        kind: 'math',
        materials: [],
        topics: ['Brüche'],
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Chemie',
        kind: 'chemistry',
        materials: [],
        topics: ['Atome'],
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Biologie',
        kind: 'biology',
        materials: [],
        topics: [],
      },
    ],
    unsorted: [],
  });
  const open = vi.fn();
  renderInApp(<ProfileSubjects onOpenSubject={open} />);
  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    expect.stringContaining('Chemie'),
    expect.stringContaining('Mathe'),
  ]);
  fireEvent.click(screen.getByRole('button', { name: /Mathe/ }));
  expect(open).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  expect(screen.queryByText('Biologie')).toBeNull();
  expect(document.body.textContent).not.toMatch(/Aufgaben offen|Gymnasium/);
});
it('keeps failed-query retry and factual empty recovery', () => {
  const { rerender } = renderInApp(<ProfileSubjects onOpenSubject={vi.fn()} />);
  expect(screen.getByRole('progressbar')).toBeTruthy();
  state.error = new Error('network');
  rerender(<ProfileSubjects onOpenSubject={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
  expect(state.refetch).toHaveBeenCalledTimes(1);
  state.error = null;
  state.data = { subjects: [], unsorted: [] };
  rerender(<ProfileSubjects onOpenSubject={vi.fn()} />);
  expect(screen.getByText('Noch keine Fächer mit Material.')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  // In a row's box, not a strip with its text at the card's edge (#599, set-profile-360).
  const box = screen.getByText('Noch keine Fächer mit Material.').parentElement!;
  expect(box.style.paddingLeft).toBe('16px');
  expect(box.style.minHeight).toBe('56px');
});
