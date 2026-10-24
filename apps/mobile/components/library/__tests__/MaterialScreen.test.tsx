import type * as RouterModule from 'expo-router';
import type * as Endpoints from '../../../lib/api/learningEndpoints.js';
import { MaterialItemView, type MaterialItemsView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MaterialScreen from '../../../app/material/[id].js';
import { renderInApp } from '../../../testing/render.js';

const seam = vi.hoisted(() => ({
  data: undefined as MaterialItemsView | undefined,
  isError: false,
  refetch: vi.fn(),
  remove: vi.fn(),
  start: vi.fn(),
  attach: vi.fn(),
}));
vi.mock('expo-router', async (load) => ({
  ...(await load<typeof RouterModule>()),
  useLocalSearchParams: () => ({ id: ['m-1', 'ignored'] }),
}));
vi.mock('../../../lib/api/libraryQueries.js', () => ({
  useMaterialItems: () => ({
    data: seam.data,
    isError: seam.isError,
    isFetching: false,
    error: new Error('offline'),
    refetch: seam.refetch,
  }),
}));
vi.mock('../../../lib/api/learningEndpoints.js', async (load) => ({
  ...(await load<typeof Endpoints>()),
  deleteMaterialItem: seam.remove,
  startPractice: seam.start,
}));
vi.mock('../../../lib/capture/attachRequest.js', () => ({ attachInChat: seam.attach }));

const item = MaterialItemView.parse({
  id: '00000000-0000-4000-8000-000000000002',
  kind: 'numeric',
  prompt: 'Wie viel ist 3 + 4?',
  choices: null,
  unit: null,
  topic: null,
  origin: 'material',
  lang: null,
  prompt_lang: null,
  figure: null,
  image: null,
  task_part: null,
  result: 'never_asked',
});
const ready = (): MaterialItemsView => ({
  material: {
    id: 'm-1',
    title: 'Brüche',
    status: 'ready',
    failure_reason: null,
    photos_deleted: false,
    item_count: 1,
    speak_count: 0,
    subject_name: 'Mathe',
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
    created_at: '2026-10-02T09:00:00.000Z',
  },
  items: [item],
});
beforeEach(() => {
  seam.data = ready();
  seam.isError = false;
  seam.remove.mockReset().mockResolvedValue(undefined);
  // Never settles: the test is about the request, not about the practice screen after it.
  seam.start.mockReset().mockReturnValue(new Promise(() => undefined));
  seam.refetch.mockReset();
  seam.attach.mockReset();
});

describe('saved material screen', () => {
  it('carries the sheet in its head: its name, its subject and pages', () => {
    seam.data = { ...ready(), material: { ...ready().material, photo_count: 2 } };
    renderInApp(<MaterialScreen />);
    // ui_kits/app/Extra.jsx:111 — one heading, the sheet's own; no second title in the content.
    expect(screen.getAllByRole('heading', { name: 'Brüche' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Dein Material' })).toBeNull();
    expect(screen.getByText('Mathe · 2 Seiten')).toBeDefined();
    expect(screen.getByText(item.prompt)).toBeDefined();
  });

  it('starts practising this sheet from the button beside its pages', () => {
    renderInApp(<MaterialScreen />);
    fireEvent.click(screen.getByRole('button', { name: '„Brüche“ üben' }));
    expect(screen.getByText('Daraus üben')).toBeDefined();
    expect(seam.start).toHaveBeenCalledWith({ material_id: 'm-1', mode: 'practice' });
  });

  it('offers no practice while the sheet has nothing to practise', () => {
    seam.data = { ...ready(), items: [], material: { ...ready().material, item_count: 0 } };
    renderInApp(<MaterialScreen />);
    expect(screen.queryByText('Daraus üben')).toBeNull();
  });

  it('keeps deletion out of the card: ⋯, the row in its sheet, then one confirmation', async () => {
    renderInApp(<MaterialScreen />);
    expect(screen.queryByRole('button', { name: 'Aufgabe 1 löschen' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Aufgabe 1' }));
    expect(screen.getByRole('heading', { name: 'Aufgabe 1' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Aufgabe 1 löschen' }));
    expect(seam.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Aufgabe löschen?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Aufgabe löschen' }));
    await waitFor(() => expect(seam.remove).toHaveBeenCalledWith('m-1', item.id));
  });

  it('distinguishes reading and ready-but-deleted empty content', () => {
    seam.data = { ...ready(), items: [], material: { ...ready().material, status: 'processing' } };
    const { rerender } = renderInApp(<MaterialScreen />);
    expect(
      screen.getByText('Ich lese das Blatt gerade – gleich sind die Aufgaben da.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Seite hinzufügen' })).toBeNull();
    seam.data = { ...ready(), items: [] };
    rerender(<MaterialScreen />);
    expect(screen.getByText('Hier sind keine Aufgaben mehr')).toBeDefined();
    // The empty page's one action fills the sheet again, for this sheet (issue #519).
    fireEvent.click(screen.getByRole('button', { name: 'Seite hinzufügen' }));
    expect(seam.attach).toHaveBeenCalledWith({
      open: 'menu',
      link: { completes: 'm-1', purpose: 'study', add: true },
    });
  });
});
