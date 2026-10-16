// The one card for what Buddy puts into the thread (#599; design components/practice/
// PracticeReady.jsx, MIGRATION §5). Before, an offer was an 86 %-wide card with a small icon, a
// grey label, a regular title and a small button, and every notice had a shape of its own.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';

/** A colour as the browser reports it. */
function cssOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
import { DrillOfferCard } from '../../learn/DrillOfferCard.js';
import { OfferCard } from '../../learn/OfferCard.js';
import { ReadyCard } from '../../learn/ReadyCard.js';
import { AreaCard } from '../AreaCard.js';
import { ChatCard, PracticeReady } from '../ChatCard.js';
import { DecisionCard } from '../DecisionCard.js';
import { WorkingNote } from '../../learn/WorkingNote.js';

const OFFER: Extract<ActionSummary, { tool: 'offer_learning' }> = {
  tool: 'offer_learning',
  kind: 'test',
  material_id: null,
  text: 'Photosynthese',
  goal_id: null,
  difficulty: null,
  direction: null,
  minutes: 10,
  startable: true,
  finished_session_id: null,
  running_session_id: null,
};

/** What a text declares for itself: jsdom's cascade lets react-native-web's reset win over it. */
const typeOf = (text: string) => screen.getByText(text).style;

/** The card's frame: the paper it is drawn on. */
const frameOf = (text: string) => {
  let node: HTMLElement | null = screen.getByText(text);
  while (node && styleOf(node).borderTopLeftRadius !== '20px') node = node.parentElement;
  return node!;
};

describe('a practice mode’s card (components/practice/Modes.jsx:20–50)', () => {
  it('has the 40 pt tile in the mode’s tone, a quiet label, and a start as wide as its words', () => {
    renderInApp(
      <ChatCard
        mode="peach"
        icon="voice"
        label="Englisch · Rollenspiel"
        title="At the bakery"
        primary={{ label: 'Gespräch starten', icon: 'voice', fit: true, onPress: () => undefined }}
      />,
    );
    const frame = frameOf('At the bakery');
    const tile = frame.firstElementChild!.firstElementChild!;
    expect([styleOf(tile).width, styleOf(tile).height]).toEqual(['40px', '40px']);
    expect(styleOf(tile).borderTopLeftRadius).toBe('12px');
    expect(styleOf(tile).backgroundColor).toBe(cssOf(paletteOf('pastell').peach));
    expect(typeOf('Englisch · Rollenspiel').color).toBe(cssOf(paletteOf('pastell').ink2));
    // Not stretched over the card: the button's own row holds it at the start.
    const start = screen.getByRole('button', { name: 'Gespräch starten' });
    expect(styleOf(start.parentElement!).flexGrow).not.toBe('1');
    expect(start.querySelector('svg')).not.toBeNull();
  });

  it('is mint for a rehearsal', () => {
    renderInApp(<ChatCard mode="mint" icon="mic" label="Probevortrag" title="Vulkane" />);
    const tile = frameOf('Vulkane').firstElementChild!.firstElementChild!;
    expect(styleOf(tile).backgroundColor).toBe(cssOf(paletteOf('pastell').mint));
  });

  it('leaves every other card as it was: 48 pt tile, a button over the card’s width', () => {
    renderInApp(
      <ChatCard
        tone="accent"
        icon="sparkle"
        label="Übung bereit"
        title="Brüche"
        primary={{ label: "Los geht's", onPress: () => undefined }}
      />,
    );
    const tile = frameOf('Brüche').firstElementChild!.firstElementChild!;
    expect([styleOf(tile).width, styleOf(tile).height]).toEqual(['48px', '48px']);
    expect(styleOf(tile).backgroundColor).toBe(cssOf(paletteOf('pastell').primaryLt));
    const start = screen.getByRole('button', { name: "Los geht's" });
    expect(styleOf(start.parentElement!).flexGrow).toBe('1');
  });
});

