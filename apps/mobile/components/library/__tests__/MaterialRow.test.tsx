import { MaterialView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { MaterialRow } from '../MaterialRow.js';

const material = MaterialView.parse({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Mein Blatt',
  status: 'ready',
  purpose: 'study',
  session_id: null,
  page_problems: [],
  photo_count: 1,
  merged_into: null,
  failure_reason: null,
  photos_deleted: false,
  item_count: 5,
  speak_count: 0,
  subject_name: null,
  goal_id: null,
  created_at: '2026-10-02T09:00:00.000Z',
});

describe('grouped material row', () => {
  it('keeps navigation and starting practice separate without nested buttons', () => {
    const open = vi.fn();
    const start = vi.fn();
    renderInApp(
      <MaterialRow
        material={material}
        busy={false}
        disabled={false}
        onOpen={open}
        onStart={start}
      />,
    );
    const action = screen.getByRole('button', { name: '„Mein Blatt“ üben' });
    expect(action.parentElement?.closest('[role="button"]')).toBeNull();
    fireEvent.click(action);
    expect(start).toHaveBeenCalledWith('practice');
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aufgaben aus „Mein Blatt“ ansehen' }));
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('keeps all-spoken and reading materials truthful', () => {
    const { rerender } = renderInApp(
      <MaterialRow
        material={{ ...material, speak_count: 5 }}
        busy={false}
        disabled={false}
        onOpen={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByText('Üben')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Die Sätze aus „Mein Blatt“ laut lesen' }),
    ).toBeTruthy();
    rerender(
      <MaterialRow
        material={{ ...material, status: 'processing' }}
        busy={false}
        disabled={false}
        onOpen={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByText('Üben')).toBeNull();
    expect(screen.getByText(/wird gelesen/)).toBeTruthy();
  });
  it('stands in its subject with the tone tile, the sheet sign and the day it came', () => {
    const { container } = renderInApp(
      <MaterialRow
        material={material}
        tone="sky"
        busy={false}
        disabled={false}
        onOpen={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText('2. Okt. · 5 Aufgaben')).toBeTruthy();
    // The sheet sign on its tile and the arrow in the pill (ui_kits/app/More.jsx:70).
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });
  it('is its name and what it holds among the newest sheets, ending in the arrow pill', () => {
    const { container } = renderInApp(
      <MaterialRow
        material={material}
        busy={false}
        disabled={false}
        onOpen={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    // No bare sign before the name and no day (ui_kits/app/Library.jsx:19,32).
    expect(screen.getByText('5 Aufgaben')).toBeTruthy();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    const pill = screen.getByRole('button', { name: '„Mein Blatt“ üben' });
    expect(pill.querySelector('svg')).not.toBeNull();
  });
  it('shows the chevron while there is nothing to start', () => {
    const { container } = renderInApp(
      <MaterialRow
        material={{ ...material, status: 'processing' }}
        busy={false}
        disabled={false}
        onOpen={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText('wird gelesen')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });
});
