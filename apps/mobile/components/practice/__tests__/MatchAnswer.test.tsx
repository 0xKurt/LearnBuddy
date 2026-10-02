// Zuordnen (issue #229): eine Geste — oben antippen, dann unten; ein Tipp auf etwas
// Zugeordnetes löst es wieder. Was hier festgehalten wird:
//
//   · jedes Element ist ein echter Button, und sein Name sagt die Zuordnung in Worten
//     („…, Paar 1 mit …", „…, in Nomen") — die Farbe ist nie das einzige Signal;
//   · ein Paar bekommt eine gemeinsame Pastellfarbe und ein gemeinsames Zeichen (#286), die nach
//     dem Lösen wieder frei sind; Farbe ist nie das einzige Signal;
//   · Gruppen nehmen nur etwas an, wenn oben etwas gewählt ist, und ein einsortiertes Element
//     wandert IN die Zeile seiner Gruppe (der Kasten ist der Zustand, keine Nummer); ein Tipp
//     dort nimmt es wieder heraus;
//   · „Prüfen" wartet, bis alles zugeordnet ist, und schickt dann `parts` — Ids, nie Text.
//
// Ob es auf 360×740 passt, misst der Walkthrough (tests/web/fit.ts).

import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import {
  leftShare,
  linksText,
  MatchAnswer,
  pairLook,
  stateFrom,
  tapMatch,
} from '../MatchAnswer.js';

const PAIRS = {
  type: 'match' as const,
  form: 'pairs' as const,
  left: [
    { id: 'a', text: 'Hund' },
    { id: 'b', text: 'Katze' },
    { id: 'c', text: 'Maus' },
  ],
  right: [
    { id: 'r1', text: 'mouse' },
    { id: 'r2', text: 'dog' },
    { id: 'r3', text: 'cat' },
  ],
};

const GROUPS = {
  type: 'match' as const,
  form: 'groups' as const,
  left: [
    { id: 'a', text: 'laufen' },
    { id: 'b', text: 'Haus' },
    { id: 'c', text: 'schnell' },
    { id: 'd', text: 'Baum' },
  ],
  right: [
    { id: 'r1', text: 'Nomen' },
    { id: 'r2', text: 'Verb' },
    { id: 'r3', text: 'Adjektiv' },
  ],
};

