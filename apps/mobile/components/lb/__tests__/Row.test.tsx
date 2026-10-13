import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UI } from '../../../lib/theme/components.js';
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

// A long value used to take the row and leave the title a letter per line (Profile in English:
// "Federal state" 6 pt wide over twelve lines, #599).
describe('a row with a value', () => {
  const column = (title: string) => screen.getByText(title).parentElement as HTMLElement;

  it('keeps the title at its own width, up to its share, and lets the value give way', () => {
    renderInApp(<Row title="Federal state" value="Mecklenburg-Western Pomerania" />);
    const title = column('Federal state').style;
    expect(title.flexShrink).toBe('0');
    expect(title.flexBasis).toBe('auto');
    expect(title.maxWidth).toBe(UI.list.titleShare);
    const value = screen.getByText('Mecklenburg-Western Pomerania').style;
    expect(value.flexShrink).toBe('1');
    expect(value.textAlign).toBe('right');
  });

  // The title must not take the room it does not fill: with it growing, a short value stood
  // short of the row's edge (Profile "Name" ~44 pt at 360, About "Version" ~78 pt at 390).
  it('gives the rest of the row to the value, so a short one ends at the edge', () => {
    renderInApp(<Row title="Version" value="1.4.0" />);
    expect(column('Version').style.flexGrow).toBe('0');
    const value = screen.getByText('1.4.0').style;
    expect([value.flexGrow, value.flexShrink, value.textAlign]).toEqual(['1', '1', 'right']);
  });

  it('leaves a row without one as it was: the title takes the room and wraps in it', () => {
    renderInApp(<Row title="Ein sehr langer Titel, der umbrechen darf" />);
    const title = column('Ein sehr langer Titel, der umbrechen darf').style;
    expect(title.flexShrink).toBe('1');
    expect(title.minWidth).toBe('0px');
    expect(title.maxWidth).toBe('');
  });
});
