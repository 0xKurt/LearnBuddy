import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { Row } from '../ListGroup.js';

describe('action row chevron', () => {
  it('keeps the default navigation cue and callback', () => {
    const press = vi.fn();
    const { container } = renderInApp(<Row title="Material" onPress={press} />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Material' }));
    expect(press).toHaveBeenCalledTimes(1);
  });
  it('omits the cue for direct actions without removing the accessible action', () => {
    const press = vi.fn();
    const { container } = renderInApp(<Row title="Üben" chevron={false} onPress={press} />);
    expect(container.querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Üben' }));
    expect(press).toHaveBeenCalledTimes(1);
  });
});
