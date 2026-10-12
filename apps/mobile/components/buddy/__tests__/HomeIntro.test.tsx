import { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { HomeIntro } from '../HomeIntro.js';

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
    fireEvent.click(screen.getByRole('button', { name: 'Ich schreibe bald eine Arbeit' }));
    expect(send).toHaveBeenLastCalledWith('Ich schreibe bald eine Arbeit');
    fireEvent.click(screen.getByRole('button', { name: 'Foto vom Arbeitsblatt' }));
    expect(photo).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Einfach mal üben' }));
    expect(send).toHaveBeenLastCalledWith('Einfach mal üben');
  });
});
