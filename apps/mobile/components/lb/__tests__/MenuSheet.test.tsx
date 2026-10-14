// The ⋯ menu is ONE list of six places, the same on every screen (#599; design
// ui_kits/app/App.jsx:125–134). Before, it was a grid of four tiles and three text links, and
// "Blatt fotografieren", "Verlauf" and "Profil" were missing — History was reachable only by URL.
//
// requires live verification in Claude Code session — the router and the chat bar's attach
// request are stand-ins here; where a tap really lands is the browser walkthrough's
// (tests/web/redesign-chat.spec.ts).

import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { router } from '../../../testing/expo-router.js';
import { renderInApp } from '../../../testing/render.js';
import { HeaderMenu } from '../HeaderMenu.js';

const attach = vi.hoisted(() => ({ askAttach: vi.fn(), attachInChat: vi.fn() }));
vi.mock('../../../lib/capture/attachRequest.js', () => attach);

const PLACES = [
  'Blatt fotografieren',
  'Dein Material',
  'Was Buddy über dich weiß',
  'Verlauf',
  'Einstellungen',
  'Profil',
];

/** The rows of the list, in the order they stand; the sheet's own "Schließen" is not one. */
function rows(): string[] {
  return within(screen.getByRole('dialog'))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '')
    .filter((name) => name !== 'Schließen');
}

beforeEach(() => {
  router.reset();
  attach.askAttach.mockClear();
  attach.attachInChat.mockClear();
});

describe('the ⋯ menu (App.jsx:125–134)', () => {
  it('lists the six places in the design’s order, and nothing else', () => {
    renderInApp(<HeaderMenu visible onClose={() => undefined} />);
    expect(rows()).toEqual(PLACES);
  });

  it('gives every place a sign of its own (#642: "Profil" wore the memory sparkle)', () => {
    renderInApp(<HeaderMenu visible onClose={() => undefined} />);
    const signs = PLACES.map(
      (name) => screen.getByRole('button', { name }).querySelector('svg')?.innerHTML ?? '',
    );
    expect(new Set(signs).size).toBe(PLACES.length);
  });

  it.each([
    ['Dein Material', '/library'],
    ['Was Buddy über dich weiß', '/memory'],
    ['Verlauf', '/history'],
    ['Einstellungen', '/settings'],
    ['Profil', '/settings/profile'],
  ])('opens %s at %s, after closing itself', async (name, path) => {
    const onClose = vi.fn();
    renderInApp(<HeaderMenu visible onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(router.pushed).toEqual([path]));
  });

  it('takes a photo through the chat bar, never on a page of its own (owner 12.10.)', async () => {
    renderInApp(<HeaderMenu visible onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Blatt fotografieren' }));
    // The stand-in router is on "/", not on the chat: she is taken back to its bar.
    await vi.waitFor(() => expect(attach.attachInChat).toHaveBeenCalledWith({ open: 'camera' }));
    expect(router.pushed).toEqual([]);
  });

  it('draws a screen’s own action as a row like the places: short label, whole sentence spoken, no chevron', () => {
    const signs = (name: string | RegExp) =>
      screen.getByRole('button', { name }).querySelectorAll('svg').length;
    renderInApp(
      <HeaderMenu
        visible
        actions={[
          {
            key: 'rename',
            label: 'Umbenennen',
            accessibilityLabel: '„Brüche“ umbenennen',
            icon: 'pencil',
            onPress: () => undefined,
          },
          {
            key: 'start',
            label: 'Was willst du üben?',
            icon: 'practice',
            leads: true,
            onPress: () => undefined,
          },
        ]}
        onClose={() => undefined}
      />,
    );
    expect(rows()).toEqual(['„Brüche“ umbenennen', 'Was willst du üben?', ...PLACES]);
    const rename = screen.getByRole('button', { name: '„Brüche“ umbenennen' });
    expect(within(rename).getByText('Umbenennen')).toBeTruthy();
    // Its sign, and nothing at its end: it does something here. A place, and an action that
    // leads on to a list of its own, end in the chevron.
    expect(signs('„Brüche“ umbenennen')).toBe(1);
    expect(signs('Was willst du üben?')).toBe(2);
    expect(signs('Verlauf')).toBe(2);
  });

  it('puts what only this screen can do before the places, and holds it while it would race', async () => {
    const rename = vi.fn();
    const actions = [
      { key: 'rename', label: 'Umbenennen', icon: 'pencil' as const, onPress: rename },
    ];
    const view = renderInApp(<HeaderMenu visible actions={actions} onClose={() => undefined} />);
    expect(rows()).toEqual(['Umbenennen', ...PLACES]);
    fireEvent.click(screen.getByRole('button', { name: 'Umbenennen' }));
    await vi.waitFor(() => expect(rename).toHaveBeenCalledTimes(1));
    view.rerender(
      <HeaderMenu visible actions={actions} canAct={false} onClose={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Umbenennen' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Verlauf' }).getAttribute('aria-disabled')).not.toBe(
      'true',
    );
  });
});