describe('one tap at a time', () => {
  it('links a pair either way round, and dissolves it with one tap on either side', () => {
    let s = tapMatch(PAIRS, { links: [], held: null }, 'a');
    expect(s).toEqual({ links: [], held: 'a' });
    s = tapMatch(PAIRS, s, 'r2');
    expect(s).toEqual({ links: [{ left: 'a', right: 'r2', n: 1 }], held: null });
    // Below first, then above.
    s = tapMatch(PAIRS, tapMatch(PAIRS, s, 'r3'), 'b');
    expect(s.links).toEqual([
      { left: 'a', right: 'r2', n: 1 },
      { left: 'b', right: 'r3', n: 2 },
    ]);
    // Tapping the partner below dissolves pair 1; its number is free again.
    s = tapMatch(PAIRS, s, 'r2');
    expect(s.links).toEqual([{ left: 'b', right: 'r3', n: 2 }]);
    s = tapMatch(PAIRS, tapMatch(PAIRS, s, 'c'), 'r1');
    expect(s.links).toContainEqual({ left: 'c', right: 'r1', n: 1 });
    // Tapping what she holds lets go; tapping another on the same side takes that instead.
    expect(tapMatch(PAIRS, { links: [], held: 'a' }, 'a').held).toBeNull();
    expect(tapMatch(PAIRS, { links: [], held: 'a' }, 'b').held).toBe('b');
  });

  it('puts an element into a group, never holds a group, and takes it out again', () => {
    expect(tapMatch(GROUPS, { links: [], held: null }, 'r1')).toEqual({ links: [], held: null });
    let s = tapMatch(GROUPS, tapMatch(GROUPS, { links: [], held: null }, 'b'), 'r1');
    s = tapMatch(GROUPS, tapMatch(GROUPS, s, 'd'), 'r1');
    expect(s.links).toEqual([
      { left: 'b', right: 'r1', n: 1 },
      { left: 'd', right: 'r1', n: 1 },
    ]);
    s = tapMatch(GROUPS, s, 'b');
    expect(s.links).toEqual([{ left: 'd', right: 'r1', n: 1 }]);
  });

  it('reads kept links and what she holds back, and nothing that is not one', () => {
    const none = { links: [], held: null };
    expect(stateFrom('{"links":[{"left":"a","right":"r2","n":1}],"held":"b"}', PAIRS)).toEqual({
      links: [{ left: 'a', right: 'r2', n: 1 }],
      held: 'b',
    });
    expect(stateFrom('', PAIRS)).toEqual(none);
    expect(stateFrom('kaputt', PAIRS)).toEqual(none);
    expect(stateFrom('[1,2]', PAIRS)).toEqual(none);
    expect(
      stateFrom(
        '{"links":[{"left":"a","right":"r2","n":1},{"left":"b","right":"r2","n":2},{"left":"x","right":"r1","n":3},{"left":"a","right":"r3","n":4}],"held":"r2"}',
        PAIRS,
      ),
    ).toEqual({ links: [{ left: 'a', right: 'r2', n: 1 }], held: null });
    // A group is never held.
    expect(stateFrom('{"links":[],"held":"r1"}', GROUPS)).toEqual(none);
  });

  it('keeps what she holds through a remount (a theme change)', async () => {
    const view = renderInApp(
      <MatchAnswer view={PAIRS} draftKey="m0" disabled={false} onSubmit={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hund, noch ohne Partner' }));
    view.unmount();
    // The draft is written on unmount, asynchronously (lib/drafts.ts).
    await new Promise((done) => setTimeout(done, 50));
    renderInApp(
      <MatchAnswer view={PAIRS} draftKey="m0" disabled={false} onSubmit={() => undefined} />,
    );
    expect(await screen.findByRole('button', { name: 'Hund, ausgewählt' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'dog, noch ohne Partner' }));
    expect(screen.getByRole('button', { name: 'Hund, Paar 1 mit dog' })).toBeDefined();
  });

  it('gives the column with the longer words more of the width, within bounds', () => {
    expect(leftShare(['Hund'], ['dog'])).toBeCloseTo(4 / 7);
    expect(leftShare(['Bundesverfassungsgericht'], ['prüft die Gesetze'])).toBe(0.66);
    expect(leftShare(['A'], ['beschließt die Gesetze'])).toBe(0.34);
  });

  it('writes the links in words the way the server does', () => {
    expect(
      linksText(PAIRS, [
        { left: 'b', right: 'r3', n: 1 },
        { left: 'a', right: 'r2', n: 2 },
      ]),
    ).toBe('Hund – dog; Katze – cat');
    expect(
      linksText(GROUPS, [
        { left: 'd', right: 'r1', n: 1 },
        { left: 'a', right: 'r2', n: 2 },
        { left: 'b', right: 'r1', n: 1 },
      ]),
    ).toBe('Nomen: Haus, Baum; Verb: laufen');
  });
});

describe('pairs she taps', () => {
  it('says every pairing in words, shows the number, and waits with "Prüfen"', () => {
    const onSubmit = vi.fn();
    renderInApp(<MatchAnswer view={PAIRS} draftKey="m1" disabled={false} onSubmit={onSubmit} />);
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(screen.getByText('Tippe links eins an, dann sein Gegenstück rechts.')).toBeDefined();
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Hund, noch ohne Partner' }));
    // The line goes once she has started.
    expect(screen.queryByText('Tippe links eins an, dann sein Gegenstück rechts.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hund, ausgewählt' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'dog, noch ohne Partner' }));
    expect(screen.getByRole('button', { name: 'Hund, Paar 1 mit dog' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'dog, Paar 1 mit Hund' })).toBeDefined();
    // A pair shares a tint AND a symbol (#286), so colour is never the only signal; no number
    // stands in the text. Both tiles carry the same symbol, and the tile reads as its word.
    const hund = screen.getByRole('button', { name: 'Hund, Paar 1 mit dog' });
    const dog = screen.getByRole('button', { name: 'dog, Paar 1 mit Hund' });
    expect(within(hund).getByText(pairLook(1).symbol)).toBeDefined();
    expect(within(dog).getByText(pairLook(1).symbol)).toBeDefined();
    expect(hund.textContent).toBe(`Hund${pairLook(1).symbol}`);
    expect(screen.queryByText('1')).toBeNull();
    // Changed her mind: one tap on the pair dissolves it.
    fireEvent.click(screen.getByRole('button', { name: 'dog, Paar 1 mit Hund' }));
    expect(screen.getByRole('button', { name: 'Hund, noch ohne Partner' })).toBeDefined();
    for (const [l, r] of [
      ['Hund', 'dog'],
      ['cat', 'Katze'],
      ['Maus', 'mouse'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `${l}, noch ohne Partner` }));
      fireEvent.click(screen.getByRole('button', { name: `${r}, noch ohne Partner` }));
    }
    expect(check().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'match',
        links: [
          { left: 'a', right: 'r2' },
          { left: 'b', right: 'r3' },
          { left: 'c', right: 'r1' },
        ],
      },
      'Hund – dog; Katze – cat; Maus – mouse',
    );
  });
});

describe('groups she sorts into', () => {
  it('opens the groups only while something is held, and names the group in words', () => {
    const onSubmit = vi.fn();
    renderInApp(<MatchAnswer view={GROUPS} draftKey="m2" disabled={false} onSubmit={onSubmit} />);
    const nomen = () => screen.getByRole('button', { name: /^Gruppe Nomen,/ });
    const nomenRow = () => screen.getByTestId('match-group-r1');
    expect(nomen().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Haus, noch in keiner Gruppe' }));
    expect(nomen().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(nomen());
    // The box is the state: Haus now stands IN the Nomen row, next to the name — no number.
    expect(within(nomenRow()).getByRole('button', { name: 'Haus, in Nomen' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Gruppe Nomen, 1 darin' })).toBeDefined();
    expect(screen.queryByText('1')).toBeNull();
    // A tap on it there takes it back out, above the groups again.
    fireEvent.click(screen.getByRole('button', { name: 'Haus, in Nomen' }));
    expect(within(nomenRow()).queryByRole('button', { name: /^Haus,/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Haus, noch in keiner Gruppe' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Haus, noch in keiner Gruppe' }));
    fireEvent.click(nomen());
    for (const [e, g] of [
      ['Baum', 'Nomen'],
      ['laufen', 'Verb'],
      ['schnell', 'Adjektiv'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `${e}, noch in keiner Gruppe` }));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Gruppe ${g},`) }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'match',
        links: [
          { left: 'b', right: 'r1' },
          { left: 'd', right: 'r1' },
          { left: 'a', right: 'r2' },
          { left: 'c', right: 'r3' },
        ],
      },
      'Nomen: Haus, Baum; Verb: laufen; Adjektiv: schnell',
    );
  });
});

describe('how a pair looks', () => {
  it('gives every pair of a pairing its own tint and symbol', () => {
    const looks = [1, 2, 3, 4].map(pairLook);
    expect(new Set(looks.map((x) => x.tone)).size).toBe(4);
    expect(new Set(looks.map((x) => x.symbol)).size).toBe(4);
  });
});
