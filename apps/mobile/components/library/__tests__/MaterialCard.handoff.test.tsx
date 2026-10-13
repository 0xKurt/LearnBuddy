// requires live verification in Claude Code session
import { MaterialView } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderInApp } from '../../../testing/render.js';
import { MaterialCard } from '../MaterialCard.js';

vi.mock('../../lb/Sheet.js', () => ({
  Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? <div role="dialog">{children}</div> : null,
}));
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
function mounted() {
  const callbacks = {
    onPractice: vi.fn(),
    onSpeak: vi.fn(),
    onOpen: vi.fn(),
    onRetry: vi.fn(),
    onDelete: vi.fn(),
  };
  const props = { material, tone: 'sky' as const, busy: false, disabled: false, ...callbacks };
  const view = renderInApp(<MaterialCard {...props} />);
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Mein Blatt' }));
  const choose = () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Fragen ansehen' }));
  };
  return { ...view, callbacks, props, open, choose };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const flush = () =>
  act(() => {
    vi.runOnlyPendingTimers();
  });
describe('material Sheet handoff lifetime', () => {
  it('cancels the queued action when its row unmounts', () => {
    const row = mounted();
    row.choose();
    row.unmount();
    flush();
    expect(row.callbacks.onOpen).not.toHaveBeenCalled();
  });
  it('cancels the old identity and closes a recycled chooser', () => {
    const row = mounted();
    row.choose();
    row.open();
    row.rerender(
      <MaterialCard
        {...row.props}
        material={{ ...material, id: '22222222-2222-4222-8222-222222222222' }}
      />,
    );
    flush();
    expect(row.callbacks.onOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('rejects dispatch if the current material becomes disabled', () => {
    const row = mounted();
    row.choose();
    row.rerender(<MaterialCard {...row.props} disabled />);
    flush();
    expect(row.callbacks.onOpen).not.toHaveBeenCalled();
  });
  it('keeps a pending chooser closed and queues only one action', () => {
    const row = mounted();
    row.choose();
    row.open();
    expect(screen.queryByRole('dialog')).toBeNull();
    const second = screen.queryByRole('button', { name: 'Fragen ansehen' });
    if (second) fireEvent.click(second);
    flush();
    expect(row.callbacks.onOpen).toHaveBeenCalledTimes(1);
  });
  it('blocks the separate primary action while a handoff is pending', () => {
    const row = mounted();
    row.choose();
    fireEvent.click(screen.getByRole('button', { name: '„Mein Blatt“ üben' }));
    flush();
    expect(row.callbacks.onPractice).not.toHaveBeenCalled();
    expect(row.callbacks.onOpen).toHaveBeenCalledTimes(1);
  });
  it('closes an unselected chooser when its identity changes', () => {
    const row = mounted();
    row.open();
    row.rerender(
      <MaterialCard
        {...row.props}
        material={{ ...material, id: '22222222-2222-4222-8222-222222222222' }}
      />,
    );
    flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(row.callbacks.onOpen).not.toHaveBeenCalled();
  });
  it('uses the current allowed callback exactly once after the handoff', () => {
    const row = mounted();
    row.choose();
    const current = vi.fn();
    expect(row.callbacks.onOpen).not.toHaveBeenCalled();
    row.rerender(<MaterialCard {...row.props} onOpen={current} />);
    flush();
    expect(row.callbacks.onOpen).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });
  it('retains ordinary primary start and permits another action after settlement', () => {
    const row = mounted();
    fireEvent.click(screen.getByRole('button', { name: '„Mein Blatt“ üben' }));
    expect(row.callbacks.onPractice).toHaveBeenCalledTimes(1);
    row.choose();
    flush();
    row.choose();
    flush();
    expect(row.callbacks.onOpen).toHaveBeenCalledTimes(2);
  });
});
