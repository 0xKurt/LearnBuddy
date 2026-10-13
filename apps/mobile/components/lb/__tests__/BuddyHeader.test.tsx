// The one head of the app against the design (components/buddy/Header.jsx; owner rule 1, #599):
// what is brand type, where the orb's slot stands, and that the Vorlesen switch and ⋯ are part
// of it. Widths that only a browser can measure are tests/web's (header.spec.ts).

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { orbSlot } from '../../../lib/buddy/orbRoom.js';
import { HEADER } from '../../../lib/theme/header.js';
import { SPACE } from '../../../lib/theme/space.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { BuddyHeader } from '../BuddyHeader.js';

vi.mock('../BuddyOrb.js', () => ({
  BuddyOrb: ({ size, state }: { size: number; state: string }) => (
    <div data-testid="orb" data-size={size} data-state={state} />
  ),
}));

const menu = { onPress: () => undefined };
const back = { icon: 'back' as const, onPress: () => undefined };

it('retains the full accessible title and caller navigation while showing one real progress indicator', () => {
  const title = 'Ein langer Titel für die nächste Übung mit vielen Wörtern';
  const onBack = vi.fn();
  renderInApp(
    <BuddyHeader
      title={title}
      subtitle="2 von 5"
      menu={menu}
      leading={{ icon: 'back', label: 'Zurück', onPress: onBack }}
      progress={{ total: 5, current: 1, label: 'Übungsfortschritt' }}
    />,
  );
  expect(screen.getByRole('heading', { name: title }).textContent).toBe(title);
  expect(screen.getByText('2 von 5')).toBeTruthy();
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('5');
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('places caller timer/footer and progress in the same inset slot', () => {
  renderInApp(
    <BuddyHeader
      title="Übung"
      menu={menu}
      footer={<span>Timer 2:00</span>}
      progress={{ total: 4, current: 1, label: 'Fortschritt' }}
    />,
  );
  const slot = screen.getByTestId('buddy-header-footer');
  expect(slot.contains(screen.getByText('Timer 2:00'))).toBe(true);
  expect(slot.contains(screen.getByRole('progressbar'))).toBe(true);
  expect(slot.style.paddingLeft).toBe(`${SPACE.sm}px`);
  expect(slot.style.paddingRight).toBe(`${SPACE.sm}px`);
});

describe('the orb’s slot (Header.jsx:12,16)', () => {
  const slot = () => styleOf(screen.getByTestId(/^header-orb-/));
  const orb = () => screen.getByTestId('orb').dataset;

  it('is 1.85 × the orb wide, so the moon stays clear of the title', () => {
    renderInApp(<BuddyHeader title="LearnBuddy" menu={menu} />);
    expect(orb().size).toBe(String(HEADER.orb.brand));
    expect(slot().width).toBe(`${orbSlot(HEADER.orb.brand)}px`);
    expect(orbSlot(HEADER.orb.brand)).toBe(Math.ceil(30 * 1.85));
  });

  it('is the brand head whenever there is neither a subtitle nor a way back', () => {
    // A title alone is brand type whatever it says (a practice that could not load).
    renderInApp(<BuddyHeader title="Mathearbeit Brüche" menu={menu} />);
    expect(orb().size).toBe('30');
    expect(slot().marginLeft).toBe('-12px');
  });

  it('moves by what stands before it: 8 next to a back or close button', () => {
    renderInApp(<BuddyHeader title="Dein Material" leading={back} menu={menu} />);
    expect(orb().size).toBe('28');
    expect(slot().width).toBe(`${orbSlot(28)}px`);
    expect(slot().marginLeft).toBe('-8px');
  });

  it('keeps 12 where the orb leads the row, also beside a page title with a subtitle', () => {
    renderInApp(<BuddyHeader title="Üben" subtitle="Frage 1 von 3" menu={menu} />);
    expect(orb().size).toBe('28');
    expect(slot().marginLeft).toBe('-12px');
  });

  it('shows the state its screen gives it, idle when it gives none', () => {
    const { rerender } = renderInApp(<BuddyHeader title="Üben" menu={menu} />);
    expect(orb().state).toBe('idle');
    rerender(<BuddyHeader title="Üben" state="think" menu={menu} />);
    expect(orb().state).toBe('think');
  });
});

describe('the two controls of every head (Header.jsx:23–25)', () => {
  it('carries the Vorlesen switch and ⋯, each with a name, a role and a handler', () => {
    const onMenu = vi.fn();
    renderInApp(<BuddyHeader title="Dein Material" leading={back} menu={{ onPress: onMenu }} />);
    const sound = screen.getByRole('switch', { name: 'Vorlesen' });
    const before = sound.getAttribute('aria-checked');
    fireEvent.click(sound);
    expect(sound.getAttribute('aria-checked')).not.toBe(before);
    fireEvent.click(sound);
    fireEvent.click(screen.getByRole('button', { name: 'Mehr' }));
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('draws no ⋯ where its screen says a menu would mislead, and keeps the switch', () => {
    renderInApp(<BuddyHeader title="PIN der Eltern" leading={back} menu={null} />);
    expect(screen.queryByRole('button', { name: 'Mehr' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Vorlesen' })).toBeTruthy();
  });

  it('puts a screen’s own ⋯ where the shared one stands, after the switch', () => {
    renderInApp(
      <BuddyHeader title="Üben" leading={back} menu={{ own: <button>Eigenes Menü</button> }} />,
    );
    const sound = screen.getByRole('switch', { name: 'Vorlesen' });
    const own = screen.getByRole('button', { name: 'Eigenes Menü' });
    expect(sound.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mehr' })).toBeNull();
  });
});

// A test with time (#599, design ui_kits/app/Tasks.jsx:185 `white-space: nowrap`): the minutes
// left close the subtitle and are never cut — only what stands before them may end in "…".
describe('the subtitle’s tail', () => {
  const show = () =>
    renderInApp(
      <BuddyHeader
        title="Photosynthese – Probetest"
        subtitle="Question 1 sur 3"
        subtitleTail={{ text: 'encore 10 min', label: 'Encore 10 minutes' }}
        menu={menu}
        leading={back}
      />,
    );

  it('never shrinks, while the part before it gives way on one line', () => {
    show();
    const tail = screen.getByTestId('header-subtitle-tail');
    expect(tail.textContent).toBe(' · encore 10 min');
    expect(styleOf(tail).flexShrink).toBe('0');
    expect(styleOf(tail).whiteSpace).toBe('nowrap');
    const lead = screen.getByText('Question 1 sur 3');
    expect(styleOf(lead).flexShrink).toBe('1');
    expect(styleOf(lead).minWidth).toBe('0px');
    expect(styleOf(lead).textOverflow).toBe('ellipsis');
    // One row, in the title's column: the head's geometry is as it was.
    expect(styleOf(tail.parentElement!).flexDirection).toBe('row');
    expect(tail.parentElement).toBe(lead.parentElement);
  });

  it('says the time in full words to a screen reader', () => {
    show();
    expect(screen.getByLabelText('Encore 10 minutes')).toBe(
      screen.getByTestId('header-subtitle-tail'),
    );
  });

  it('a head without one draws its subtitle as before', () => {
    renderInApp(<BuddyHeader title="Titel" subtitle="2 von 5" menu={menu} leading={back} />);
    expect(screen.queryByTestId('header-subtitle-tail')).toBeNull();
    expect(screen.getByText('2 von 5')).toBeDefined();
  });
});