describe('PracticeReady (PracticeReady.jsx:6–20)', () => {
  it('is paper, radius 20, 16 inside, with a 48 pt lavender tile, the accent label and a 700 17 title', () => {
    renderInApp(
      <PracticeReady
        label="Übung bereit"
        title="Mathearbeit Brüche"
        detail="4 Aufgaben · ca. 5 Min."
        start={{ label: "Los geht's", onPress: () => undefined }}
      />,
    );
    const frame = frameOf('Mathearbeit Brüche');
    expect(styleOf(frame).paddingTop).toBe('16px');
    expect(styleOf(frame).gap).toBe('16px');
    const tile = frame.firstElementChild!.firstElementChild!;
    expect([styleOf(tile).width, styleOf(tile).height]).toEqual(['48px', '48px']);
    expect(styleOf(tile).borderTopLeftRadius).toBe('12px');
    const title = typeOf('Mathearbeit Brüche');
    expect([title.fontWeight, title.fontSize, title.lineHeight]).toEqual(['700', '17px', '23px']);
    const label = typeOf('Übung bereit');
    expect([label.fontWeight, label.fontSize]).toEqual(['700', '13px']);
    // The label is in the accent, not the grey of a meta line.
    expect(label.color).not.toBe(typeOf('4 Aufgaben · ca. 5 Min.').color);
  });

  it('has one full-width action with the arrow', () => {
    const start = vi.fn();
    renderInApp(
      <PracticeReady
        label="Übung bereit"
        title="Brüche"
        start={{ label: "Los geht's", onPress: start }}
      />,
    );
    const button = screen.getByRole('button', { name: "Los geht's" });
    expect(styleOf(button).alignSelf).toBe('stretch');
    expect(button.querySelector('svg')).not.toBeNull();
    fireEvent.click(button);
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('says why instead of offering a button where it cannot start (issue #196)', () => {
    renderInApp(
      <PracticeReady label="Üben" title="Brüche" start={null} note="Geht gerade nicht." />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Geht gerade nicht.')).toBeTruthy();
  });
});

describe('ChatCard (PracticeReady.jsx:22–47)', () => {
  it('puts a ghost beside the one primary, and no second primary', () => {
    const primary = vi.fn();
    const secondary = vi.fn();
    renderInApp(
      <ChatCard
        tone="warn"
        icon="camera"
        title="Ich brauche das Arbeitsblatt"
        primary={{ label: 'Foto machen', onPress: primary }}
        secondary={{ label: 'Ohne Blatt', onPress: secondary }}
      />,
    );
    const main = screen.getByRole('button', { name: 'Foto machen' });
    const quiet = screen.getByRole('button', { name: 'Ohne Blatt' });
    expect(styleOf(main.parentElement!).flexGrow).toBe('1');
    expect(styleOf(quiet.firstElementChild!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    fireEvent.click(quiet);
    expect(secondary).toHaveBeenCalledTimes(1);
    expect(primary).not.toHaveBeenCalled();
  });

  it('takes the paper button while the bar on top holds the screen’s primary (HANDOFF §4)', () => {
    renderInApp(
      <ChatCard
        title="Geschafft!"
        primary={{ label: 'Ansehen', variant: 'secondary', onPress: () => undefined }}
      />,
    );
    const face = screen.getByRole('button', { name: 'Ansehen' }).firstElementChild!;
    expect(styleOf(face).borderTopWidth).toBe('1px');
  });

  it('has no tile when it is a plain question (Cards.jsx: its parts stand 12 apart)', () => {
    renderInApp(<ChatCard title="Wie lief „Mathe“?" />);
    const frame = frameOf('Wie lief „Mathe“?');
    expect(styleOf(frame).gap).toBe('12px');
    expect(frame.firstElementChild!.childElementCount).toBe(1);
  });
});

describe('every hint in the chat is that one card (MIGRATION §5)', () => {
  it('an offer to practise: what it is in the accent, its topic, "Los geht’s"', () => {
    renderInApp(<OfferCard actionId="a1" offer={OFFER} />);
    expect(screen.getByText('Probetest · mit 10 Minuten')).toBeTruthy();
    expect(typeOf('Photosynthese').fontWeight).toBe('700');
    expect(styleOf(frameOf('Photosynthese')).paddingTop).toBe('16px');
    expect(screen.getByRole('button', { name: "Los geht's" })).toBeTruthy();
  });

  it('an offer that cannot start: its line, no button (issue #196)', () => {
    renderInApp(<OfferCard actionId="a1" offer={{ ...OFFER, startable: false }} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByText('Damit kann ich leider nichts vorbereiten – probier ein Schulthema.'),
    ).toBeTruthy();
  });

  it('an offer she already worked through reads as done and opens its result (issue #630)', () => {
    // The device: "Brüche addieren – Los geht's" stood above "Geschafft! 7 Fragen" of that run.
    renderInApp(
      <OfferCard
        actionId="a1"
        offer={{ ...OFFER, finished_session_id: '00000000-0000-4000-8000-0000000000aa' }}
      />,
    );
    expect(screen.queryByRole('button', { name: "Los geht's" })).toBeNull();
    // "Geschafft!" is the result card's word, said once (#625): the offer carries the fact.
    expect(screen.queryByText('Geschafft!')).toBeNull();
    expect(screen.getByText('Geübt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ansehen' })).toBeTruthy();
  });

  it('practice that waits, shown when Buddy points to it: one start (issue #630)', () => {
    const ready: Extract<ActionSummary, { tool: 'show_ready' }> = {
      tool: 'show_ready',
      step_id: '00000000-0000-4000-8000-0000000000bb',
      title: 'Arbeitsblatt Brüche',
      question_count: 7,
      est_minutes: 6,
      ready: true,
      outcome: null,
    };
    const { unmount } = renderInApp(<ReadyCard ready={ready} />);
    expect(screen.getByText('Arbeitsblatt Brüche')).toBeTruthy();
    expect(screen.getByRole('button', { name: "Los geht's" })).toBeTruthy();
    unmount();
  });

  it('practice she started stays in the history and says where it went (issue #844)', () => {
    // Device 16.10.: once a second practice began, the first one's card left the thread and
    // under "Deine Fragen … sind fertig" nothing stood any more.
    const base: Extract<ActionSummary, { tool: 'show_ready' }> = {
      tool: 'show_ready',
      step_id: '00000000-0000-4000-8000-0000000000bb',
      title: 'Arbeitsblatt Brüche',
      question_count: 7,
      est_minutes: 6,
      ready: false,
      outcome: null,
    };
    const run = '00000000-0000-4000-8000-0000000000cc';
    let view = renderInApp(
      <ReadyCard ready={{ ...base, outcome: { state: 'running', session_id: run, left: 5 } }} />,
    );
    expect(screen.getByText('Arbeitsblatt Brüche')).toBeTruthy();
    expect(screen.getByText('Noch 5 Aufgaben')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Weitermachen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Los geht's" })).toBeNull();
    view.unmount();
    view = renderInApp(
      <ReadyCard ready={{ ...base, outcome: { state: 'done', session_id: run } }} />,
    );
    expect(screen.getByText('Arbeitsblatt Brüche')).toBeTruthy();
    expect(screen.getByText('Geübt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ansehen' })).toBeTruthy();
    view.unmount();
    renderInApp(<ReadyCard ready={{ ...base, outcome: { state: 'closed' } }} />);
    expect(screen.getByText('Arbeitsblatt Brüche')).toBeTruthy();
    expect(screen.getByText('Nicht mehr offen')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  const DRILL: Extract<ActionSummary, { tool: 'offer_drill' }> = {
    tool: 'offer_drill',
    title: 'Einmaleins mit 6 und 7',
    range: 'times',
    rows: [6, 7],
    carry: null,
    finished_session_id: null,
  };

  it('a Kopfrechnen round (Flows.jsx:169)', () => {
    renderInApp(<DrillOfferCard actionId="a2" offer={DRILL} />);
    expect(screen.getByText('Kopfrechnen')).toBeTruthy();
    expect(styleOf(frameOf('Einmaleins mit 6 und 7')).paddingTop).toBe('16px');
    expect(screen.getByRole('button', { name: "Los geht's" })).toBeTruthy();
  });

  it('a round that ended reads as done, not as a start that opens its end (issue #643)', () => {
    renderInApp(
      <DrillOfferCard
        actionId="a2"
        offer={{ ...DRILL, finished_session_id: '00000000-0000-4000-8000-0000000000cc' }}
      />,
    );
    expect(screen.queryByRole('button', { name: "Los geht's" })).toBeNull();
    expect(screen.queryByText('Geschafft!')).toBeNull();
    expect(screen.getByText('Geübt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ansehen' })).toBeTruthy();
  });

  it('a place Buddy points to', () => {
    renderInApp(<AreaCard area="library" />);
    expect(styleOf(frameOf('Dein Material')).paddingTop).toBe('16px');
    expect(screen.getByRole('button', { name: 'Dein Material öffnen' })).toBeTruthy();
  });

  it('Buddy at work: the status card with the busy mark, no second orb (Flows.jsx:151)', () => {
    renderInApp(<WorkingNote />);
    expect(styleOf(frameOf('Ich mache aus deinem Blatt gerade Übungen …')).paddingTop).toBe('16px');
    expect(screen.queryByTestId('thread-orb')).toBeNull();
  });

  it('the question whether Buddy may write first: the primary pill and a ghost (Cards.jsx:70–80)', () => {
    const onOptIn = vi.fn();
    renderInApp(
      <DecisionCard
        decision={{ type: 'contact_opt_in', can_enable_here: true, rules: null }}
        busy={false}
        onOptIn={onOptIn}
        onAdultOptIn={() => undefined}
        onOutcome={() => undefined}
      />,
    );
    expect(
      styleOf(frameOf('Darf ich dir Benachrichtigungen aufs Handy schicken?')).paddingTop,
    ).toBe('16px');
    const no = screen.getByRole('button', { name: 'Lieber nicht' });
    expect(styleOf(no.firstElementChild!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    fireEvent.click(screen.getByRole('button', { name: 'Ja, gern' }));
    expect(onOptIn).toHaveBeenCalledWith(true);
  });

  it('the contact question under a bar on top: the paper button, one violet one on the screen', () => {
    renderInApp(
      <DecisionCard
        decision={{ type: 'contact_opt_in', can_enable_here: true, rules: null }}
        busy={false}
        quiet="soft"
        onOptIn={() => undefined}
        onAdultOptIn={() => undefined}
        onOutcome={() => undefined}
      />,
    );
    const yes = screen.getByRole('button', { name: 'Ja, gern' }).firstElementChild!;
    expect(styleOf(yes).borderTopWidth).toBe('1px');
  });

  it('"Wie lief’s?": three paper pills (Cards.jsx:55–67)', () => {
    const onOutcome = vi.fn();
    renderInApp(
      <DecisionCard
        decision={{
          type: 'how_did_it_go',
          goal: {
            id: 'g1',
            kind: 'exam',
            title: 'Mathearbeit',
            subject_name: 'Mathe',
            due_date: '2026-10-12',
            days_left: -1,
          },
        }}
        busy={false}
        onOptIn={() => undefined}
        onAdultOptIn={() => undefined}
        onOutcome={onOutcome}
      />,
    );
    const pills = ['Gut', 'Ging so', 'Schwer'].map((name) => screen.getByRole('button', { name }));
    expect(pills.every((pill) => styleOf(pill.firstElementChild!).borderTopWidth === '1px')).toBe(
      true,
    );
    fireEvent.click(pills[2]!);
    expect(onOutcome).toHaveBeenCalledWith('g1', 'hard');
  });
});
