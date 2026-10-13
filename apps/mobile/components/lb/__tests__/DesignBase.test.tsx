// The base components against the design they are built from (#599, area 2): each case names
// the line of `components/core/*.jsx` (design folder) or the rule of its readme it holds.
//
// Declared styles only — jsdom lays nothing out. Where a number has to be measured (a row's real
// height, a sheet on a phone), it belongs to tests/web.

import { Text } from 'react-native';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { pressedStyle, UI } from '../../../lib/theme/components.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { CARD_PAD } from '../../../lib/theme/space.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { toast } from '../../../lib/toast.js';
import { Banner } from '../Banner.js';
import { Btn } from '../Btn.js';
import { Card } from '../Card.js';
import { Chip } from '../Chip.js';
import { IconBtn } from '../IconBtn.js';
import { ListGroup, Row } from '../ListGroup.js';
import { Segmented } from '../Segmented.js';
import { Sheet, SHEET_TEXT } from '../Sheet.js';
import { Slot } from '../Slot.js';
import { ToastHost } from '../Toast.js';

const light = paletteOf('pastell');

/** jsdom reports colours as `rgb(r, g, b)`; the palette holds hex. */
function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
}

/**
 * What the component itself declares on this element. A style passed as a plain object reaches
 * the DOM inline; `styleOf` (getComputedStyle) lets react-native-web's reset classes win for the
 * properties they name — `font`, `border` — so those are read here.
 */
const own = (el: Element) => (el as HTMLElement).style;

/** The painted box of a button: the inner View, never the Pressable (CLAUDE.md rule 13). */
const face = (name: string) => screen.getByRole('button', { name }).firstElementChild as Element;

describe('Btn (components/core/Btn.jsx)', () => {
  it('keeps the accent tint of `soft`, which is not one of the design’s four (owner rule 2)', () => {
    renderInApp(
      <>
        <Btn variant="soft">Einstellungen</Btn>
        <Btn variant="quiet">Üben</Btn>
      </>,
    );
    expect(styleOf(face('Einstellungen')).backgroundColor).toBe(rgb(light.primaryLt));
    expect(styleOf(screen.getByText('Einstellungen')).color).toBe(rgb(light.primaryDk));
    // The design's quiet pill is the sunken one — the two must not be the same button.
    expect(styleOf(face('Üben')).backgroundColor).toBe(rgb(light.canvas));
  });

  it('answers a finger with the dip alone, and dims only where motion is reduced', () => {
    expect(pressedStyle(false, false)).toEqual({});
    expect(pressedStyle(true, false)).toEqual({ transform: [{ scale: UI.pressScale }] });
    expect(pressedStyle(true, true)).toEqual({ opacity: UI.pressed.control });
  });
});

describe('IconBtn (components/core/Btn.jsx:37)', () => {
  const glyph = (name: string) =>
    screen.getByRole('button', { name }).querySelector('svg')?.getAttribute('width');

  it('draws voice and send a step larger in any tone, every other glyph at 20', () => {
    renderInApp(
      <>
        <IconBtn icon="send" tone="quiet" accessibilityLabel="Senden" onPress={() => undefined} />
        <IconBtn
          icon="voice"
          tone="plain"
          accessibilityLabel="Gespräch"
          onPress={() => undefined}
        />
        <IconBtn icon="stop" tone="primary" accessibilityLabel="Stopp" onPress={() => undefined} />
        <IconBtn icon="close" accessibilityLabel="Schließen" onPress={() => undefined} />
      </>,
    );
    // Btn.jsx:43 — `icon === 'voice' || icon === 'send' ? 22 : 20`.
    expect(glyph('Senden')).toBe('22');
    expect(glyph('Gespräch')).toBe('22');
    expect(glyph('Stopp')).toBe('20');
    expect(glyph('Schließen')).toBe('20');
  });

  it('paints no edge of its own', () => {
    renderInApp(<IconBtn icon="close" accessibilityLabel="Schließen" onPress={() => undefined} />);
    expect(own(face('Schließen')).borderTopWidth).toBe('');
  });
});

