import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { Option } from '../Option.js';

describe('Option', () => {
  it('announces selection independently of submitting an answer', () => {
    const choose = vi.fn();
    renderInApp(
      <Option letter="B" state="selected" checked accessibilityLabel="Große Terz" onPress={choose}>
        Große Terz
      </Option>,
    );
    const option = screen.getByRole('radio', { name: 'Große Terz' });
    expect(option.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(option);
    expect(choose).toHaveBeenCalledOnce();
  });

  it.each([{ disabled: true }, { readOnly: true }, { state: 'dim' as const }])(
    'blocks choosing in a locked state: %j',
    (lock) => {
      const choose = vi.fn();
      renderInApp(
        <Option {...lock} accessibilityLabel="A" onPress={choose}>
          A
        </Option>,
      );
      const option = screen.getByRole('radio', { name: 'A' });
      expect(option.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(option);
      expect(choose).not.toHaveBeenCalled();
    },
  );

  it('supports checkbox semantics for independent selections', () => {
    renderInApp(
      <Option radio={false} checked accessibilityLabel="Zwei" onPress={() => undefined}>
        Zwei
      </Option>,
    );
    expect(screen.getByRole('checkbox', { name: 'Zwei' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });
});
