import type { Modal } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { MoreProvider, MoreHost } from '../../navigation/MoreProvider.js';
import { QuestionMenu } from '../QuestionProgress.js';

// requires live verification in Claude Code session — eligibility seam; actual route flow is verified in browser.
vi.mock('../DisputeVerdict.js', () => ({ canDisputeVerdict: () => false }));

const host = vi.hoisted(() => ({ hold: false, dismissals: [] as (() => void)[] }));
// Public native Modal dismissal boundary; the browser separately verifies the real web host.
vi.mock('react-native', async (load) => {
  const actual = await load<{ Modal: typeof Modal }>();
  return {
    ...actual,
    Modal: (props: ComponentProps<typeof actual.Modal>) => (
      <actual.Modal
        {...props}
        onDismiss={() => {
          if (host.hold && props.onDismiss) host.dismissals.push(props.onDismiss);
          else props.onDismiss?.();
        }}
      />
    ),
  };
});

const session = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  mode: 'practice',
} as ComponentProps<typeof QuestionMenu>['session'];
const item = {
  id: '22222222-2222-4222-8222-222222222222',
  origin: 'generated',
  kind: 'short',
} as unknown as ComponentProps<typeof QuestionMenu>['item'];

function menu(flaggable = true, disabled = false) {
  const onCorner = vi.fn();
  renderInApp(
    <MoreProvider>
      <QuestionMenu
        session={session}
        item={item}
        open
        testing={false}
        flaggable={flaggable}
        disabled={disabled}
        onCorner={onCorner}
      />
      <MoreHost />
    </MoreProvider>,
  );
  return onCorner;
}

describe('question action in the header menu', () => {
  it('opens one destination menu before dispatching the unchanged flag confirmation callback', async () => {
    const onCorner = menu();
    expect(screen.queryByText('Passt nicht')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mehr' }));
    fireEvent.click(screen.getByRole('button', { name: 'Frage passt nicht' }));
    await vi.waitFor(() => expect(onCorner).toHaveBeenCalledTimes(1));
    expect(onCorner).toHaveBeenCalledWith('flag');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('retains the six destinations without an ineligible question action', () => {
    menu(false);
    fireEvent.click(screen.getByRole('button', { name: 'Mehr' }));
    expect(screen.getByRole('button', { name: 'Profil' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Frage passt nicht' })).toBeNull();
  });

  it('retains the existing header lock while the question action is busy', () => {
    menu(true, true);
    fireEvent.click(screen.getByRole('button', { name: 'Mehr' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

it('revokes the actual selected question action when its item changes before native dismissal', async () => {
  host.hold = true;
  host.dismissals = [];
  const onCorner = vi.fn();
  const content = (currentItem: typeof item) => (
    <MoreProvider>
      <QuestionMenu
        session={session}
        item={currentItem}
        open
        testing={false}
        flaggable
        disabled={false}
        onCorner={onCorner}
      />
      <MoreHost />
    </MoreProvider>
  );
  const view = renderInApp(content(item));
  fireEvent.click(screen.getByRole('button', { name: 'Mehr' }));
  fireEvent.click(screen.getByRole('button', { name: 'Frage passt nicht' }));
  await vi.waitFor(() => expect(host.dismissals).toHaveLength(1));
  expect(onCorner).not.toHaveBeenCalled();
  view.rerender(content({ ...item, id: '33333333-3333-4333-8333-333333333333' }));
  act(() => {
    for (const done of host.dismissals) done();
  });
  expect(onCorner).not.toHaveBeenCalled();
  host.hold = false;
});

it('keeps the foreground same-item menu when an older stacked adapter unmounts', async () => {
  const older = vi.fn();
  const foreground = vi.fn();
  const adapter = (onCorner: typeof foreground) => (
    <QuestionMenu
      session={session}
      item={item}
      open
      testing={false}
      flaggable
      disabled={false}
      onCorner={onCorner}
    />
  );
  const content = (oldMounted: boolean) => (
    <MoreProvider>
      {oldMounted ? (
        <div key="old" data-testid="older">
          {adapter(older)}
        </div>
      ) : null}
      <div key="current" data-testid="foreground">
        {adapter(foreground)}
      </div>
      <MoreHost />
    </MoreProvider>
  );
  const view = renderInApp(content(true));
  fireEvent.click(within(screen.getByTestId('foreground')).getByRole('button', { name: 'Mehr' }));
  view.rerender(content(false));
  fireEvent.click(screen.getByRole('button', { name: 'Frage passt nicht' }));
  await vi.waitFor(() => expect(foreground).toHaveBeenCalledTimes(1));
  expect(foreground).toHaveBeenCalledWith('flag');
  expect(older).not.toHaveBeenCalled();
});