describe('Chip (components/core/Chip.jsx)', () => {
  it('keeps one point of edge in every tone, so choosing it never changes its size', () => {
    renderInApp(
      <>
        <Chip>Tipp</Chip>
        <Chip selected>Mit Beispiel</Chip>
        <Chip tone="primary">Noch 3 Min.</Chip>
      </>,
    );
    for (const label of ['Tipp', 'Mit Beispiel', 'Noch 3 Min.']) {
      expect(own(screen.getByText(label).parentElement!).borderTopWidth, label).toBe('1px');
    }
  });

  it('hands back what the 44 pt target reaches beyond the 34 pt chip', () => {
    renderInApp(<Chip onPress={() => undefined}>Tipp</Chip>);
    const target = styleOf(screen.getByRole('button', { name: 'Tipp' }));
    expect(target.minHeight).toBe('44px');
    // 44 − 34 (`--chip-h`) = 5 above and 5 below: the row is as tall as the chip.
    expect(target.marginTop).toBe('-5px');
    expect(target.marginBottom).toBe('-5px');
    expect(styleOf(screen.getByText('Tipp').parentElement!).minHeight).toBe('34px');
  });

  it('draws a receipt on canvas with its sign and the undo glyph inside the pill', () => {
    renderInApp(
      <Chip tone="receipt" icon="calendar" endIcon="undo" onPress={() => undefined}>
        Termin Fr 14.11.
      </Chip>,
    );
    const pill = screen.getByText('Termin Fr 14.11.').parentElement!;
    expect(styleOf(pill).backgroundColor).toBe(rgb(light.canvas));
    expect(styleOf(pill).minHeight).toBe('34px');
    const sizes = Array.from(pill.querySelectorAll('svg')).map((svg) => svg.getAttribute('width'));
    // Chip.jsx:16 (icon 16) and core.card.html:26 (undo at 15).
    expect(sizes).toEqual(['16', '15']);
    // One target: the glyph is part of the chip, not a second button beside it.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('Card (components/core/Card.jsx)', () => {
  it('pads a content card with --card-pad and sets its parts --space-md apart', () => {
    renderInApp(
      <Card accessibilityLabel="Karte">
        <Text>Inhalt</Text>
      </Card>,
    );
    const card = styleOf(screen.getByLabelText('Karte'));
    // tokens/space.css `--card-pad: 20px`, `--space-md: 12px`.
    expect(card.padding).toBe('20px');
    expect(card.gap).toBe('12px');
  });

  it('lets a card whose second part brings its own edge keep its parts together', () => {
    renderInApp(
      <Card accessibilityLabel="Leiste" padding={0} joined>
        <Text>Zeile</Text>
        <Text>Mehr</Text>
      </Card>,
    );
    expect(own(screen.getByLabelText('Leiste')).gap).toBe('');
  });

  it('takes the conversation’s padding only when the caller names it', () => {
    renderInApp(
      <Card accessibilityLabel="Karte" padding={CARD_PAD.thread}>
        <Text>Inhalt</Text>
      </Card>,
    );
    expect(styleOf(screen.getByLabelText('Karte')).padding).toBe('16px');
  });

  it('paints the design’s tones and their old names alike', () => {
    renderInApp(
      <>
        <Card accessibilityLabel="selected" tone="selected">
          <Text>a</Text>
        </Card>
        <Card accessibilityLabel="primaryLt" tone="primaryLt">
          <Text>b</Text>
        </Card>
        <Card accessibilityLabel="sunken" tone="sunken">
          <Text>c</Text>
        </Card>
      </>,
    );
    const fill = (name: string) => styleOf(screen.getByLabelText(name)).backgroundColor;
    expect(fill('selected')).toBe(rgb(light.primaryLt));
    expect(fill('primaryLt')).toBe(fill('selected'));
    expect(fill('sunken')).toBe(rgb(light.canvas));
  });
});

describe('Row (components/core/List.jsx)', () => {
  it('sets its title 600 16/22 and its value 400 15/20, two points above the line under it', () => {
    renderInApp(
      <ListGroup>
        <Row title="Klasse" sub="Für deine Aufgaben" value="Klasse 7" />
      </ListGroup>,
    );
    const title = own(screen.getByText('Klasse'));
    expect([title.fontSize, title.lineHeight, title.fontWeight]).toEqual(['16px', '22px', '600']);
    const value = own(screen.getByText('Klasse 7'));
    expect([value.fontSize, value.lineHeight, value.fontWeight]).toEqual(['15px', '20px', '400']);
    expect(styleOf(screen.getByText('Klasse').parentElement!).gap).toBe('2px');
  });

  it('is at least 56 pt with ten above and below its line', () => {
    renderInApp(<Row title="Benachrichtigungen" onPress={() => undefined} />);
    const line = styleOf(face('Benachrichtigungen'));
    expect(line.minHeight).toBe('56px');
    expect(line.paddingTop).toBe('10px');
    expect(line.paddingBottom).toBe('10px');
  });

  it('draws a lone icon in the accent at 20, and a tile’s letter 700 15', () => {
    const { container } = renderInApp(
      <>
        <Row title="Für Eltern" icon="shield" />
        <Row title="Mathe" tile={{ letter: 'M', tone: 'sky' }} />
      </>,
    );
    const icon = container.querySelector('svg')!;
    expect(icon.getAttribute('width')).toBe('20');
    expect(icon.innerHTML).toContain(light.primaryDk);
    const letter = own(screen.getByText('M'));
    expect([letter.fontSize, letter.fontWeight]).toEqual(['15px', '700']);
  });

  it('holds more of the row under its line, inside the same padding', () => {
    renderInApp(
      <Row title="Aussehen">
        <Text>Hell</Text>
      </Row>,
    );
    const slot = styleOf(screen.getByText('Hell').parentElement!);
    expect(slot.paddingLeft).toBe('16px');
    // 12 between the line and what follows: the line's own 10 and these 2.
    expect(slot.paddingTop).toBe('2px');
    expect(slot.paddingBottom).toBe('10px');
  });

  it('ends in one 32 pt action with a full target, in the chevron’s place', () => {
    const { container } = renderInApp(
      <Row
        title="Brüche"
        onPress={() => undefined}
        action={{ label: 'Üben', onPress: () => undefined }}
      />,
    );
    const action = screen.getByRole('button', { name: 'Üben' });
    expect(styleOf(action).minHeight).toBe('44px');
    expect(styleOf(action.firstElementChild as Element).height).toBe('32px');
    expect(action.parentElement?.closest('button')).toBeNull();
    // Its own arrow, and no chevron beside it.
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('Sheet (components/core/Sheet.jsx)', () => {
  it('sets its title four points in and its parts sixteen apart', () => {
    renderInApp(
      <Sheet visible title="Mehr" closeLabel="Schließen" onClose={() => undefined}>
        <Text>Inhalt</Text>
      </Sheet>,
    );
    const title = screen.getByRole('heading', { name: 'Mehr' });
    expect(styleOf(title).paddingLeft).toBe('4px');
    // A caller's loose line of text takes the same inset, so both start on one edge.
    expect(SHEET_TEXT).toEqual({ paddingHorizontal: 4 });
    const head = styleOf(title.parentElement!);
    expect(head.gap).toBe('16px');
    expect(head.paddingBottom).toBe('16px');
    expect(styleOf(screen.getByText('Inhalt').parentElement!).gap).toBe('16px');
  });

  it('needs no title, and still closes with its own button (CLAUDE.md rule 14)', () => {
    renderInApp(
      <Sheet visible closeLabel="Schließen" onClose={() => undefined}>
        <Text>Inhalt</Text>
      </Sheet>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeDefined();
  });

  it('leaves thirty under its last part, more where the home indicator asks for it', () => {
    renderInApp(
      <Sheet visible title="Mehr" closeLabel="Schließen" onClose={() => undefined}>
        <Text>Inhalt</Text>
      </Sheet>,
    );
    // jsdom measures no safe area, so this is the sheet on a screen without a home indicator.
    const head = screen.getByRole('heading', { name: 'Mehr' }).parentElement!;
    const sheet = head.parentElement!.parentElement!;
    expect(own(sheet).paddingBottom).toBe(`${UI.sheet.bottomPad}px`);
    expect(UI.sheet.bottomPad).toBe(30);
  });
});

describe('Segmented (components/core/Segmented.jsx)', () => {
  it('keeps its segments on one line', () => {
    renderInApp(
      <Segmented
        options={[
          { value: 'system', label: 'Wie das Handy' },
          { value: 'light', label: 'Hell' },
          { value: 'dark', label: 'Dunkel' },
        ]}
        value="light"
        onChange={() => undefined}
      />,
    );
    const track = styleOf(screen.getByRole('radiogroup'));
    expect(track.flexDirection).toBe('row');
    expect(track.flexWrap).not.toBe('wrap');
  });
});

describe('text that carried a bare size and weight (owner rule 4)', () => {
  // The face itself cannot be read here: jsdom drops a `font-family` it does not know. That
  // these are Figtree is measured in the browser (tests/web/redesign-reset.spec.ts, the toast);
  // this holds that giving them the face changed neither size nor weight.
  it('keeps the size and weight of a banner, a filled slot and the toast', async () => {
    renderInApp(
      <>
        <Banner>Offline</Banner>
        <Slot
          value="Haus"
          current={false}
          disabled={false}
          onPress={() => undefined}
          accessibilityLabel="Lücke 1"
        />
        <ToastHost />
      </>,
    );
    const banner = own(screen.getByText('Offline'));
    expect([banner.fontSize, banner.lineHeight, banner.fontWeight]).toEqual([
      '14px',
      '20px',
      '500',
    ]);
    const word = own(screen.getByText('Haus'));
    expect([word.fontSize, word.fontWeight]).toEqual(['17px', '600']);

    act(() =>
      toast.show('Das hat nicht geklappt', 'error', {
        action: { label: 'Nochmal', run: () => undefined },
      }),
    );
    const words = own(await screen.findByText('Das hat nicht geklappt'));
    expect([words.fontSize, words.lineHeight, words.fontWeight]).toEqual(['15px', '21px', '400']);
    const mark = own(screen.getByText('!'));
    expect([mark.fontSize, mark.lineHeight, mark.fontWeight]).toEqual(['14px', '18px', '700']);
    const offer = own(screen.getByText('Nochmal'));
    expect([offer.fontSize, offer.fontWeight]).toEqual(['15px', '700']);
    act(() => toast.hide());
  });
});
