// The two layouts of "nothing here" (#599): the empty page inside the app, as the design draws it
// (ui_kits/app/Gaps.jsx:44–67) — untouched by the system states — and the full-screen state
// (components/core/States.jsx:45–52 `StateScreen`: a failed load, update, deleting, a crash).
// The numbers are the design's, written out: a token compared with itself would hold nothing.
//
// Declared styles only — jsdom lays nothing out; where it sits on a phone is tests/web.

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp, styleOf } from '../../../testing/render.js';
import { Btn } from '../Btn.js';
import { EmptyState } from '../EmptyState.js';
import { Section } from '../Section.js';

vi.mock('../BuddyOrb.js', () => ({
  BuddyOrb: ({ size, state }: { size: number; state?: string }) => (
    <div data-testid="orb" data-size={size} data-state={state ?? 'idle'} />
  ),
}));

/** What the component itself declares on this element (react-native-web sets it inline). */
const own = (el: Element) => (el as HTMLElement).style;

const action = (
  <Btn icon="camera" onPress={() => undefined}>
    Neues Blatt fotografieren
  </Btn>
);

describe('EmptyState as a page (Gaps.jsx `Empty`) — the content variant, unchanged', () => {
  it('is one block at the start edge: bold line 800 26/32, sentence, one action with its sign', () => {
    renderInApp(
      <EmptyState
        page
        title="Hier landen deine Blätter"
        body="Fotografier ein Blatt."
        action={action}
      />,
    );
    const head = screen.getByRole('heading', { name: 'Hier landen deine Blätter' });
    expect([
      own(head).fontSize,
      own(head).lineHeight,
      own(head).fontWeight,
      own(head).letterSpacing,
    ]).toEqual(['26px', '32px', '800', '-0.6px']);
    expect(own(head).textAlign).not.toBe('center');
    const body = screen.getByText('Fotografier ein Blatt.');
    expect([own(body).fontSize, own(body).lineHeight]).toEqual(['17px', '25px']);
    expect(own(body).textAlign).not.toBe('center');
    const block = head.parentElement?.parentElement as Element;
    expect(own(block).paddingLeft).toBe('20px');
    expect(own(block).paddingRight).toBe('20px');
    expect(own(block).paddingBottom).toBe('80px');
    expect(own(block).justifyContent).toBe('center');
    expect(styleOf(block).gap).toBe('24px');
    expect(styleOf(head.parentElement as Element).gap).toBe('8px');
    const button = screen.getByRole('button', { name: 'Neues Blatt fotografieren' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(own(button.parentElement as Element).alignSelf).toBe('flex-start');
  });

  it('draws no Buddy of its own: he is in the head', () => {
    renderInApp(<EmptyState page orb state="think" title="Leer" />);
    expect(screen.queryByTestId('orb')).toBeNull();
  });
});

describe('EmptyState as the full-screen state (States.jsx `StateScreen`)', () => {
  const show = (orb: boolean) =>
    renderInApp(
      <EmptyState
        orb={orb}
        state="think"
        title="Das hat nicht geklappt"
        body="Versuch es gleich nochmal."
        action={action}
      />,
    );

  it('sets one bold line 800 22/28 over one sentence 400 15/22 of at most 300, centred', () => {
    show(true);
    const head = screen.getByRole('heading', { name: 'Das hat nicht geklappt' });
    expect([
      own(head).fontSize,
      own(head).lineHeight,
      own(head).fontWeight,
      own(head).letterSpacing,
      own(head).textAlign,
    ]).toEqual(['22px', '28px', '800', '0px', 'center']);
    const body = own(screen.getByText('Versuch es gleich nochmal.'));
    expect([
      body.fontSize,
      body.lineHeight,
      body.fontWeight,
      body.textAlign,
      body.maxWidth,
    ]).toEqual(['15px', '22px', '400', 'center', '300px']);
  });

  it('stands 14 apart, 40 above and below, 24 at the sides, the way on 6 further down', () => {
    show(true);
    const column = screen.getByRole('heading').parentElement as Element;
    expect(own(column).alignItems).toBe('center');
    expect(styleOf(column).gap).toBe('14px');
    expect([own(column).paddingTop, own(column).paddingBottom]).toEqual(['40px', '40px']);
    expect([own(column).paddingLeft, own(column).paddingRight]).toEqual(['24px', '24px']);
    const button = screen.getByRole('button', { name: 'Neues Blatt fotografieren' });
    expect(own(button.parentElement as Element).marginTop).toBe('6px');
  });

  it('puts Buddy at 64 above the line, in the state the screen gives him — and only when asked', () => {
    const first = show(true);
    const orb = screen.getByTestId('orb');
    expect([orb.dataset.size, orb.dataset.state]).toEqual(['64', 'think']);
    // The first thing in the column, in its 14 pt rhythm: no margin of its own.
    expect(orb.parentElement?.firstElementChild).toBe(orb);
    first.unmount();
    show(false);
    expect(screen.queryByTestId('orb')).toBeNull();
  });
});

describe('Section', () => {
  it('carries the same quiet label as a list group: sentence case, no tracking', () => {
    renderInApp(
      <Section title="Darum ging es">
        <></>
      </Section>,
    );
    // ui_kits/app/More.jsx:77–79: 700 13/18, as written — never capitals.
    const label = screen.getByRole('heading', { name: 'Darum ging es' });
    expect(label.textContent).toBe('Darum ging es');
    expect(own(label).textTransform).not.toBe('uppercase');
    expect(own(label).fontSize).toBe('13px');
    expect(own(label).fontWeight).toBe('700');
    expect(own(label).letterSpacing).not.toBe('0.8px');
  });
});
