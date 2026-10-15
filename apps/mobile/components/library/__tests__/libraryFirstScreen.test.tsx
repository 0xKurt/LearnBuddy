// "Dein Material" draws what fits the first screen with its first frame, the rest in the frame
// after (#714, Codex audit #4, #637). The page mounted up to 200 sheet rows at once, each with its
// icon, title, line and action, before she saw anything; she can reach row nine only by scrolling.
// Once the next frame came, every row is there — nothing looks different.

import type { LibraryView, MaterialView } from '@learnbuddy/shared-types/contracts';
import { act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import LibraryScreen from '../../../app/library.js';
import { LIBRARY } from '../../../lib/theme/library.js';
import { renderInApp } from '../../../testing/render.js';

const seam = vi.hoisted(() => ({ rows: 0, view: null as LibraryView | null }));

vi.mock('../../../lib/api/libraryQueries.js', () => ({
  useLibrary: () => ({
    data: seam.view ?? undefined,
    isError: false,
    isFetching: false,
    error: null,
    refetch: () => Promise.resolve(),
  }),
}));
vi.mock('../MaterialRow.js', () => ({
  MaterialRow: ({ material }: { material: MaterialView }) => {
    seam.rows += 1;
    return <div data-testid="sheet-row">{material.title}</div>;
  },
}));

afterEach(() => vi.unstubAllGlobals());

function sheet(i: number): MaterialView {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Blatt ${i}`,
    status: 'ready',
    failure_reason: null,
    photos_deleted: false,
    item_count: 3,
    speak_count: 0,
    subject_name: null,
    goal_id: null,
    purpose: 'study',
    source: 'sheet',
    session_id: null,
    session_status: null,
    page_problems: [],
    items_incomplete: false,
    not_practicable: [],
    photo_count: 1,
    merged_into: null,
    created_at: new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString(),
  } as MaterialView;
}

it('mounts the first screen of 200 sheets with the first frame, every sheet in the next', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  seam.view = { subjects: [], unsorted: Array.from({ length: 200 }, (_, i) => sheet(i)) };
  seam.rows = 0;
  const screen = renderInApp(<LibraryScreen />);
  expect(seam.rows).toBe(LIBRARY.firstRows);
  // The next frame: every callback asked for so far runs once.
  act(() => frames.splice(0).forEach((f) => f(16)));
  expect(screen.getAllByTestId('sheet-row')).toHaveLength(200);
  // The newest first, in both frames.
  expect(screen.getAllByTestId('sheet-row')[0]!.textContent).toBe('Blatt 199');
});
