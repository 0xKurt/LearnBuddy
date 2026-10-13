// Zuordnen (issue #229): eine Geste — oben antippen, dann unten; ein Tipp auf etwas
// Zugeordnetes löst es wieder. Was hier festgehalten wird:
//
//   · jedes Element ist ein echter Button, und sein Name sagt die Zuordnung in Worten
//     („Hund – dog, Paar", „…, in Nomen");
//   · ein gebildetes Paar ist EINE Zeile „links → rechts" (#524), ohne Zeichen und ohne
//     Farbcode; ein Tipp darauf löst es, und beide Kacheln stehen wieder in ihren Spalten;
//   · Gruppen nehmen nur etwas an, wenn oben etwas gewählt ist, und ein einsortiertes Element
//     wandert IN die Zeile seiner Gruppe (der Kasten ist der Zustand, keine Nummer); ein Tipp
//     dort nimmt es wieder heraus;
//   · „Prüfen" wartet, bis alles zugeordnet ist, und schickt dann `parts` — Ids, nie Text.
//
// Ob es auf 360×740 passt, misst der Walkthrough (tests/web/fit.ts).

import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { linksText, MatchAnswer, stateFrom, tapMatch } from '../MatchAnswer.js';

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
    expect(s).toEqual({ links: [{ left: 'a', right: 'r2' }], held: null });
    // Below first, then above.
    s = tapMatch(PAIRS, tapMatch(PAIRS, s, 'r3'), 'b');
    expect(s.links).toEqual([
      { left: 'a', right: 'r2' },
      { left: 'b', right: 'r3' },
    ]);
    // Tapping the partner dissolves the pair.
    s = tapMatch(PAIRS, s, 'r2');
    expect(s.links).toEqual([{ left: 'b', right: 'r3' }]);
    s = tapMatch(PAIRS, tapMatch(PAIRS, s, 'c'), 'r1');
    expect(s.links).toContainEqual({ left: 'c', right: 'r1' });
    // Tapping what she holds lets go; tapping another on the same side takes that instead.
    expect(tapMatch(PAIRS, { links: [], held: 'a' }, 'a').held).toBeNull();
    expect(tapMatch(PAIRS, { links: [], held: 'a' }, 'b').held).toBe('b');
  });

  it('puts an element into a group, never holds a group, and takes it out again', () => {
    expect(tapMatch(GROUPS, { links: [], held: null }, 'r1')).toEqual({ links: [], held: null });
    let s = tapMatch(GROUPS, tapMatch(GROUPS, { links: [], held: null }, 'b'), 'r1');
    s = tapMatch(GROUPS, tapMatch(GROUPS, s, 'd'), 'r1');
    expect(s.links).toEqual([
      { left: 'b', right: 'r1' },
      { left: 'd', right: 'r1' },
    ]);
    s = tapMatch(GROUPS, s, 'b');
    expect(s.links).toEqual([{ left: 'd', right: 'r1' }]);
  });

  it('reads kept links and what she holds back, and nothing that is not one', () => {
    const none = { links: [], held: null };
    expect(stateFrom('{"links":[{"left":"a","right":"r2"}],"held":"b"}', PAIRS)).toEqual({
      links: [{ left: 'a', right: 'r2' }],
      held: 'b',
    });
    expect(stateFrom('', PAIRS)).toEqual(none);
    expect(stateFrom('kaputt', PAIRS)).toEqual(none);
    expect(stateFrom('[1,2]', PAIRS)).toEqual(none);
    expect(
      stateFrom(
        '{"links":[{"left":"a","right":"r2"},{"left":"b","right":"r2"},{"left":"x","right":"r1"},{"left":"a","right":"r3"}],"held":"r2"}',
        PAIRS,
      ),
    ).toEqual({ links: [{ left: 'a', right: 'r2' }], held: null });
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
    expect(screen.getByRole('button', { name: 'Hund – dog, Paar' })).toBeDefined();
  });

  it('reads a draft an older app kept with pair numbers', () => {
    expect(stateFrom('{"links":[{"left":"a","right":"r2","n":3}],"held":null}', PAIRS)).toEqual({
      links: [{ left: 'a', right: 'r2' }],
      held: null,
    });
  });

  it('writes the links in words the way the server does', () => {
    expect(
      linksText(PAIRS, [
        { left: 'b', right: 'r3' },
        { left: 'a', right: 'r2' },
      ]),
    ).toBe('Hund – dog; Katze – cat');
    expect(
      linksText(GROUPS, [
        { left: 'd', right: 'r1' },
        { left: 'a', right: 'r2' },
        { left: 'b', right: 'r1' },
      ]),
    ).toBe('Nomen: Haus, Baum; Verb: laufen');
  });
});

