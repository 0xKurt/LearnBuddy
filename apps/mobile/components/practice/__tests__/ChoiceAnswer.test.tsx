import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDrafts } from '../../../lib/drafts.js';
import { renderInApp } from '../../../testing/render.js';
import { ChoiceAnswer } from '../ChoiceAnswer.js';

const choices = ['Nenner', 'Zähler'];
const props = {
  draftKey: 'choice.answer.test',
  choices,
  tried: new Set<string>(),
  disabled: false,
};

beforeEach(async () => {
  await clearDrafts();
});

describe('a drafted single answer', () => {
  it('chooses without submitting and checks the current index and original text', () => {
    const check = vi.fn();
    renderInApp(<ChoiceAnswer {...props} onCheck={check} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Nenner' }));
    expect(check).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Zähler' }));
    expect(check).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(check).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledWith(1, 'Zähler');
  });

  it('restores its selection after a theme remount', () => {
    const check = vi.fn();
    const first = renderInApp(<ChoiceAnswer {...props} onCheck={check} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Zähler' }));
    first.unmount();
    renderInApp(<ChoiceAnswer {...props} onCheck={check} />);
    expect(screen.getByRole('radio', { name: 'Zähler' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(check).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledWith(1, 'Zähler');
  });

  it('cannot select or check while a request is busy', () => {
    const check = vi.fn();
    const app = renderInApp(<ChoiceAnswer {...props} onCheck={check} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Nenner' }));
    app.rerender(<ChoiceAnswer {...props} disabled onCheck={check} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Zähler' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(screen.getByRole('radio', { name: 'Nenner' }).getAttribute('aria-checked')).toBe('true');
    expect(check).not.toHaveBeenCalled();
  });

  it('rejects a restored choice that was just tried incorrectly', () => {
    const check = vi.fn();
    const first = renderInApp(<ChoiceAnswer {...props} onCheck={check} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Nenner' }));
    first.unmount();
    renderInApp(<ChoiceAnswer {...props} tried={new Set(['Nenner'])} onCheck={check} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(check).not.toHaveBeenCalled();
  });
});
