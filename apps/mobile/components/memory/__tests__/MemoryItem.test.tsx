// requires live verification in Claude Code session
import { MemoryView } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { MemoryItem } from '../MemoryItem.js';

const memory = MemoryView.parse({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'preference',
  statement: 'Möchte kurze Übungen',
  quote: 'bitte kürzer',
  source: 'learner_stated',
  valid_until: null,
  version: 1,
  created_at: '2026-10-01T10:00:00.000Z',
});
const props = () => ({
  memory,
  temporary: false,
  editing: false,
  draft: '',
  saving: false,
  locked: false,
  onDraft: vi.fn(),
  onEdit: vi.fn(),
  onCancel: vi.fn(),
  onSave: vi.fn(),
  onRemove: vi.fn(),
  onInputFocus: vi.fn(),
});

describe('grouped memory entry', () => {
  it.each(['edit', 'remove'] as const)(
    'keeps provenance and dispatches the %s sheet action',
    async (action) => {
      const on = props();
      renderInApp(<MemoryItem {...on} />);
      expect(screen.getByText('Du hast gesagt: „bitte kürzer“')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Möchte kurze Übungen/ }));
      fireEvent.click(
        screen.getByRole('button', {
          name: `${action === 'edit' ? 'Ändern' : 'Entfernen'}: Möchte kurze Übungen`,
        }),
      );
      const chosen = action === 'edit' ? on.onEdit : on.onRemove;
      const other = action === 'edit' ? on.onRemove : on.onEdit;
      await waitFor(() => expect(chosen).toHaveBeenCalledTimes(1));
      expect(other).not.toHaveBeenCalled();
    },
  );
  it('names its sheet by the thing itself, with two actions and no chevrons', () => {
    renderInApp(<MemoryItem {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Möchte kurze Übungen/ }));
    // ui_kits/app/More.jsx:39–44: the title is the item, not "Ändern" over a repeated statement.
    expect(screen.getByRole('heading', { name: 'Möchte kurze Übungen' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Ändern' })).toBeNull();
    for (const name of ['Ändern: Möchte kurze Übungen', 'Entfernen: Möchte kurze Übungen'])
      expect(screen.getByRole('button', { name }).querySelectorAll('svg')).toHaveLength(1);
  });
  it('edits in the shared sheet, with Save outside the scrolling form', () => {
    renderInApp(<MemoryItem {...props()} editing draft="Andere Übungen" />);
    expect(screen.getByRole('heading', { name: 'Was Buddy sich merken soll' })).toBeTruthy();
    const field = screen.getByRole('textbox', { name: 'Was Buddy sich merken soll' });
    const form = field.closest('[data-testid="scroll-form"]');
    expect(form).not.toBeNull();
    expect(form!.contains(screen.getByRole('button', { name: 'Speichern' }))).toBe(false);
  });
  it('retains the existing dirty/trimmed save guard and saving lock', () => {
    const on = props();
    const { rerender } = renderInApp(<MemoryItem {...on} editing draft="   " />);
    expect(screen.getByRole('button', { name: 'Speichern' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    rerender(<MemoryItem {...on} editing draft="Andere Übungen" />);
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(on.onSave).toHaveBeenCalledTimes(1);
    rerender(<MemoryItem {...on} editing draft="Andere Übungen" saving />);
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(on.onSave).toHaveBeenCalledTimes(1);
  });
});

describe('delayed memory sheet handoff lifetime', () => {
  it('closes an open chooser when FlashList replaces the memory identity', () => {
    const on = props();
    const view = renderInApp(<MemoryItem {...on} />);
    fireEvent.click(screen.getByRole('button', { name: /Möchte kurze Übungen/ }));
    expect(screen.getByRole('button', { name: 'Ändern: Möchte kurze Übungen' })).toBeTruthy();
    view.rerender(
      <MemoryItem {...on} memory={{ ...memory, id: '22222222-2222-4222-8222-222222222222' }} />,
    );
    expect(screen.queryByRole('button', { name: 'Ändern: Möchte kurze Übungen' })).toBeNull();
    expect(on.onEdit).not.toHaveBeenCalled();
  });
  it.each(['unmount', 'replacement', 'locked'] as const)(
    'does not dispatch a queued action after %s',
    (change) => {
      vi.useFakeTimers();
      try {
        const on = props();
        const view = renderInApp(<MemoryItem {...on} />);
        fireEvent.click(screen.getByRole('button', { name: /Möchte kurze Übungen/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Ändern: Möchte kurze Übungen' }));
        if (change === 'unmount') view.unmount();
        else
          view.rerender(
            <MemoryItem
              {...on}
              locked={change === 'locked'}
              memory={
                change === 'replacement'
                  ? { ...memory, id: '22222222-2222-4222-8222-222222222222' }
                  : memory
              }
            />,
          );
        act(() => vi.runAllTimers());
        expect(on.onEdit).not.toHaveBeenCalled();
        expect(on.onRemove).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('keeps only the first selection while its sheet handoff is pending', () => {
    vi.useFakeTimers();
    try {
      const on = props();
      renderInApp(<MemoryItem {...on} />);
      fireEvent.click(screen.getByRole('button', { name: /Möchte kurze Übungen/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Ändern: Möchte kurze Übungen' }));
      fireEvent.click(screen.getByRole('button', { name: /Möchte kurze Übungen/ }));
      expect(screen.queryByRole('button', { name: 'Entfernen: Möchte kurze Übungen' })).toBeNull();
      act(() => vi.runAllTimers());
      expect(on.onEdit).toHaveBeenCalledTimes(1);
      expect(on.onRemove).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