describe('pairs she taps', () => {
  it('makes a formed pair one row, says it in words, and waits with "Prüfen" (issue #524)', () => {
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
    // One row, left then right: the two tiles are gone from their columns.
    const row = screen.getByRole('button', { name: 'Hund – dog, Paar' });
    expect(screen.queryByRole('button', { name: /^Hund,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^dog,/ })).toBeNull();
    // No symbol, no number: the row is its words, left then right.
    expect(row.textContent).toBe('Hund → dog');
    for (const mark of ['●', '▲', '■', '◆', '1']) expect(screen.queryByText(mark)).toBeNull();
    // Changed her mind: one tap on the pair dissolves it.
    fireEvent.click(screen.getByRole('button', { name: 'Hund – dog, Paar' }));
    expect(screen.getByRole('button', { name: 'Hund, noch ohne Partner' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'dog, noch ohne Partner' })).toBeDefined();
    for (const [l, r] of [
      ['Hund', 'dog'],
      ['cat', 'Katze'],
      ['Maus', 'mouse'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `${l}, noch ohne Partner` }));
      fireEvent.click(screen.getByRole('button', { name: `${r}, noch ohne Partner` }));
    }
    // Every pair is a row, in the order of the left column.
    expect(
      screen.getAllByRole('button', { name: /, Paar$/ }).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Hund – dog, Paar', 'Katze – cat, Paar', 'Maus – mouse, Paar']);
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

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('the look of a matching (design components/practice/Tasks.jsx, #599)', () => {
  const p = paletteOf('pastell');

  it('writes a pairing’s tiles in ink, held or not — the state is the frame, not the words', () => {
    renderInApp(
      <MatchAnswer view={PAIRS} draftKey="look-m1" disabled={false} onSubmit={() => undefined} />,
    );
    expect(styleOf(screen.getByText('Hund')).color).toBe(rgb(p.ink));
    fireEvent.click(screen.getByRole('button', { name: 'Hund, noch ohne Partner' }));
    const held = screen.getByRole('button', { name: 'Hund, ausgewählt' });
    expect(styleOf(screen.getByText('Hund')).color).toBe(rgb(p.ink));
    const face = styleOf(held.firstElementChild!);
    expect(face.backgroundColor).toBe(rgb(p.primaryLt));
    expect([face.borderTopWidth, face.borderTopColor]).toEqual(['2px', rgb(p.primary)]);
  });

  it('shows an empty group its dashed place "leer", which is drawn and not read', () => {
    renderInApp(
      <MatchAnswer view={GROUPS} draftKey="look-m2" disabled={false} onSubmit={() => undefined} />,
    );
    const row = () => screen.getByTestId('match-group-r1');
    const empty = within(row()).getByText('leer');
    expect(empty.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'leer' })).toBeNull();
    // The group's name is words on its card; the card itself is the one target.
    expect(within(row()).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Haus, noch in keiner Gruppe' }));
    fireEvent.click(screen.getByRole('button', { name: /^Gruppe Nomen,/ }));
    expect(within(row()).queryByText('leer')).toBeNull();
    // The other groups are still empty.
    expect(within(screen.getByTestId('match-group-r2')).getByText('leer')).toBeTruthy();
  });

  it('sets the things of a grouping as word pills: free on paper, sorted light primary', () => {
    renderInApp(
      <MatchAnswer view={GROUPS} draftKey="look-m3" disabled={false} onSubmit={() => undefined} />,
    );
    const free = screen.getByRole('button', { name: 'Haus, noch in keiner Gruppe' });
    expect(styleOf(free.firstElementChild!).height).toBe('40px');
    expect(styleOf(free.firstElementChild!).backgroundColor).toBe(rgb(p.paper));
    fireEvent.click(free);
    fireEvent.click(screen.getByRole('button', { name: /^Gruppe Nomen,/ }));
    const sorted = screen.getByRole('button', { name: 'Haus, in Nomen' });
    expect(styleOf(sorted.firstElementChild!).backgroundColor).toBe(rgb(p.primaryLt));
    expect(styleOf(sorted.firstElementChild!).borderTopWidth).toBe('1px');
  });

  it('puts its one line of how-to under the board', () => {
    renderInApp(
      <MatchAnswer view={GROUPS} draftKey="look-m4" disabled={false} onSubmit={() => undefined} />,
    );
    const how = screen.getByText('Tippe oben eins an, dann seine Gruppe.');
    const lastGroup = screen.getByTestId('match-group-r3');
    expect(lastGroup.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
