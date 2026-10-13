import type { SubjectExercise } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { ExerciseCard } from '../ExerciseCard.js';
const exercise: SubjectExercise = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Meine Übung',
  status: 'active',
  started_at: '2026-10-01T10:00:00.000Z',
};

describe('grouped exercise row', () => {
  it('keeps the real open state and navigation without showing a fabricated result', () => {
    const open = vi.fn();
    const { rerender, container } = renderInApp(
      <ExerciseCard exercise={exercise} onPress={open} />,
    );
    expect(screen.getByText(/noch offen/)).toBeTruthy();
    // No sign before its name — only the chevron at the end (ui_kits/app/More.jsx:74).
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: exercise.title! }));
    expect(open).toHaveBeenCalledTimes(1);
    rerender(<ExerciseCard exercise={{ ...exercise, status: 'finished' }} onPress={open} />);
    expect(screen.queryByText(/noch offen/)).toBeNull();
    expect(screen.queryByText(/richtig|Punkte/)).toBeNull();
  });
});
