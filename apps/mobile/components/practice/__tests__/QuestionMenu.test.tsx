import { fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { QuestionMenu } from '../QuestionProgress.js';

vi.mock('../DisputeVerdict.js', () => ({ canDisputeVerdict: () => false }));
vi.mock('../../lb/Sheet.js', () => ({
  Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? <div role="dialog">{children}</div> : null,
}));

const session = { status: 'active', mode: 'practice' } as ComponentProps<
  typeof QuestionMenu
>['session'];
const item = { origin: 'generated', kind: 'short' } as unknown as ComponentProps<
  typeof QuestionMenu
>['item'];

function menu(flaggable = true, disabled = false) {
  const onCorner = vi.fn();
  renderInApp(
    <QuestionMenu
      session={session}
      item={item}
      open
      testing={false}
      flaggable={flaggable}
      disabled={disabled}
      onCorner={onCorner}
    />,
  );
  return onCorner;
}

describe('question action in the header menu', () => {
  it('opens the menu before dispatching the unchanged flag confirmation callback', () => {
    const onCorner = menu();
    expect(screen.queryByText('Passt nicht')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Frage passt nicht' }));
    expect(onCorner).toHaveBeenCalledTimes(1);
    expect(onCorner).toHaveBeenCalledWith('flag');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers no dead menu when no question action is available', () => {
    menu(false);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('cannot open while the existing locked state disables the action', () => {
    menu(true, true);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
