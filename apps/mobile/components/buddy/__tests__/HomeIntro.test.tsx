import { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { registerLearning } from '../../../lib/learning/register.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { HomeIntro } from '../HomeIntro.js';

// The app as it runs: the learning domain adds its "Heute geübt" mark (issue #107).
registerLearning();

const home = BuddyHome.parse({
  learner: { id: '11111111-1111-4111-8111-111111111111', name: 'Lena', is_minor: true },
  now: null,
  notice: null,
  decision: null,
  done: [],
  next: [],
  thread: [],
  thread_has_more: false,
  system: { model: true, push: 'active', contact_enabled: false, scheduler: 'ok' },
  working: null,
  context_version: 1,
  practiced_today: true,
});

describe('first-visit Home', () => {
  it('stands 24 in from the sides and from the bar (Home.jsx:12)', () => {
    renderInApp(
      <HomeIntro
        h={home}
        refreshing={false}
        onRefresh={() => undefined}
        onSend={() => undefined}
        onPhoto={() => undefined}
      />,
    );
    const content = styleOf(screen.getByTestId('scroll-home').firstElementChild!);
    expect([content.paddingLeft, content.paddingRight, content.paddingBottom]).toEqual([
      '24px',
      '24px',
      '24px',
    ]);
  });

  it('greets the real learner and preserves three distinct start actions and the practiced fact', () => {
    const send = vi.fn();
    const photo = vi.fn();
    renderInApp(
      <HomeIntro
        h={home}
        refreshing={false}
        onRefresh={() => undefined}
        onSend={send}
        onPhoto={photo}
      />,
    );
    expect(screen.getByRole('heading').textContent).toContain('Hallo Lena.');
    expect(screen.getByText('Heute geübt')).toBeTruthy();
    // The design's sentence (ui_kits/app/Home.jsx:15).
    expect(
      screen.getByText(
        'Erzähl mir von deiner nächsten Arbeit oder zeig mir ein Arbeitsblatt. Ich mach daraus Übungen.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ich schreibe bald eine Arbeit' }));
    expect(send).toHaveBeenLastCalledWith('Ich schreibe bald eine Arbeit');
    fireEvent.click(screen.getByRole('button', { name: 'Foto vom Arbeitsblatt' }));
    expect(photo).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Einfach mal üben' }));
    expect(send).toHaveBeenLastCalledWith('Einfach mal üben');
  });

  // #599 correction: with the strip of pages above the Composer the list was cut after its
  // first row (360×740) and the headline under the strip (390×544). Whole or not drawn.
  it('draws neither the greeting nor the ways to start while pages are attached', () => {
    const intro = (pages: boolean) => (
      <HomeIntro
        h={home}
        refreshing={false}
        onRefresh={() => undefined}
        onSend={() => undefined}
        onPhoto={() => undefined}
        pages={pages}
      />
    );
    const view = renderInApp(intro(true));
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryByTestId('scroll-home')).toBeNull();
    // The pages are gone: everything is back.
    view.rerender(intro(false));
    expect(screen.getByRole('heading').textContent).toContain('Hallo Lena.');
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
