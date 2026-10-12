// requires live verification in Claude Code session — dismissal/router/session events are outside-world seams.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { MoreHost, MoreProvider, useMore } from '../MoreProvider.js';
import { useState, type ComponentProps } from 'react';
import { useSheetHandoff } from '../useSheetHandoff.js';
import type { MenuSheet } from '../../buddy/MenuSheet.js';
const outside = vi.hoisted(() => ({
  pathname: '/',
  owner: 'first',
  change: null as null | ((s: { user_id: string } | null) => void),
  menu: null as ComponentProps<typeof MenuSheet> | null,
  push: vi.fn(),
}));
vi.mock('expo-router', () => ({
  usePathname: () => outside.pathname,
  router: { push: outside.push },
}));
vi.mock('../../../lib/auth/session.js', () => ({
  currentSession: () => ({ user_id: outside.owner }),
  onSessionChange: (listener: typeof outside.change) => {
    outside.change = listener;
    return () => {
      outside.change = null;
    };
  },
}));
vi.mock('../../buddy/MenuSheet.js', () => ({
  MenuSheet: (props: ComponentProps<typeof MenuSheet>) => {
    outside.menu = props;
    return null;
  },
}));
function Open() {
  const menu = useMore();
  return <button onClick={() => menu?.open()}>Open</button>;
}
function App() {
  return (
    <MoreProvider>
      <Open />
      <MoreHost />
    </MoreProvider>
  );
}
beforeEach(() => {
  outside.pathname = '/';
  outside.owner = 'first';
  outside.menu = null;
  outside.push.mockClear();
});
it('waits for actual close, locks repeat taps and dispatches exactly one selected destination', () => {
  renderInApp(<App />);
  fireEvent.click(screen.getByText('Open'));
  const host = outside.menu!;
  act(() => {
    host.onGo('/library');
    host.onGo('/history');
  });
  expect(outside.push).not.toHaveBeenCalled();
  act(() => {
    host.onClosed();
    host.onClosed();
  });
  expect(outside.push.mock.calls).toEqual([['/library']]);
});
it('invalidates the old close callback when reopening before dismissal', () => {
  renderInApp(<App />);
  fireEvent.click(screen.getByText('Open'));
  const old = outside.menu!;
  act(() => old.onGo('/library'));
  fireEvent.click(screen.getByText('Open'));
  const next = outside.menu!;
  act(() => next.onGo('/history'));
  act(() => old.onClosed());
  expect(outside.push).not.toHaveBeenCalled();
  act(() => next.onClosed());
  expect(outside.push.mock.calls).toEqual([['/history']]);
});
it('cancels a chosen destination after a real route change', () => {
  const view = renderInApp(<App />);
  fireEvent.click(screen.getByText('Open'));
  const old = outside.menu!;
  act(() => old.onGo('/library'));
  outside.pathname = '/settings';
  view.rerender(<App />);
  act(() => old.onClosed());
  expect(outside.push).not.toHaveBeenCalled();
});
it('cancels a chosen destination after account replacement', () => {
  renderInApp(<App />);
  fireEvent.click(screen.getByText('Open'));
  const old = outside.menu!;
  act(() => old.onGo('/library'));
  act(() => outside.change?.({ user_id: 'other' }));
  act(() => old.onClosed());
  expect(outside.push).not.toHaveBeenCalled();
});
it('does not navigate after host unmount', () => {
  const view = renderInApp(<App />);
  fireEvent.click(screen.getByText('Open'));
  const old = outside.menu!;
  act(() => old.onGo('/library'));
  view.unmount();
  act(() => old.onClosed());
  expect(outside.push).not.toHaveBeenCalled();
});

let handoff: ReturnType<typeof useSheetHandoff>;
function Handoff({ enabled = true }: { enabled?: boolean }) {
  const [visible, setVisible] = useState(true);
  handoff = useSheetHandoff({ enabled, visible, onClose: () => setVisible(false) });
  return <button onClick={() => setVisible(true)}>Reopen</button>;
}
it('keeps a close handoff pending until closed, rejects duplicate execution and preserves the selected callback', () => {
  const run = vi.fn();
  renderInApp(<Handoff />);
  act(() => {
    expect(handoff.begin(run)).toBe(true);
    expect(handoff.begin(run)).toBe(false);
  });
  expect(run).not.toHaveBeenCalled();
  act(() => {
    handoff.closed();
    handoff.closed();
  });
  expect(run).toHaveBeenCalledTimes(1);
});
it('revokes a domain handoff when its mounted route leaves before close completion', () => {
  const run = vi.fn();
  const view = renderInApp(<Handoff />);
  act(() => {
    handoff.begin(run);
  });
  const closing = handoff.closed;
  outside.pathname = '/history';
  view.rerender(<Handoff />);
  act(closing);
  expect(run).not.toHaveBeenCalled();
});
it('revokes a domain handoff on account change before close completion', () => {
  const run = vi.fn();
  renderInApp(<Handoff />);
  act(() => {
    handoff.begin(run);
  });
  const closing = handoff.closed;
  act(() => {
    outside.change?.({ user_id: 'other' });
  });
  act(closing);
  expect(run).not.toHaveBeenCalled();
});
it('revokes a start that becomes ineligible while closing', () => {
  const run = vi.fn();
  const view = renderInApp(<Handoff />);
  act(() => {
    handoff.begin(run);
  });
  const closing = handoff.closed;
  view.rerender(<Handoff enabled={false} />);
  act(closing);
  expect(run).not.toHaveBeenCalled();
});
it('rejects an old close after reopening while allowing the current selected action', () => {
  const oldRun = vi.fn();
  const newRun = vi.fn();
  renderInApp(<Handoff />);
  act(() => {
    handoff.begin(oldRun);
  });
  const oldClose = handoff.closed;
  fireEvent.click(screen.getByText('Reopen'));
  act(() => {
    handoff.begin(newRun);
  });
  const newClose = handoff.closed;
  act(oldClose);
  expect(oldRun).not.toHaveBeenCalled();
  expect(newRun).not.toHaveBeenCalled();
  act(newClose);
  expect(newRun).toHaveBeenCalledTimes(1);
});
it('revokes a domain handoff when its owner unmounts', () => {
  const run = vi.fn();
  const view = renderInApp(<Handoff />);
  act(() => {
    handoff.begin(run);
  });
  const closing = handoff.closed;
  view.unmount();
  act(closing);
  expect(run).not.toHaveBeenCalled();
});

function Owners() {
  const menu = useMore();
  return (
    <>
      <button onClick={() => menu?.open({ owner: 'material:new:same-id', content: () => null })}>
        Material
      </button>
      <button onClick={() => menu?.cancel('material:old:same-id')}>Practice cleanup</button>
    </>
  );
}
it('does not let a older mounted same-ID contextual owner cancel the foreground material handoff', () => {
  renderInApp(
    <MoreProvider>
      <Owners />
      <MoreHost />
    </MoreProvider>,
  );
  fireEvent.click(screen.getByText('Material'));
  fireEvent.click(screen.getByText('Practice cleanup'));
  expect(outside.menu!.visible).toBe(true);
  const host = outside.menu!;
  act(() => host.onGo('/library'));
  fireEvent.click(screen.getByText('Practice cleanup'));
  act(() => host.onClosed());
  expect(outside.push.mock.calls).toEqual([['/library']]);
});
