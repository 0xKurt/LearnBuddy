// requires live verification in Claude Code session
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { WorkPhotoNote } from '../../practice/WorkPhotoNote.js';
import { PhotoCheckCard } from '../PhotoCheckCard.js';

describe('the shared real photo-quality decisions', () => {
  it('delegates a checked work photo to its existing take and keep handlers', () => {
    const take = vi.fn();
    const keep = vi.fn();
    const done = vi.fn();
    renderInApp(
      <WorkPhotoNote
        photo={{
          state: { step: 'checking', problems: ['blurry'], base64: 'YQ==' },
          take,
          pick: vi.fn(),
          keep,
          done,
        }}
        value=""
      />,
    );
    expect(screen.getByText('Foto 1 ist unscharf.', { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Neu fotografieren' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trotzdem behalten' }));
    expect(take).toHaveBeenCalledTimes(1);
    expect(keep).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
  });

  it('keeps both quality decisions inactive while the existing caller is busy', () => {
    const retake = vi.fn();
    const keep = vi.fn();
    renderInApp(
      <PhotoCheckCard index={2} problems={['blurry']} disabled onRetake={retake} onKeep={keep} />,
    );
    expect(screen.getByText('Foto 2 ist unscharf.', { exact: true })).toBeTruthy();
    const retakeButton = screen.getByRole('button', { name: 'Neu fotografieren' });
    const keepButton = screen.getByRole('button', { name: 'Trotzdem behalten' });
    expect(retakeButton.getAttribute('aria-disabled')).toBe('true');
    expect(keepButton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(retakeButton);
    fireEvent.click(keepButton);
    expect(retake).not.toHaveBeenCalled();
    expect(keep).not.toHaveBeenCalled();
  });
});
