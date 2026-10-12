import type * as RouterModule from 'expo-router';
import type * as Endpoints from '../../../lib/api/endpoints.js';
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
vi.mock('../../../lib/api/endpoints.js', async (load) => ({
  ...(await load<typeof Endpoints>()),
  deleteMaterialItem: seam.remove,
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
  seam.refetch.mockReset();
  seam.attach.mockReset();
});

describe('saved material screen', () => {
  it('shows its real heading, saved question and add-page target payload', () => {
    renderInApp(<MaterialScreen />);
    expect(screen.getByRole('heading', { name: 'Brüche' })).toBeDefined();
    expect(screen.getByText('Mathe · 1 Aufgabe')).toBeDefined();
    expect(screen.getByText(item.prompt)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Seite hinzufügen' }));
    expect(seam.attach).toHaveBeenCalledWith({
      open: 'menu',
      link: { completes: 'm-1', purpose: 'study', add: true },
    });
  });

  it('keeps deletion explicit and confirmed with the original material/item IDs', async () => {
    renderInApp(<MaterialScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Frage 1 löschen' }));
    expect(seam.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Frage löschen?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(seam.remove).toHaveBeenCalledWith('m-1', item.id));
  });

  it('distinguishes reading and ready-but-deleted empty content', () => {
    seam.data = { ...ready(), items: [], material: { ...ready().material, status: 'processing' } };
    const { rerender } = renderInApp(<MaterialScreen />);
    expect(
      screen.getByText('Ich lese das Blatt gerade – gleich sind die Fragen da.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Seite hinzufügen' })).toBeNull();
    seam.data = { ...ready(), items: [] };
    rerender(<MaterialScreen />);
    expect(screen.getByText('Hier sind keine Fragen mehr')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Seite hinzufügen' })).toBeDefined();
  });
});
